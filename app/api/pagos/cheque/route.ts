import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { resolverOwnerEfectivo } from "@/lib/owner-efectivo";
import { generarChequesPDF, ChequeDatos } from "@/lib/cheque-pdf";
import { slugificar } from "@/lib/format";

// Cheques desde Pagos (15 oct 2026). Dueño o Administrador (Secretaria no
// tiene Pagos). Numeración consecutiva por entidad: al imprimir, a cada pago
// sin cheque se le asigna el siguiente número de la entidad; reimprimir un
// pago que ya tiene número conserva el mismo número.

async function contexto(entityId: string | null) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return { error: NextResponse.json({ error: "Sesión expirada." }, { status: 401 }) } as const;
  if (!entityId) return { error: NextResponse.json({ error: "Falta indicar la entidad." }, { status: 400 }) } as const;

  const efectivo = await resolverOwnerEfectivo(supabase, user.email);
  let ownerId = user.id;
  if (efectivo) {
    if (efectivo.adminTier !== "administrador" || efectivo.entityIdForzado !== entityId) {
      return { error: NextResponse.json({ error: "Sin permiso para cheques." }, { status: 403 }) } as const;
    }
    ownerId = efectivo.ownerId;
  }
  return { supabase, ownerId } as const;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  const entityId: string | null = typeof body.entityId === "string" ? body.entityId : null;
  const memo: string | null = typeof body.memo === "string" && body.memo.trim() ? body.memo.trim().slice(0, 80) : null;
  const fechaRaw: string = typeof body.fecha === "string" ? body.fecha : "";
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)
    ? fechaRaw
    : new Date().toLocaleDateString("en-CA", { timeZone: "America/Puerto_Rico" });

  if (ids.length === 0) return NextResponse.json({ error: "No se seleccionó ningún pago." }, { status: 400 });
  const ctx = await contexto(entityId);
  if ("error" in ctx) return ctx.error;
  const { supabase, ownerId } = ctx;

  const { data: entidad } = await supabase
    .from("business_entities")
    .select(
      "id, name, address, ach_bank_name, ach_routing_number, ach_account_number_enc, cheque_siguiente_numero, cheque_modo, cheque_imprimir_micr"
    )
    .eq("id", entityId!)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (!entidad) return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });

  const { data: filas, error } = await supabase
    .from("vendor_retenciones")
    .select(
      "id, vendor_id, gross_amount, retention_pct, retention_amount, net_paid, period_start, period_end, entity_id, cheque_numero, cheque_fecha, cheque_memo, cheque_anulado, vendors(name)"
    )
    .in("id", ids)
    .eq("owner_id", ownerId)
    .eq("entity_id", entityId!)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const pagos = (filas ?? []) as any[];
  if (pagos.length === 0) return NextResponse.json({ error: "Ningún pago seleccionado pertenece a esta entidad." }, { status: 400 });

  const anulados = pagos.filter((p) => p.cheque_anulado);
  if (anulados.length > 0) {
    return NextResponse.json({ error: "Hay un cheque anulado en la selección. Quita ese pago." }, { status: 400 });
  }

  let cuenta: string | null = null;
  if (entidad.ach_account_number_enc) {
    try {
      cuenta = decryptSecret(entidad.ach_account_number_enc);
    } catch {
      cuenta = null;
    }
  }
  const modo = entidad.cheque_modo === "blanco" ? "blanco" : "preimpreso";
  if (modo === "blanco" && entidad.cheque_imprimir_micr && (!entidad.ach_routing_number || !cuenta)) {
    return NextResponse.json(
      { error: "Para imprimir la línea MICR falta la cuenta bancaria de la entidad (Editar negocio → Facturas → Cuenta ACH)." },
      { status: 400 }
    );
  }

  // Asigna números a los que no tienen (en el orden en que se registraron).
  let siguiente: number = entidad.cheque_siguiente_numero ?? 1001;
  const cheques: ChequeDatos[] = [];
  for (const p of pagos) {
    let numero: number | null = p.cheque_numero;
    let fechaCheque: string = p.cheque_fecha ?? fecha;
    let memoCheque: string | null = p.cheque_memo ?? memo;
    if (numero == null) {
      numero = siguiente;
      const { error: updErr } = await supabase
        .from("vendor_retenciones")
        .update({ cheque_numero: numero, cheque_fecha: fecha, cheque_memo: memo, cheque_impreso_at: new Date().toISOString() })
        .eq("id", p.id)
        .eq("owner_id", ownerId);
      if (updErr) {
        const dup = updErr.code === "23505";
        return NextResponse.json(
          { error: dup ? `El cheque #${numero} ya existe. Ajusta el próximo número en la configuración de cheques.` : updErr.message },
          { status: dup ? 409 : 500 }
        );
      }
      siguiente += 1;
      fechaCheque = fecha;
      memoCheque = memo;
    }
    const nombre = p.vendors?.name ?? "Contratista";
    cheques.push({
      numero,
      fecha: fechaCheque,
      beneficiario: nombre,
      monto: Number(p.net_paid),
      memo: memoCheque,
      bruto: Number(p.gross_amount),
      retencion: Number(p.retention_amount),
      retencionPct: Number(p.retention_pct),
      periodo: p.period_start ? `${p.period_start}${p.period_end && p.period_end !== p.period_start ? ` a ${p.period_end}` : ""}` : null,
    });
  }

  if (siguiente !== (entidad.cheque_siguiente_numero ?? 1001)) {
    await supabase.from("business_entities").update({ cheque_siguiente_numero: siguiente }).eq("id", entidad.id).eq("owner_id", ownerId);
  }

  const pdf = await generarChequesPDF(
    {
      nombre: entidad.name,
      direccion: entidad.address,
      banco: entidad.ach_bank_name,
      routing: entidad.ach_routing_number,
      cuenta,
      modo,
      imprimirMicr: !!entidad.cheque_imprimir_micr,
    },
    cheques
  );

  const nombreArchivo = `${slugificar(entidad.name)}-cheques_${fecha}.pdf`;
  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "X-Cheque-Numeros": cheques.map((c) => c.numero).join(","),
      "X-Cheque-Siguiente": String(siguiente),
    },
  });
}

// Configuración (próximo número, modo de papel, MICR) y anulación de cheques.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const entityId: string | null = typeof body.entityId === "string" ? body.entityId : null;
  const ctx = await contexto(entityId);
  if ("error" in ctx) return ctx.error;
  const { supabase, ownerId } = ctx;

  if (body.accion === "anular") {
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) return NextResponse.json({ error: "Falta el pago." }, { status: 400 });
    const { error } = await supabase
      .from("vendor_retenciones")
      .update({ cheque_anulado: true })
      .eq("id", id)
      .eq("owner_id", ownerId)
      .eq("entity_id", entityId!)
      .not("cheque_numero", "is", null);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const cambios: Record<string, unknown> = {};
  if (body.siguiente !== undefined) {
    const n = Number(body.siguiente);
    if (!Number.isInteger(n) || n < 1 || n > 99999999) {
      return NextResponse.json({ error: "Número de cheque inválido." }, { status: 400 });
    }
    cambios.cheque_siguiente_numero = n;
  }
  if (body.modo !== undefined) {
    if (body.modo !== "preimpreso" && body.modo !== "blanco") {
      return NextResponse.json({ error: "Modo de papel inválido." }, { status: 400 });
    }
    cambios.cheque_modo = body.modo;
  }
  if (body.micr !== undefined) cambios.cheque_imprimir_micr = !!body.micr;
  if (Object.keys(cambios).length === 0) return NextResponse.json({ error: "Nada que guardar." }, { status: 400 });

  const { error } = await supabase.from("business_entities").update(cambios).eq("id", entityId!).eq("owner_id", ownerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
