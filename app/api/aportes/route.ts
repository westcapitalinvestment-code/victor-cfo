import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Aportes del plan gratis ("Págate primero"): aportar a ahorro, aportar a
// inversión o pagar una deuda. No son gastos: mueven plata entre cuentas del
// propio usuario. Efectivo baja; Ahorros/Inversiones suben, o baja el saldo de
// la deuda. DELETE los deshace y revierte los saldos. La regla 50/30/20 los
// cuenta en "Ahorro y deudas".

type Sb = ReturnType<typeof createClient>;
type Cuenta = { id: string; type: string; subtype: string | null; current_balance: number | null };

const r2 = (n: number) => Math.round(n * 100) / 100;

async function cuentasDe(supabase: Sb, uid: string): Promise<Cuenta[]> {
  const { data } = await supabase
    .from("manual_accounts")
    .select("id, type, subtype, current_balance")
    .eq("owner_id", uid)
    .order("created_at", { ascending: true });
  return (data ?? []) as Cuenta[];
}

const esEfectivo = (c: Cuenta) => c.type === "depository" && (c.subtype ?? "").toLowerCase() === "cash";
const esAhorro = (c: Cuenta) => c.type === "depository" && (c.subtype ?? "").toLowerCase() === "savings";
const esInversion = (c: Cuenta) => c.type === "investment";

async function ajustar(supabase: Sb, id: string, delta: number) {
  if (!delta) return;
  const { data: c } = await supabase.from("manual_accounts").select("current_balance").eq("id", id).maybeSingle();
  if (!c) return;
  const ahora = new Date().toISOString();
  await supabase
    .from("manual_accounts")
    .update({ current_balance: r2(Number(c.current_balance || 0) + delta), balance_actualizado_en: ahora, updated_at: ahora })
    .eq("id", id);
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const tipo = body?.tipo as "ahorro" | "inversion" | "deuda" | undefined;
  const monto = r2(Number(body?.monto));
  const fecha: string =
    typeof body?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : new Date().toISOString().slice(0, 10);

  if (!tipo || !["ahorro", "inversion", "deuda"].includes(tipo))
    return NextResponse.json({ error: "Tipo de aporte no válido." }, { status: 400 });
  if (!Number.isFinite(monto) || monto <= 0)
    return NextResponse.json({ error: "Pon un monto mayor que 0." }, { status: 400 });

  const cuentas = await cuentasDe(supabase, user.id);
  const origen = cuentas.find(esEfectivo) ?? null;

  let destinoId: string | null = null;
  let deudaId: string | null = null;
  let deudaNombre: string | null = null;

  if (tipo === "deuda") {
    const id = typeof body?.deudaId === "string" ? body.deudaId : "";
    const { data: d } = await supabase
      .from("deudas_plan")
      .select("id, nombre, saldo")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (!d) return NextResponse.json({ error: "No encontré esa deuda." }, { status: 404 });
    const saldo = Number(d.saldo || 0);
    if (monto > saldo + 0.005)
      return NextResponse.json({ error: `El pago es mayor que lo que debes ($${saldo.toFixed(2)}).` }, { status: 400 });
    await supabase
      .from("deudas_plan")
      .update({ saldo: r2(Math.max(0, saldo - monto)) })
      .eq("id", d.id)
      .eq("owner_id", user.id);
    deudaId = d.id;
    deudaNombre = d.nombre;
  } else {
    let destino = cuentas.find(tipo === "ahorro" ? esAhorro : esInversion) ?? null;
    if (!destino) {
      const { data: nueva, error } = await supabase
        .from("manual_accounts")
        .insert({
          owner_id: user.id,
          name: tipo === "ahorro" ? "Ahorros" : "Inversiones",
          type: tipo === "ahorro" ? "depository" : "investment",
          subtype: tipo === "ahorro" ? "savings" : null,
          current_balance: 0,
          es_negocio: false,
          balance_actualizado_en: new Date().toISOString(),
        })
        .select("id, type, subtype, current_balance")
        .single();
      if (error || !nueva) return NextResponse.json({ error: error?.message ?? "No pude crear la cuenta." }, { status: 500 });
      destino = nueva as Cuenta;
    }
    destinoId = destino.id;
    await ajustar(supabase, destino.id, monto);
  }

  if (origen) await ajustar(supabase, origen.id, -monto);

  const { data: aporte, error } = await supabase
    .from("aportes_gratis")
    .insert({
      owner_id: user.id,
      tipo,
      monto,
      fecha,
      deuda_id: deudaId,
      deuda_nombre: deudaNombre,
      cuenta_destino_id: destinoId,
      cuenta_origen_id: origen?.id ?? null,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: aporte.id });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const { data: a } = await supabase
    .from("aportes_gratis")
    .select("id, tipo, monto, deuda_id, cuenta_destino_id, cuenta_origen_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!a) return NextResponse.json({ error: "Aporte no encontrado." }, { status: 404 });

  const monto = Number(a.monto);
  if (a.tipo === "deuda") {
    if (a.deuda_id) {
      const { data: d } = await supabase.from("deudas_plan").select("saldo").eq("id", a.deuda_id).eq("owner_id", user.id).maybeSingle();
      if (d) await supabase.from("deudas_plan").update({ saldo: r2(Number(d.saldo || 0) + monto) }).eq("id", a.deuda_id).eq("owner_id", user.id);
    }
  } else if (a.cuenta_destino_id) {
    await ajustar(supabase, a.cuenta_destino_id, -monto);
  }
  if (a.cuenta_origen_id) await ajustar(supabase, a.cuenta_origen_id, monto);

  await supabase.from("aportes_gratis").delete().eq("id", id).eq("owner_id", user.id);
  return NextResponse.json({ ok: true });
}
