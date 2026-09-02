import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verificarSesionTecnico, COOKIE_SESION_TECNICO } from "@/lib/tecnico-session";

// Helper compartido por todas las rutas /api/tecnico/* que necesitan saber
// quién es el técnico (por su cookie firmada) y qué puede hacer — evita
// repetir la misma resolución de permisos (default de la entidad vs.
// override del técnico) en cada ruta. Ver lib/tecnico-session.ts para el
// porqué de la cookie en vez de auth.uid().
export type ContextoTecnico = {
  admin: ReturnType<typeof createAdminClient>;
  tecnico: {
    id: string;
    owner_id: string;
    entity_id: string;
    name: string;
    active: boolean;
    max_discount_pct: number;
    vendor_id: string | null;
  };
  entidad: {
    id: string;
    name: string;
    ivu_applies: boolean;
    ivu_rate_estatal: number;
    ivu_rate_municipal: number;
    invoice_prefix: string;
    invoice_start_number: number;
  };
  permisos: {
    vePrecios: boolean;
    cobraVencidas: boolean;
    anadeClientes: boolean;
    aplicaDescuento: boolean;
    descuentoMaxPct: number;
  };
  approvalMode: "auto" | "manual";
};

// Payload compartido que reciben /api/tecnico/login y /api/tecnico/me al
// (re)hidratar la sesión: catálogo real (tabla `services`, la misma de
// Facturación — pedido de Joel: "los técnicos y servicios deben aparecer
// los que se entraron en pagos y facturas pq quizás son los mismos") y las
// tareas que el dueño le asignó (facturas en 'borrador' con technician_id
// = este técnico, que todavía no mandó a revisión).
export async function construirRespuestaSesion(ctx: ContextoTecnico) {
  const { data: catalogo } = await ctx.admin
    .from("services")
    .select("id, nombre, precio, ivu_exento")
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("activo", true)
    .order("nombre", { ascending: true });

  const { data: tareas } = await ctx.admin
    .from("invoices")
    .select("id, numero, total, fecha_emision, clients(name)")
    .eq("entity_id", ctx.tecnico.entity_id)
    .eq("technician_id", ctx.tecnico.id)
    .eq("estado", "borrador")
    .eq("pendiente_revision_tecnico", false)
    .order("fecha_emision", { ascending: false });

  return {
    ok: true,
    tecnico: { id: ctx.tecnico.id, name: ctx.tecnico.name },
    entidad: { name: ctx.entidad.name },
    permisos: ctx.permisos,
    approvalMode: ctx.approvalMode,
    catalogo: catalogo ?? [],
    tareas: (tareas ?? []).map((t: any) => ({
      id: t.id,
      numero: t.numero,
      total: t.total,
      fechaEmision: t.fecha_emision,
      clienteNombre: t.clients?.name ?? null,
    })),
  };
}

export async function obtenerContextoTecnico(req: NextRequest): Promise<ContextoTecnico | null> {
  const technicianId = verificarSesionTecnico(req.cookies.get(COOKIE_SESION_TECNICO)?.value);
  if (!technicianId) return null;
  return contextoDesdeTechnicianId(technicianId);
}

// Igual que obtenerContextoTecnico, pero a partir de un id ya conocido —
// lo usa /api/tecnico/login justo después de validar el PIN (todavía no
// existe la cookie de sesión en ese punto, así que no hay nada que
// verificar con verificarSesionTecnico).
export async function contextoDesdeTechnicianId(technicianId: string): Promise<ContextoTecnico | null> {
  const admin = createAdminClient();
  const { data: tecnico } = await admin
    .from("technicians")
    .select("id, owner_id, entity_id, name, active, approval_mode, max_discount_pct, vendor_id")
    .eq("id", technicianId)
    .maybeSingle();
  if (!tecnico || !tecnico.active || !tecnico.entity_id) return null;

  const { data: entidad } = await admin
    .from("business_entities")
    .select(
      "id, name, ivu_applies, ivu_rate_estatal, ivu_rate_municipal, invoice_prefix, invoice_start_number, equipo_aprobacion_default, equipo_tecnico_ve_precios, equipo_tecnico_cobra_vencidas, equipo_tecnico_anade_clientes, equipo_tecnico_aplica_descuento"
    )
    .eq("id", tecnico.entity_id)
    .maybeSingle();
  if (!entidad) return null;

  return {
    admin,
    tecnico: {
      id: tecnico.id,
      owner_id: tecnico.owner_id,
      entity_id: tecnico.entity_id,
      name: tecnico.name,
      active: tecnico.active,
      max_discount_pct: Number(tecnico.max_discount_pct ?? 0),
      vendor_id: tecnico.vendor_id,
    },
    entidad: {
      id: entidad.id,
      name: entidad.name,
      ivu_applies: !!entidad.ivu_applies,
      ivu_rate_estatal: Number(entidad.ivu_rate_estatal ?? 0),
      ivu_rate_municipal: Number(entidad.ivu_rate_municipal ?? 0),
      invoice_prefix: entidad.invoice_prefix ?? "INV",
      invoice_start_number: Number(entidad.invoice_start_number ?? 1001),
    },
    permisos: {
      vePrecios: entidad.equipo_tecnico_ve_precios ?? true,
      cobraVencidas: entidad.equipo_tecnico_cobra_vencidas ?? true,
      anadeClientes: entidad.equipo_tecnico_anade_clientes ?? true,
      aplicaDescuento: entidad.equipo_tecnico_aplica_descuento ?? false,
      descuentoMaxPct: Number(tecnico.max_discount_pct ?? 0),
    },
    approvalMode: (tecnico.approval_mode || entidad.equipo_aprobacion_default || "auto") as "auto" | "manual",
  };
}
