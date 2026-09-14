import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Reset ligero de la cuenta demo (14 sept 2026, pedido de Joel): entre cada
// visitante/reunión, quiere poder poner el perfil (nombre, apodo, edad,
// hijos) y el chat de VICTOR en blanco de nuevo, SIN tocar la data de
// negocio ya sembrada (clientes, facturas, pagos de AireFrío PR). Mismo
// contenido que reset_perfil_demo_victor_cfo.sql, pero como botón — así no
// tiene que abrir Supabase antes de cada demo.
//
// Doble guardarraíl: solo corre si users.is_demo = true (migración 0087),
// y siempre auth.uid() — nunca puede resetear a otro usuario. Cualquier
// cuenta real (is_demo = false, o sea el 99.9% de los usuarios) recibe 403
// aunque alguien le pegue directo a este endpoint.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const { data: perfil } = await supabase.from("users").select("is_demo").eq("id", user.id).maybeSingle();
  if (!perfil?.is_demo) {
    return NextResponse.json({ error: "Esta cuenta no es la cuenta demo." }, { status: 403 });
  }

  const { error: errUsers } = await supabase
    .from("users")
    .update({ full_name: null, onboarding_completed: false })
    .eq("id", user.id);
  if (errUsers) return NextResponse.json({ error: errUsers.message }, { status: 500 });

  const { error: errPerfil } = await supabase
    .from("user_profiles")
    .update({
      phone: null,
      apodo: null,
      genero: null,
      edad: null,
      situacion: null,
      tiene_hijos: null,
      hijos_detalle: null,
      perfil_completo: false,
    })
    .eq("id", user.id);
  if (errPerfil) return NextResponse.json({ error: errPerfil.message }, { status: 500 });

  await supabase.from("conversations").delete().eq("user_id", user.id);
  await supabase.from("victor_memory").delete().eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
