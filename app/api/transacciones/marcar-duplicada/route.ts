import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Desmarca (o remarca) una transacción como duplicada — usado desde
// /dashboard/gastos/duplicados cuando el detector automático (ver
// lib/duplicados.ts) se equivocó. Nunca borra nada, solo cambia el
// booleano es_duplicada; si se desmarca, también se limpia
// duplicado_de_id para no dejar una referencia colgante sin sentido.
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { transactionId, esDuplicada } = await req.json();

  if (!transactionId || typeof esDuplicada !== "boolean") {
    return NextResponse.json({ error: "Falta transactionId o esDuplicada." }, { status: 400 });
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      es_duplicada: esDuplicada,
      duplicado_de_id: esDuplicada ? undefined : null,
    })
    .eq("id", transactionId)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
