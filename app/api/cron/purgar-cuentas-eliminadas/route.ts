import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { borrarArchivoR2 } from "@/lib/r2";

export const maxDuration = 300;

// Purga real de cuentas auto-eliminadas — tarea #81, migración 0077.
// Corre DESPUÉS de que se cumplieron los 30 días de gracia
// (deletion_scheduled_for <= ahora). Ver el comentario grande en la
// migración 0077 para el porqué de cada decisión de Joel.
//
// QUÉ SE CONSERVA (por obligación legal/contable, decisión de Joel) y NO
// se toca aquí: invoices, invoice_items, clients, services, vendors,
// vendor_retenciones, vendor_480_validation. La fila de `users` tampoco se
// borra (owner_id de todo lo anterior apunta a ella) — se le limpia el
// PII y se banea el login en Supabase Auth, pero la fila se queda. Las
// filas de `business_entities` tampoco se borran (dan contexto — nombre,
// tax id — a las facturas conservadas), solo se les borra el logo/
// certificado de R2 y se limpian esas dos columnas.
//
// LÍMITE CONOCIDO (no resuelto en esta v1, documentado a propósito en vez
// de escondido): referral_rewards y socios_comisiones no se tocan aquí.
// Son registros que pueden involucrar el dinero de UN TERCERO (quien
// refirió a este usuario, o el socio que ganó una comisión por él) —
// borrarlos de golpe podría destruir el histórico de comisión de otra
// persona que no pidió eliminar nada. Si esto se vuelve un caso real,
// requiere resolverse a mano por ahora.
export async function GET(req: NextRequest) {
  const secretEsperado = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secretEsperado || auth !== `Bearer ${secretEsperado}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const ahora = new Date().toISOString();

  const { data: usuarios, error: usuariosError } = await supabase
    .from("users")
    .select("id")
    .not("deletion_scheduled_for", "is", null)
    .lte("deletion_scheduled_for", ahora)
    .is("purged_at", null);

  if (usuariosError) return NextResponse.json({ error: usuariosError.message }, { status: 500 });
  if (!usuarios || usuarios.length === 0) return NextResponse.json({ ok: true, purgados: 0 });

  let purgados = 0;
  const resultados: Record<string, unknown> = {};

  for (const u of usuarios) {
    const ownerId = u.id;
    try {
      await purgarCuenta(supabase, ownerId);
      purgados++;
      resultados[ownerId] = "ok";
    } catch (err) {
      // Aislado por usuario — si uno falla a medio camino, no bloquea a
      // los demás. deletion_scheduled_for se queda puesta, así que la
      // próxima corrida del cron lo vuelve a intentar (los pasos ya hechos
      // son idempotentes: DELETE de filas que ya no existen no falla).
      resultados[ownerId] = { error: err instanceof Error ? err.message : "Error desconocido" };
    }
  }

  return NextResponse.json({ ok: true, revisados: usuarios.length, purgados, resultados });
}

async function purgarCuenta(supabase: ReturnType<typeof createAdminClient>, ownerId: string): Promise<void> {
  const { data: entidades } = await supabase.from("business_entities").select("id, logo_r2_key, relevo_certificate_r2_key").eq("owner_id", ownerId);
  const entityIds = (entidades ?? []).map((e) => e.id);

  const { data: tecnicos } = await supabase.from("technicians").select("id").eq("owner_id", ownerId);
  const technicianIds = (tecnicos ?? []).map((t) => t.id);

  // --- 1. Borrar archivos de R2 primero (antes de borrar las filas que
  // tienen la referencia a la key) ---
  const tablasConR2: { tabla: string; columna: string }[] = [
    { tabla: "document_files", columna: "r2_key" },
    { tabla: "documents", columna: "r2_key" },
    { tabla: "pending_receipts", columna: "r2_key" },
    { tabla: "invoice_attachments", columna: "r2_key" },
    { tabla: "cotizacion_attachments", columna: "r2_key" },
    { tabla: "statement_uploads", columna: "r2_key" },
  ];
  for (const { tabla, columna } of tablasConR2) {
    const { data: filas } = await supabase.from(tabla).select(columna).eq("owner_id", ownerId);
    for (const fila of (filas ?? []) as unknown as Record<string, string | null>[]) {
      const key = fila[columna];
      if (key) {
        try {
          await borrarArchivoR2(key);
        } catch {
          // si R2 falla en un archivo puntual, seguimos con los demás —
          // no vale la pena tumbar la purga completa por un solo archivo.
        }
      }
    }
  }
  for (const e of entidades ?? []) {
    if (e.logo_r2_key) {
      try {
        await borrarArchivoR2(e.logo_r2_key);
      } catch {}
    }
    if (e.relevo_certificate_r2_key) {
      try {
        await borrarArchivoR2(e.relevo_certificate_r2_key);
      } catch {}
    }
  }

  // --- 2. Borrar filas — hijos antes que padres donde no hay CASCADE
  // garantizado, tablas directas de owner_id primero ---
  if (technicianIds.length > 0) {
    await supabase.from("technician_visit_items").delete().in("technician_id", technicianIds);
    await supabase.from("technician_visits").delete().in("technician_id", technicianIds);
  }
  if (entityIds.length > 0) {
    await supabase.from("technician_service_catalog").delete().in("entity_id", entityIds);
    await supabase.from("merchant_patterns").delete().in("entity_id", entityIds);
    await supabase.from("ivu_tracker").delete().in("entity_id", entityIds);
    await supabase.from("ivu_reconciliation").delete().in("entity_id", entityIds);
    await supabase.from("estimated_tax_payments").delete().in("entity_id", entityIds);
    await supabase.from("journal_entries").delete().in("entity_id", entityIds);
    await supabase.from("audit_log").delete().in("entity_id", entityIds);
  }

  await supabase.from("invoice_attachments").delete().eq("owner_id", ownerId);
  await supabase.from("cotizacion_attachments").delete().eq("owner_id", ownerId);
  await supabase.from("cotizaciones").delete().eq("owner_id", ownerId); // cascada a cotizacion_items
  await supabase.from("technicians").delete().eq("owner_id", ownerId);
  await supabase.from("account_members").delete().eq("owner_id", ownerId);
  await supabase.from("cpa_invitations").delete().eq("owner_id", ownerId);
  await supabase.from("admin_invitations").delete().eq("owner_id", ownerId);
  await supabase.from("transactions").delete().eq("owner_id", ownerId);
  await supabase.from("pending_receipts").delete().eq("owner_id", ownerId);
  await supabase.from("document_files").delete().eq("owner_id", ownerId);
  await supabase.from("documents").delete().eq("owner_id", ownerId);
  await supabase.from("fiscal_params").delete().eq("owner_id", ownerId);
  await supabase.from("retenciones_hacienda").delete().eq("owner_id", ownerId);
  await supabase.from("hacienda_categories").delete().eq("owner_id", ownerId);
  await supabase.from("goals").delete().eq("owner_id", ownerId);
  await supabase.from("plaid_accounts").delete().eq("owner_id", ownerId);
  await supabase.from("plaid_items").delete().eq("owner_id", ownerId);
  await supabase.from("manual_accounts").delete().eq("owner_id", ownerId);
  await supabase.from("push_subscriptions").delete().eq("owner_id", ownerId);
  await supabase.from("uso_ia_mensual").delete().eq("owner_id", ownerId);
  await supabase.from("uso_ia_log").delete().eq("owner_id", ownerId);
  await supabase.from("transaction_sync_log").delete().eq("owner_id", ownerId);
  await supabase.from("creditos_ia_ciclo").delete().eq("owner_id", ownerId);
  await supabase.from("creditos_ia_compras").delete().eq("owner_id", ownerId);
  await supabase.from("statement_uploads").delete().eq("owner_id", ownerId);
  await supabase.from("citas").delete().eq("owner_id", ownerId);

  await supabase.from("mfa_backup_codes").delete().eq("user_id", ownerId);
  await supabase.from("conversations").delete().eq("user_id", ownerId);
  await supabase.from("victor_memory").delete().eq("user_id", ownerId);

  await supabase.from("user_profiles").delete().eq("id", ownerId);

  // --- 3. business_entities y clients/services/vendors se CONSERVAN (dan
  // contexto a invoices/vendor_retenciones que también se conservan) —
  // solo se limpia el archivo de R2 ya borrado arriba. ---
  if (entityIds.length > 0) {
    await supabase
      .from("business_entities")
      .update({ logo_r2_key: null, relevo_certificate_r2_key: null })
      .in("id", entityIds);
  }

  // --- 4. Limpiar PII de la fila de `users` (se conserva, no se borra —
  // owner_id de las tablas conservadas apunta a ella) ---
  await supabase
    .from("users")
    .update({
      full_name: "Cuenta eliminada",
      pin_hash: null,
      addon_tecnicos_status: "inactivo",
      addon_tecnicos_item_id: null,
      addon_admin_status: "inactivo",
      addon_admin_item_id: null,
      addon_admin_seats: 0,
      addon_administrador_status: "inactivo",
      addon_administrador_item_id: null,
      addon_administrador_seats: 0,
      addon_entidades_status: "inactivo",
      addon_entidades_item_id: null,
      addon_entidades_seats: 0,
      purged_at: new Date().toISOString(),
    })
    .eq("id", ownerId);

  // --- 5. Banear el login en Supabase Auth — NO se borra el usuario de
  // auth.users (si estuviera en cascada con public.users, se llevaría por
  // delante las facturas/pagos que justo estamos conservando). Se banea
  // por ~100 años, que en la práctica es permanente. ---
  try {
    await supabase.auth.admin.updateUserById(ownerId, { ban_duration: "876000h" });
  } catch {
    // si esto falla no bloqueamos la purga de datos — el dato ya está
    // borrado, que es lo que más importa; el login se puede banear a mano
    // después si hiciera falta.
  }
}
