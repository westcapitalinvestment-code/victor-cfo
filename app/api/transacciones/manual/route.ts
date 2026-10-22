import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { direccionCategoriaValida } from "@/lib/direccion-categoria";

// Transacciones escritas a mano (22 oct 2026) — para el dinero que no pasa
// por un banco: efectivo, propinas, ventas en mano, un gasto que se te olvidó
// subir. Antes la única forma de meter una transacción era Plaid, CSV/PDF o
// el chat de VICTOR (que el plan gratis no tiene), así que con efectivo no
// había nada que llenar.
//
// - Siempre cuelga de una cuenta MANUAL personal (nunca de Plaid, para no
//   chocar con la sincronización). "efectivo" crea la cuenta "Efectivo" la
//   primera vez.
// - Convención de signo de siempre: gasto = monto positivo, ingreso =
//   negativo. tipo_flujo lo calcula el trigger al insertar; al editar lo
//   fijamos aquí porque el trigger es solo BEFORE INSERT.
// - Un ingreso solo puede ir a una cuenta de tipo depository (en una tarjeta
//   o préstamo, un monto negativo es un pago, no un ingreso).
// - Solo se pueden editar/borrar las filas creadas aquí (origen = 'manual').

type Tipo = "gasto" | "ingreso";

function validar(body: unknown): { error: string } | { tipo: Tipo; monto: number; fecha: string; descripcion: string; categoriaId: number | null } {
  const b = (body ?? {}) as Record<string, unknown>;
  const tipo = b.tipo === "ingreso" ? "ingreso" : b.tipo === "gasto" ? "gasto" : null;
  if (!tipo) return { error: "Elige si es un gasto o un ingreso." };
  const monto = Number(b.monto);
  if (!Number.isFinite(monto) || monto <= 0 || monto > 100_000_000) return { error: "Escribe un monto mayor que 0." };
  const fecha = typeof b.fecha === "string" ? b.fecha : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha))) return { error: "La fecha no es válida." };
  const descripcion = typeof b.descripcion === "string" ? b.descripcion.trim() : "";
  if (!descripcion) return { error: "Escribe una descripción (ej. Almuerzo, Propina, Venta en efectivo)." };
  if (descripcion.length > 120) return { error: "La descripción es muy larga (máximo 120 caracteres)." };
  const categoriaId = b.categoriaId === null || b.categoriaId === undefined || b.categoriaId === "" ? null : Number(b.categoriaId);
  if (categoriaId !== null && !Number.isFinite(categoriaId)) return { error: "La categoría no es válida." };
  return { tipo, monto: Math.round(monto * 100) / 100, fecha, descripcion, categoriaId };
}

async function resolverCategoria(
  supabase: ReturnType<typeof createClient>,
  categoriaId: number | null,
  tipo: Tipo
): Promise<{ error: string } | { id: number | null }> {
  if (categoriaId === null) return { id: null };
  const { data: cat } = await supabase.from("hacienda_categories").select("id, nombre").eq("id", categoriaId).maybeSingle();
  if (!cat) return { error: "Esa categoría no existe." };
  if (!direccionCategoriaValida(cat.nombre, tipo)) {
    return { error: `"${cat.nombre}" no cuadra con un ${tipo === "gasto" ? "gasto" : "ingreso"}. Elige una categoría del lado correcto.` };
  }
  return { id: cat.id };
}

// Sincronización con el saldo (22 oct 2026, pedido de Joel: "cada cálculo que
// entre afecte el balance"). Cada transacción a mano mueve el saldo de su
// cuenta manual: en cuentas de dinero un ingreso suma y un gasto resta; en
// tarjetas/préstamos (saldo = lo que debes) un gasto suma a la deuda. Al
// editar se revierte el efecto viejo y se aplica el nuevo; al borrar se
// revierte. Las filas que vienen de CSV/PDF NO pasan por aquí (su saldo es el
// del estado de cuenta), solo las de origen 'manual'.
function efectoEnSaldo(tipoCuenta: string, tipo: Tipo, monto: number): number {
  const esDeuda = tipoCuenta === "credit" || tipoCuenta === "loan";
  if (tipo === "ingreso") return esDeuda ? -monto : monto;
  return esDeuda ? monto : -monto;
}

async function ajustarSaldo(supabase: ReturnType<typeof createClient>, cuentaId: string, delta: number) {
  if (!delta) return;
  const { data: c } = await supabase.from("manual_accounts").select("current_balance").eq("id", cuentaId).maybeSingle();
  if (!c) return;
  const nuevo = Math.round((Number(c.current_balance || 0) + delta) * 100) / 100;
  await supabase
    .from("manual_accounts")
    .update({ current_balance: nuevo, balance_actualizado_en: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", cuentaId);
}

function mensajeDuplicado(code: string | undefined) {
  return code === "23505"
    ? "Ya tienes una transacción igual (misma cuenta, fecha, descripción y monto). Cambia un poco la descripción si es otra compra."
    : null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const v = validar(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const cuentaIdRaw = typeof body?.cuentaId === "string" ? body.cuentaId : "efectivo";

  // Resolver la cuenta manual personal.
  let cuenta: { id: string; type: string } | null = null;
  if (cuentaIdRaw === "efectivo") {
    const { data: existente } = await supabase
      .from("manual_accounts")
      .select("id, type")
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .eq("subtype", "cash")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (existente) {
      cuenta = existente;
    } else {
      const { data: nueva, error: errCuenta } = await supabase
        .from("manual_accounts")
        .insert({
          owner_id: user.id,
          name: "Efectivo",
          type: "depository",
          subtype: "cash",
          current_balance: 0,
          es_negocio: false,
          entity_id: null,
          balance_actualizado_en: new Date().toISOString(),
        })
        .select("id, type")
        .single();
      if (errCuenta || !nueva) return NextResponse.json({ error: "No se pudo crear la cuenta Efectivo." }, { status: 500 });
      cuenta = nueva;
    }
  } else {
    const { data } = await supabase
      .from("manual_accounts")
      .select("id, type")
      .eq("id", cuentaIdRaw)
      .eq("owner_id", user.id)
      .is("entity_id", null)
      .maybeSingle();
    cuenta = data;
  }
  if (!cuenta) return NextResponse.json({ error: "Esa cuenta no existe." }, { status: 400 });
  if (v.tipo === "ingreso" && cuenta.type !== "depository") {
    return NextResponse.json({ error: "Un ingreso solo se puede registrar en una cuenta de dinero (Efectivo, cheques, ahorros), no en una tarjeta o préstamo." }, { status: 400 });
  }

  const cat = await resolverCategoria(supabase, v.categoriaId, v.tipo);
  if ("error" in cat) return NextResponse.json({ error: cat.error }, { status: 400 });

  const { data: creada, error } = await supabase
    .from("transactions")
    .insert({
      owner_id: user.id,
      entity_id: null,
      manual_account_id: cuenta.id,
      plaid_account_id: null,
      origen: "manual",
      description_raw: v.descripcion,
      amount: v.tipo === "gasto" ? v.monto : -v.monto,
      fecha: v.fecha,
    })
    .select("id, tipo_flujo")
    .single();

  if (error || !creada) {
    const dup = mensajeDuplicado((error as { code?: string } | null)?.code);
    return NextResponse.json({ error: dup ?? error?.message ?? "No se pudo guardar." }, { status: dup ? 409 : 500 });
  }

  // Categoría elegida a mano le gana a la automática del trigger.
  if (cat.id !== null) {
    await supabase
      .from("transactions")
      .update({ hacienda_category_id: cat.id, is_personal: true, category_overridden_by_user: true })
      .eq("id", creada.id);
  }

  await ajustarSaldo(supabase, cuenta.id, efectoEnSaldo(cuenta.type, v.tipo, v.monto));

  return NextResponse.json({ ok: true, id: creada.id });
}

export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });
  const v = validar(body);
  if ("error" in v) return NextResponse.json({ error: v.error }, { status: 400 });

  const { data: actual } = await supabase
    .from("transactions")
    .select("id, origen, manual_account_id, amount")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!actual) return NextResponse.json({ error: "Transacción no encontrada." }, { status: 404 });
  if (actual.origen !== "manual") {
    return NextResponse.json({ error: "Solo se pueden editar las transacciones que añadiste a mano." }, { status: 403 });
  }

  const { data: cuenta } = await supabase.from("manual_accounts").select("type").eq("id", actual.manual_account_id).maybeSingle();
  if (v.tipo === "ingreso" && cuenta?.type !== "depository") {
    return NextResponse.json({ error: "Un ingreso solo se puede registrar en una cuenta de dinero, no en una tarjeta o préstamo." }, { status: 400 });
  }

  const cat = await resolverCategoria(supabase, v.categoriaId, v.tipo);
  if ("error" in cat) return NextResponse.json({ error: cat.error }, { status: 400 });

  const { error } = await supabase
    .from("transactions")
    .update({
      description_raw: v.descripcion,
      amount: v.tipo === "gasto" ? v.monto : -v.monto,
      fecha: v.fecha,
      tipo_flujo: v.tipo,
      hacienda_category_id: cat.id,
      is_personal: true,
      category_overridden_by_user: cat.id !== null,
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    const dup = mensajeDuplicado((error as { code?: string }).code);
    return NextResponse.json({ error: dup ?? error.message }, { status: dup ? 409 : 500 });
  }

  // Revertir el efecto viejo y aplicar el nuevo (misma cuenta).
  if (actual.manual_account_id && cuenta?.type) {
    const montoViejo = Math.abs(Number(actual.amount));
    const tipoViejo: Tipo = Number(actual.amount) < 0 ? "ingreso" : "gasto";
    const delta = efectoEnSaldo(cuenta.type, v.tipo, v.monto) - efectoEnSaldo(cuenta.type, tipoViejo, montoViejo);
    await ajustarSaldo(supabase, actual.manual_account_id, delta);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el id." }, { status: 400 });

  const { data: actual } = await supabase
    .from("transactions")
    .select("id, origen, manual_account_id, amount")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!actual) return NextResponse.json({ error: "Transacción no encontrada." }, { status: 404 });
  if (actual.origen !== "manual") {
    return NextResponse.json({ error: "Solo se pueden borrar las transacciones que añadiste a mano." }, { status: 403 });
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (actual.manual_account_id) {
    const { data: cuenta } = await supabase.from("manual_accounts").select("type").eq("id", actual.manual_account_id).maybeSingle();
    if (cuenta?.type) {
      const tipoViejo: Tipo = Number(actual.amount) < 0 ? "ingreso" : "gasto";
      await ajustarSaldo(supabase, actual.manual_account_id, -efectoEnSaldo(cuenta.type, tipoViejo, Math.abs(Number(actual.amount))));
    }
  }
  return NextResponse.json({ ok: true });
}
