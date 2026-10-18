import { createAdminClient } from "@/lib/supabase/admin";
import { registrarRetencionVendedor } from "@/lib/retencion-vendedor";

// Bonos de oficinas de contables para vendedores (migración 0164, 18 oct
// 2026). Reglas acordadas con Joel:
//   - $20 UNA vez por oficina cuando su primer cliente referido ya pagó.
//   - $10 UNA vez por cada cliente referido por la oficina que ya pagó y
//     sigue activo.
//   - Se pagan cada 3 meses (trimestre calendario).
// Los bonos se guardan en socios_comisiones (tipo_comision bono_oficina /
// bono_cliente) para heredar estado, retención 1062.03 y totales del panel
// de Ventas. generarBonosOficinas() es IDEMPOTENTE: se puede llamar cuantas
// veces haga falta (cron diario, cada vez que se abre un panel).

export const BONO_ACTIVACION_CENTAVOS = 2000; // $20
export const BONO_CLIENTE_CENTAVOS = 1000; // $10

type Admin = ReturnType<typeof createAdminClient>;

// Trimestre calendario en hora de Puerto Rico, ej. "2026-Q4".
export function trimestreDe(fechaISO: string): string {
  const d = new Date(new Date(fechaISO).toLocaleString("en-US", { timeZone: "America/Puerto_Rico" }));
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function trimestreActual(): string {
  return trimestreDe(new Date().toISOString());
}

// Rango [desde, hasta) en ISO del trimestre "2026-Q4" (aprox. UTC-4, Puerto Rico).
export function rangoTrimestre(trimestre: string): { desde: string; hasta: string } {
  const [y, q] = trimestre.split("-Q").map(Number);
  const mesIni = (q - 1) * 3;
  const desde = new Date(Date.UTC(y, mesIni, 1, 4, 0, 0));
  const hasta = new Date(Date.UTC(y, mesIni + 3, 1, 4, 0, 0));
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export const TRIMESTRE_LABEL = (t: string) => {
  const [y, q] = t.split("-Q");
  const meses = ["ene–mar", "abr–jun", "jul–sep", "oct–dic"][Number(q) - 1];
  return `${meses} ${y}`;
};

// Clientes elegibles de cada oficina con portal: { oficinaId -> [{ id, plan }] }.
async function clientesElegiblesPorOficina(
  admin: Admin,
  oficinas: { id: string; user_id: string; socio_id: string }[]
): Promise<Map<string, { id: string; plan: string | null }[]>> {
  const resultado = new Map<string, { id: string; plan: string | null }[]>();
  if (oficinas.length === 0) return resultado;
  const userIds = oficinas.map((o) => o.user_id);

  // (a) Clientes invitados con Firma Accountant (pagados por la firma).
  const { data: porFirma } = await admin
    .from("users")
    .select("id, plan, plan_status, billed_by_firma_id, referido_por_socio_id")
    .in("billed_by_firma_id", userIds)
    .eq("plan_status", "active");

  // (b) Clientes que entraron con el código de socio del contable.
  const { data: sociosDeContables } = await admin
    .from("socios")
    .select("id, owner_user_id")
    .in("owner_user_id", userIds);
  const socioAContable = new Map((sociosDeContables ?? []).map((s) => [s.id as string, s.owner_user_id as string]));
  const socioIds = Array.from(socioAContable.keys());

  const porCodigo: { id: string; plan: string | null; contableId: string; referido_por_socio_id: string | null }[] = [];
  if (socioIds.length) {
    const { data: usuarios } = await admin
      .from("users")
      .select("id, plan, plan_status, referido_por_socio_id")
      .in("referido_por_socio_id", socioIds)
      .eq("plan_status", "active")
      .neq("plan", "gratis");
    const ids = (usuarios ?? []).map((u) => u.id as string);
    // Solo cuentan si ya pagaron de verdad: el contable ya ganó su comisión por ellos.
    const { data: pagados } = ids.length
      ? await admin
          .from("socios_comisiones")
          .select("referred_id")
          .in("referred_id", ids)
          .in("socio_id", socioIds)
          .in("estado", ["pendiente", "pagada"])
          .in("tipo_comision", ["entrada", "recurrente", "setenta", "treinta", "unica"])
      : { data: [] as { referred_id: string }[] };
    const pagoSet = new Set((pagados ?? []).map((p) => p.referred_id as string));
    for (const u of usuarios ?? []) {
      if (!pagoSet.has(u.id as string)) continue;
      porCodigo.push({
        id: u.id as string,
        plan: (u.plan as string | null) ?? null,
        contableId: socioAContable.get(u.referido_por_socio_id as string)!,
        referido_por_socio_id: u.referido_por_socio_id as string | null,
      });
    }
  }

  const oficinaPorUsuario = new Map(oficinas.map((o) => [o.user_id, o]));
  const agregar = (contableId: string, cliente: { id: string; plan: string | null; referidoPorSocio: string | null }) => {
    const of = oficinaPorUsuario.get(contableId);
    if (!of) return;
    if (cliente.id === contableId) return;
    // Un cliente que el mismo vendedor trajo directo ya cobra su comisión normal.
    if (cliente.referidoPorSocio && cliente.referidoPorSocio === of.socio_id) return;
    const lista = resultado.get(of.id) ?? [];
    if (!lista.some((c) => c.id === cliente.id)) lista.push({ id: cliente.id, plan: cliente.plan });
    resultado.set(of.id, lista);
  };
  for (const u of porFirma ?? []) {
    agregar(u.billed_by_firma_id as string, {
      id: u.id as string,
      plan: (u.plan as string | null) ?? null,
      referidoPorSocio: (u.referido_por_socio_id as string | null) ?? null,
    });
  }
  for (const u of porCodigo) {
    agregar(u.contableId, { id: u.id, plan: u.plan, referidoPorSocio: u.referido_por_socio_id });
  }
  return resultado;
}

export async function generarBonosOficinas(admin: Admin): Promise<{ creados: number }> {
  await admin.rpc("sincronizar_oficinas_contables");

  const { data: oficinasRaw } = await admin
    .from("oficinas_contables")
    .select("id, user_id, socio_id")
    .not("user_id", "is", null)
    .not("socio_id", "is", null);
  const oficinasTodas = (oficinasRaw ?? []) as { id: string; user_id: string; socio_id: string }[];
  if (oficinasTodas.length === 0) return { creados: 0 };

  // Solo vendedores aprobados cobran bonos.
  const { data: vendedores } = await admin
    .from("socios")
    .select("id, relevo_r2_key, relevo_pct, relevo_fecha_expiracion")
    .in("id", Array.from(new Set(oficinasTodas.map((o) => o.socio_id))))
    .eq("tipo", "vendedor")
    .eq("estado", "aprobado");
  const vendedorPorId = new Map((vendedores ?? []).map((v) => [v.id as string, v]));
  const oficinas = oficinasTodas.filter((o) => vendedorPorId.has(o.socio_id));

  const elegibles = await clientesElegiblesPorOficina(admin, oficinas);

  const filas: {
    socio_id: string;
    referred_id: string;
    plan: string;
    comision_centavos: number;
    estado: string;
    tipo_comision: string;
    ciclo_numero: number;
    oficina_id: string;
  }[] = [];
  for (const of of oficinas) {
    const clientes = elegibles.get(of.id) ?? [];
    if (clientes.length === 0) continue;
    filas.push({
      socio_id: of.socio_id,
      referred_id: of.user_id,
      plan: "oficina",
      comision_centavos: BONO_ACTIVACION_CENTAVOS,
      estado: "pendiente",
      tipo_comision: "bono_oficina",
      ciclo_numero: 0,
      oficina_id: of.id,
    });
    for (const c of clientes) {
      filas.push({
        socio_id: of.socio_id,
        referred_id: c.id,
        plan: c.plan || "cliente",
        comision_centavos: BONO_CLIENTE_CENTAVOS,
        estado: "pendiente",
        tipo_comision: "bono_cliente",
        ciclo_numero: 0,
        oficina_id: of.id,
      });
    }
  }
  if (filas.length === 0) return { creados: 0 };

  // ON CONFLICT DO NOTHING: solo regresan las filas realmente nuevas.
  const { data: nuevas, error } = await admin
    .from("socios_comisiones")
    .upsert(filas, { onConflict: "referred_id,tipo_comision,ciclo_numero", ignoreDuplicates: true })
    .select("id, socio_id, comision_centavos");
  if (error) {
    console.error("No se pudieron generar los bonos de oficinas:", error);
    return { creados: 0 };
  }

  // Retención 1062.03 en orden, porque el acumulado anual importa.
  for (const n of nuevas ?? []) {
    const socio = vendedorPorId.get(n.socio_id as string);
    if (socio) await registrarRetencionVendedor(admin, { ...socio, id: socio.id as string }, n.id as string, Number(n.comision_centavos));
  }
  return { creados: (nuevas ?? []).length };
}
