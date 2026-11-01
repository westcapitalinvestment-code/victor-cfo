import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { esFounder } from "@/lib/founder";
import { decryptSecret } from "@/lib/crypto";

// Trae a un vendedor del Programa de Socios al módulo Pagos como contratista
// (1 nov 2026, pedido de Joel: "que no tenga que escribir lo mismo dos veces").
// Copia nombre, email, dirección, SSN/EIN y la cuenta bancaria que el vendedor
// llenó en su link de contrato/datos de pago. Todo ocurre en el servidor: el
// número de cuenta nunca viaja al navegador (se copia ya cifrado) y solo el
// founder puede usarlo.
const COLUMNAS_VENDOR =
  "id, name, tax_id, address, email, vendor_type, retention_type, default_retention_pct, is_corporation, active, entity_id";

async function founderAutenticado() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !esFounder(user.email)) return null;
  return { supabase, user };
}

// Lista de socios que ya completaron contrato y/o datos de pago.
export async function GET() {
  const ctx = await founderAutenticado();
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const admin = createAdminClient();
  const { data } = await admin
    .from("socios")
    .select("id, nombre, email, codigo, bank_name, account_last4, contrato_aceptado_at, datos_pago_completados_at")
    .or("contrato_aceptado_at.not.is.null,datos_pago_completados_at.not.is.null")
    .order("nombre", { ascending: true });
  const socios = (data ?? []).map((s) => ({
    id: s.id as string,
    nombre: (s.nombre as string) ?? "",
    email: (s.email as string | null) ?? "",
    codigo: (s.codigo as string | null) ?? "",
    banco: s.account_last4 ? `${s.bank_name ?? "Banco"} ··${s.account_last4}` : null,
  }));
  return NextResponse.json({ ok: true, socios });
}

export async function POST(req: NextRequest) {
  const ctx = await founderAutenticado();
  if (!ctx) return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  const { supabase, user } = ctx;

  const body = (await req.json().catch(() => null)) as {
    socioId?: string;
    entityId?: string | null;
    retentionType?: string;
    pct?: number;
  } | null;
  if (!body?.socioId) return NextResponse.json({ error: "Falta el socio." }, { status: 400 });

  const admin = createAdminClient();
  const { data: socio } = await admin
    .from("socios")
    .select("nombre, email, direccion, tax_id_encrypted, routing_number_encrypted, account_number_encrypted")
    .eq("id", body.socioId)
    .maybeSingle();
  if (!socio) return NextResponse.json({ error: "Socio no encontrado." }, { status: 404 });

  let taxId: string | null = null;
  try {
    taxId = socio.tax_id_encrypted ? decryptSecret(socio.tax_id_encrypted as string) : null;
  } catch {
    return NextResponse.json({ error: "No se pudo descifrar el SSN/EIN del socio." }, { status: 500 });
  }
  let routing: string | null = null;
  try {
    routing = socio.routing_number_encrypted ? decryptSecret(socio.routing_number_encrypted as string) : null;
  } catch {
    return NextResponse.json({ error: "No se pudo descifrar los datos bancarios del socio." }, { status: 500 });
  }

  const nombre = String(socio.nombre ?? "").trim();
  const email = String(socio.email ?? "").trim().toLowerCase() || null;
  const direccion = String(socio.direccion ?? "").trim() || null;
  if (!nombre) return NextResponse.json({ error: "El socio no tiene nombre." }, { status: 400 });

  // ¿Ya existe como contratista tuyo? (mismo SSN/EIN, email o nombre) — no se duplica.
  const { data: existentes } = await supabase.from("vendors").select("id, name, tax_id, email").eq("owner_id", user.id);
  const yaEsta = (existentes ?? []).find(
    (v) =>
      (taxId && v.tax_id && String(v.tax_id).replace(/\D/g, "") === taxId.replace(/\D/g, "")) ||
      (email && v.email && String(v.email).toLowerCase() === email) ||
      String(v.name ?? "").trim().toLowerCase() === nombre.toLowerCase()
  );

  const retentionType = body.retentionType === "480.6A" ? "480.6A" : "480.6B";
  const pct = Number.isFinite(body.pct) ? Number(body.pct) : 10;

  let vendorId: string;
  if (yaEsta) {
    vendorId = yaEsta.id as string;
    // Solo rellena lo que le falte; no pisa lo que ya escribiste a mano.
    const relleno: Record<string, unknown> = {};
    const { data: actual } = await supabase.from("vendors").select("tax_id, address, email").eq("id", vendorId).single();
    if (actual && !actual.tax_id && taxId) relleno.tax_id = taxId;
    if (actual && !actual.address && direccion) relleno.address = direccion;
    if (actual && !actual.email && email) relleno.email = email;
    if (Object.keys(relleno).length) await supabase.from("vendors").update(relleno).eq("id", vendorId);
  } else {
    const { data: nuevo, error } = await supabase
      .from("vendors")
      .insert({
        owner_id: user.id,
        entity_id: body.entityId || null,
        name: nombre,
        tax_id: taxId,
        address: direccion,
        email,
        vendor_type: "contratista_servicios",
        retention_type: retentionType,
        default_retention_pct: retentionType === "480.6A" ? 0 : pct,
        is_corporation: false,
        active: true,
      })
      .select("id")
      .single();
    if (error || !nuevo) return NextResponse.json({ error: error?.message ?? "No se pudo crear el contratista." }, { status: 500 });
    vendorId = nuevo.id as string;
  }

  // Cuenta bancaria: se copia ya cifrada (misma llave que usa la banca de contratistas).
  let bancoCopiado = false;
  if (routing && socio.account_number_encrypted) {
    const { error: eBanco } = await supabase
      .from("vendors")
      .update({
        bank_routing_number: routing,
        bank_account_number_enc: socio.account_number_encrypted,
        bank_account_type: "checking",
      })
      .eq("id", vendorId);
    bancoCopiado = !eBanco;
  }

  const { data: vendor } = await supabase.from("vendors").select(COLUMNAS_VENDOR).eq("id", vendorId).single();
  return NextResponse.json({ ok: true, vendor, existente: !!yaEsta, bancoCopiado });
}
