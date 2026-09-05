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
  const ciclo: Ciclo = esCicloValido(cicloQuery) ? cicloQuery : "mensual";
  const refId = refQuery && UUID_RE.test(refQuery) ? refQuery : null;
  const socioCodigo = socioQuery && SOCIO_CODIGO_RE.test(socioQuery) ? socioQuery.toUpperCase() : null;
  // Mes gratis para los dos programas (5 sept 2026, extendido al Programa de
  // Socios — ver esReferido en app/api/stripe/checkout/route.ts, que es
  // quien de verdad activa el trial de 30 días; esto solo decide qué
  // mensaje MOSTRAR en pantalla).
  const esReferido = !!refId || !!socioCodigo;

  const [plan, setPlan] = useState<"core" | "pro">(planInicial);
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
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
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
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
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
                : `Activar por $${precioMostrar}${precios.sufijo}`}
          </button>

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
