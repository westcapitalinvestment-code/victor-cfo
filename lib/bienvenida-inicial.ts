import { createAdminClient } from "@/lib/supabase/admin";
import { sendWelcomeGratisEmail, sendCasiTerminasEmail } from "@/lib/email";

// Bienvenida disparada por el REGISTRO, no por el pago (21 sept 2026,
// pedido de Joel — ver comentario grande en lib/email.ts junto a
// sendWelcomeGratisEmail). Se llama desde dos lugares:
//   - app/registro/page.tsx (cliente) vía POST /api/registro/bienvenida-inicial,
//     justo después de supabase.auth.signUp() — ahí puede NO haber sesión
//     todavía (si el proyecto exige confirmar el correo primero), así que esa
//     ruta es pública y usa esta función con el user.id que sí devuelve
//     signUp() aunque no haya sesión.
//   - app/auth/callback/route.ts (servidor, con sesión) tras un signup por
//     Google — se llama directo, sin pasar por la ruta pública.
//
// Idempotente por diseño (columna users.bienvenida_registro_enviada_at,
// migración 0091): puede llamarse más de una vez para el mismo usuario sin
// riesgo de mandarle el correo doble — necesario porque la ruta pública no
// tiene forma de verificar sesión.
export async function enviarBienvenidaInicial(userId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: usuario } = await admin
    .from("users")
    .select("email, full_name, plan, bienvenida_registro_enviada_at, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (!usuario || !usuario.email) return;
  if (usuario.bienvenida_registro_enviada_at) return; // ya se mandó

  // Guarda contra abuso de la ruta pública: solo dispara para cuentas
  // recién creadas (últimas 2 horas). Una cuenta vieja sin
  // bienvenida_registro_enviada_at (ej. creada antes de esta migración) no
  // recibe este correo retroactivo por esta vía — eso se maneja aparte, a
  // mano, con el botón "Reenviar bienvenida" del Dashboard de Operaciones.
  const creadaHaceMs = usuario.created_at ? Date.now() - new Date(usuario.created_at).getTime() : Infinity;
  if (creadaHaceMs > 2 * 60 * 60 * 1000) return;

  // plan==='gratis' nace así desde el trigger handle_new_user (migración
  // 0031) — cualquier otro valor en este punto (normalmente 'core', el
  // default) significa que la persona registró con intención de pagar pero
  // Stripe todavía no confirmó nada.
  const resultado =
    usuario.plan === "gratis"
      ? await sendWelcomeGratisEmail({ toEmail: usuario.email, toName: usuario.full_name ?? null })
      : await sendCasiTerminasEmail({ toEmail: usuario.email, toName: usuario.full_name ?? null });

  // Se marca como enviado incluso si el envío falló (ej. Resend caído) —
  // igual que el resto de los emails de este proyecto, esto es best-effort
  // y no debe bloquear el registro ni reintentarse en bucle contra el mismo
  // usuario en cada llamada.
  if (resultado.sent) {
    await admin.from("users").update({ bienvenida_registro_enviada_at: new Date().toISOString() }).eq("id", userId);
  }
}
