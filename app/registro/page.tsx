"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { esCicloValido, type Ciclo } from "@/lib/stripe";

// Registro real — esto es lo que faltaba para que el landing page
// (victorcfo.com) pueda mandar gente nueva a crear cuenta de verdad.
// supabase.auth.signUp() dispara el trigger 0002 (handle_new_user), que
// crea las filas en users/user_profiles con plan='core' y, desde la
// migración 0025, plan_status='incomplete' (antes 'trialing' — daba acceso
// gratis de una vez, sin cobrar nada, porque el checkout no existía).
//
// Con Stripe ya conectado (23 agosto 2026): si el signUp deja sesión
// activa de una vez (confirmación de email desactivada), se manda al
// usuario DIRECTO a pagar en Stripe Checkout — /onboarding queda para
// DESPUÉS de pagar (es el success_url del checkout). Si el proyecto tiene
// confirmación de email activada, no hay sesión todavía; en ese caso no se
// puede llamar al checkout (necesita sesión), así que el usuario confirma
// su correo, entra, y el middleware lo manda a /registro/completar-pago
// (donde puede elegir plan otra vez) la primera vez que toque /dashboard.
//
// Referidos + plan gratis (30 agosto 2026, migración 0031): esta pantalla
// ahora sirve DOS caminos, decididos por Joel — (1) alguien pagando de una
// vez (precio normal, con 30 días gratis si vino con un link ?ref=<uuid> de
// otro usuario), o (2) "Empezar gratis (limitada)" sin pasar por Stripe
// para nada — acceso completo a Bóveda/Metas/Citas/CSV, pero sin conectar
// banco ni hablar con VICTOR hasta que suba de plan. Joel fue explícito en
// que la opción de PAGAR debe ser la primaria/más prominente y la gratis la
// secundaria, en ambos casos (con o sin ?ref=). ref_id se manda en
// signUp({ options: { data: {...} } }) para que el trigger handle_new_user
// (0031) lo guarde en users.referred_by ANTES de que exista sesión
// autenticada — no hace falta un UPDATE después.
//
// Pro destapado (3 sept 2026): ya tiene los 6 Price ID reales en Stripe, así
// que dejó de forzarse todo a Core. Enterprise (proplus) sigue bloqueado —
// no aparece aquí como opción.
//
// Referido = mes gratis para los dos planes (4 sept 2026, pedido de Joel:
// "que los 2 sean iguales"). Antes Core tenía un Price ID de descuento
// permanente ($12.99/mes para siempre) mientras Pro tenía un trial de 30
// días — se unificó a "primer mes gratis, luego precio normal" para ambos
// (ver esReferidoConTrial en app/api/stripe/checkout/route.ts). Por eso ya
// no hay precio "referido" tachado aquí — el precio mostrado es siempre el
// normal, y el beneficio se comunica aparte como mensaje de "mes gratis".
const PRECIOS_REGISTRO = {
  core: {
    mensual: { normal: "14.99", sufijo: "/mes" },
    anual: { normal: "164", sufijo: "/año" },
  },
  pro: {
    mensual: { normal: "49.99", sufijo: "/mes" },
    anual: { normal: "549", sufijo: "/año" },
  },
} as const;

// Validación básica de forma de UUID — solo para decidir qué precio
// MOSTRAR en pantalla. La validación real (que ese uuid sea de verdad un
// usuario existente) vive en el trigger de Postgres (migración 0031); si
// alguien llega con un ?ref= inventado, el trigger lo descarta en
// silencio y el checkout cobra el precio normal, sin romper nada.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Programa de Socios (migración 0070, 5 sept 2026): código corto legible
// (ej. "ANA7F3K"), no un uuid — lo comparte un CPA/influencer aprobado, no
// otro usuario. A diferencia de ?ref=, esto NO cambia el precio ni da mes
// gratis (esa es la recompensa del programa peer-to-peer); solo conecta al
// nuevo usuario con el socio para que el trigger valide el código y, si
// está aprobado, registre la comisión en efectivo cuando pague de verdad
// (ver handle_new_user en 0070 y el webhook, case "invoice.paid"). Forma
// suelta a propósito — la validación real (código existe Y está
// 'aprobado') vive en el trigger de Postgres.
const SOCIO_CODIGO_RE = /^[A-Z0-9]{4,20}$/i;

function RegistroForm() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const planQuery = searchParams.get("plan");
  const cicloQuery = searchParams.get("ciclo");
  const refQuery = searchParams.get("ref");
  const socioQuery = searchParams.get("socio");
  // Core y Pro son comprables hoy (Pro destapado el 3 sept 2026 — ya tiene
  // los 6 Price ID en Stripe). Enterprise (proplus) sigue bloqueado, así que
  // si alguien llega con ?plan=proplus lo dejamos en Core, no en un plan sin
  // Price ID real. ?plan=pro sí pasa directo.
  const planInicial: "core" | "pro" = planQuery === "pro" ? "pro" : "core";
  const cicloInicial: Ciclo = esCicloValido(cicloQuery) ? cicloQuery : "mensual";
  const refId = refQuery && UUID_RE.test(refQuery) ? refQuery : null;
  const socioCodigo = socioQuery && SOCIO_CODIGO_RE.test(socioQuery) ? socioQuery.toUpperCase() : null;
  // Mes gratis para los dos programas (5 sept 2026, extendido al Programa de
  // Socios — ver esReferido en app/api/stripe/checkout/route.ts, que es
  // quien de verdad activa el trial de 30 días; esto solo decide qué
  // mensaje MOSTRAR en pantalla).
  const esReferido = !!refId || !!socioCodigo;

  const [plan, setPlan] = useState<"core" | "pro">(planInicial);
  // Toggle Mensual/Anual (10 sept 2026, pedido de Joel tras comparar con
  // Luna Money: su pantalla de pago muestra Anual con badge de ahorro justo
  // al lado de Mensual — la nuestra solo mostraba lo que venía en
  // ?ciclo= del link, sin forma de cambiarlo aquí mismo). Mismo patrón que
  // /registro/completar-pago, que ya tenía este toggle.
  const [ciclo, setCiclo] = useState<Ciclo>(cicloInicial);
  const precios = PRECIOS_REGISTRO[plan][ciclo];
  // El precio mostrado es siempre el normal — el beneficio de referido
  // (mes gratis, cualquier plan) se comunica aparte, no como precio
  // tachado. Ver comentario grande arriba de PRECIOS_REGISTRO.
  const precioMostrar = precios.normal;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<"pago" | "gratis" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [oauthEnCurso, setOauthEnCurso] = useState<"google" | "apple" | null>(null);

  // Login/registro con Google y Apple (10 sept 2026, pedido de Joel tras
  // comparar con Luna Money: ellos ofrecen un tap con Google/Apple antes de
  // pedir email+contraseña, nosotros no teníamos nada de esto — más
  // fricción, más abandono). A diferencia de signUp(), signInWithOAuth() no
  // acepta options.data (los metadatos del usuario los define el
  // proveedor) — así que el plan/ciclo/ref/socio elegidos aquí viajan como
  // query params en el redirectTo y se aplican en app/auth/callback/
  // route.ts (ver migración 0083). Solo se ofrece en el camino de PAGO —
  // Joel fue explícito en que ese debe ser el primario; "Empezar gratis"
  // se queda con email/contraseña, que ya es la ruta de menor fricción
  // porque no hay nada que cobrar.
  async function continuarConOAuth(provider: "google" | "apple") {
    setError(null);
    setOauthEnCurso(provider);

    const params = new URLSearchParams({ plan, ciclo });
    if (refId) params.set("ref", refId);
    if (socioCodigo) params.set("socio", socioCodigo);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?${params.toString()}` },
    });

    if (error) {
      setError(error.message);
      setOauthEnCurso(null);
    }
    // Si no hay error, el navegador ya está siendo redirigido al proveedor
    // — no hace falta apagar el loading, la página se va a ir de aquí.
  }

  async function crearCuenta(esGratis: boolean) {
    if (!email || !password) {
      setError("Completa tu email y contraseña para continuar.");
      return;
    }
    if (!aceptaTerminos) {
      setError("Tienes que aceptar la Política de Privacidad y los Términos de Servicio para continuar.");
      return;
    }

    setLoading(true);
    setAccionEnCurso(esGratis ? "gratis" : "pago");
    setError(null);

    // emailRedirectTo: antes no se mandaba, así que Supabase usaba el "Site
    // URL" configurado en el dashboard del proyecto — que quedó apuntando a
    // localhost (de cuando esto se armó la primera vez), por eso el link del
    // correo de confirmación llevaba a localhost y daba "no se pudo
    // conectar" en el celular/computadora de quien se registra. Con esto se
    // manda explícito el dominio real. OJO: además hay que agregar
    // "https://www.victorcfo.com/**" a la lista de Redirect URLs permitidas
    // en Supabase (Authentication → URL Configuration) — si no está ahí,
    // Supabase ignora este parámetro y vuelve a usar el Site URL viejo.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          signup_gratis: esGratis ? "true" : "false",
          ...(refId ? { ref_id: refId } : {}),
          ...(socioCodigo ? { socio_codigo: socioCodigo } : {}),
        },
      },
    });

    if (error) {
      setLoading(false);
      setAccionEnCurso(null);
      setError(error.message);
      return;
    }

    // Si el proyecto de Supabase tiene confirmación de email activada, no
    // hay sesión todavía — el usuario tiene que confirmar desde su correo
    // antes de poder entrar. Si está desactivada, ya queda logueado.
    if (data.session) {
      if (esGratis) {
        // El plan gratis nace con plan_status='active' (trigger 0031) — no
        // pasa por Stripe para nada, directo a onboarding.
        setLoading(false);
        router.push("/onboarding");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, ciclo, returnTo: "/onboarding", cancelTo: "/registro/completar-pago" }),
      });
      const json = await res.json().catch(() => null);
      setLoading(false);

      if (res.ok && json?.url) {
        window.location.href = json.url;
      } else {
        // Si el checkout falla por lo que sea (ej. Price ID mal
        // configurado), no dejamos a la persona varada en un error — la
        // cuenta ya existe, así que la mandamos a la página de completar
        // pago, donde puede intentar de nuevo.
        router.push("/registro/completar-pago");
      }
    } else {
      setLoading(false);
      setRevisaCorreo(true);
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    crearCuenta(false);
  }

  if (revisaCorreo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">Revisa tu correo</p>
            <p className="text-xs text-muted">
              Te enviamos un link de confirmación a {email}. Confírmalo para activar tu cuenta y
              {accionEnCurso === "gratis"
                ? " comenzar. Tu plan gratis queda activo de una vez — ¡bienvenido a VICTOR!"
                : " continuar con tu pago."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={handleRegistro} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Comienza ahora</h1>

          <div className="mb-1 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPlan("core")}
              className={`flex-1 rounded-lg border p-2 font-medium ${plan === "core" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Core
            </button>
            <button
              type="button"
              onClick={() => setPlan("pro")}
              className={`flex-1 rounded-lg border p-2 font-medium ${plan === "pro" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Pro (negocio)
            </button>
          </div>

          <div className="mb-1 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCiclo("mensual")}
              className={`flex-1 rounded-lg border p-2 ${ciclo === "mensual" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setCiclo("anual")}
              className={`flex-1 rounded-lg border p-2 ${ciclo === "anual" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Anual <span className="text-[0.65rem]">(1 mes gratis)</span>
            </button>
          </div>

          {esReferido && (
            <p className="mb-1 text-xs font-medium text-teal">
              Te invitaron con un link especial — tu primer mes de {plan === "pro" ? "Pro" : "Core"} es gratis.
            </p>
          )}

          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-2xl font-semibold">${precioMostrar}</span>
            <span className="text-xs text-muted">{precios.sufijo}</span>
          </div>
          <p className="mb-1 text-xs text-muted">
            {plan === "pro"
              ? "Negocio + personal en un solo lugar: facturación, pagos y VICTOR. Cancela cuando quieras."
              : "Acceso completo: banco conectado + VICTOR. Cancela cuando quieras."}
          </p>

          {/* Qué incluye (10 sept 2026, pedido de Joel: "y lo que obtiene al
              pagar, un resumen" — reforzar el valor justo antes de pedir el
              pago, mismo principio que el checklist de Luna Money en su
              pantalla de pricing). */}
          <ul className="mb-1 flex flex-col gap-1 text-xs text-muted">
            <li>✓ Banco conectado (Plaid) — gastos e ingresos automáticos</li>
            <li>✓ VICTOR, tu asesor financiero por chat, 24/7</li>
            <li>✓ Metas, Bóveda de documentos y Citas</li>
            {plan === "pro" ? (
              <>
                <li>✓ Facturación, cotizaciones y cobros con tarjeta</li>
                <li>✓ Reportes listos para Hacienda</li>
              </>
            ) : (
              <li>✓ Reportes listos para Hacienda</li>
            )}
          </ul>

          <input
            className="vc-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="vc-input"
            type="password"
            placeholder="Contraseña (mínimo 6 caracteres)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label className="flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>
              Acepto la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium text-teal">
                Política de Privacidad
              </Link>{" "}
              y los{" "}
              <Link href="/terminos" target="_blank" className="font-medium text-teal">
                Términos de Servicio
              </Link>
              , incluyendo el uso de Plaid para conectar mi banco.
            </span>
          </label>

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={loading || !aceptaTerminos}>
            {loading && accionEnCurso === "pago"
              ? "Creando cuenta..."
              : esReferido
                ? `Activar — primer mes gratis (luego $${precioMostrar}${precios.sufijo})`
                : `Empieza gratis 7 días — luego $${precioMostrar}${precios.sufijo}`}
          </button>
          {!esReferido && (
            <p className="text-center text-[0.7rem] text-muted">No se te cobra nada hoy. Cancela cuando quieras.</p>
          )}

          <div className="my-1 flex items-center gap-2 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>o continúa con</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="vc-btn-secondary flex flex-1 items-center justify-center gap-2"
              disabled={loading || !!oauthEnCurso || !aceptaTerminos}
              onClick={() => continuarConOAuth("google")}
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.6 0-14.1 4.3-17.7 10.7z" />
                <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.4 34.8 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5c3.6 6.4 10.1 10.6 17.8 10.6z" />
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.5 5.5C40.5 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
              </svg>
              {oauthEnCurso === "google" ? "..." : "Google"}
            </button>
            <button
              type="button"
              className="vc-btn-secondary flex flex-1 items-center justify-center gap-2"
              disabled={loading || !!oauthEnCurso || !aceptaTerminos}
              onClick={() => continuarConOAuth("apple")}
            >
              <svg width="15" height="15" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
                <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141 0 184.8 0 273.5c0 26.2 4.8 53.3 14.4 81.2 12.8 37.5 59 129.3 107.2 127.6 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-84.1 102.6-121.7-65.2-30.7-57.7-90-57.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
              </svg>
              {oauthEnCurso === "apple" ? "..." : "Apple"}
            </button>
          </div>

          <div className="my-1 flex items-center gap-2 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>o</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            className="vc-btn-secondary"
            disabled={loading || !aceptaTerminos}
            onClick={() => crearCuenta(true)}
          >
            {loading && accionEnCurso === "gratis" ? "Creando cuenta..." : "Empezar gratis (limitada)"}
          </button>
          <p className="text-center text-[0.7rem] text-muted">
            Gratis: Bóveda, Metas, Citas y categorizar por CSV. Sin conectar banco ni chat con VICTOR.
          </p>

          <p className="mt-1 text-center text-xs text-muted">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-teal">
              Entra aquí
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroForm />
    </Suspense>
  );
}
