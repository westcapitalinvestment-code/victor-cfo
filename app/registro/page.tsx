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
  // Precio por mes equivalente y % de ahorro del plan Anual vs. pagar 12
  // meses al precio Mensual (11 sept 2026, pedido de Joel: mostrar "el
  // ahorro si lo paga anual" al lado de la opción, como el badge "SAVE 31%"
  // de Luna Money — calculado, no hardcodeado, para que nunca quede
  // desactualizado si cambian los precios).
  const preciosPlan = PRECIOS_REGISTRO[plan];
  const mensualNum = parseFloat(preciosPlan.mensual.normal);
  const anualNum = parseFloat(preciosPlan.anual.normal);
  const anualPorMes = (anualNum / 12).toFixed(2);
  const ahorroPct = Math.round((1 - anualNum / (mensualNum * 12)) * 100);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<"pago" | "gratis" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [oauthEnCurso, setOauthEnCurso] = useState<"google" | "apple" | null>(null);
  // Email/contraseña como tarjeta colapsada (11 sept 2026, pedido de Joel:
  // "quítale lo de email y contraseña que sea una tarjeta de 'continuar con
  // email' y luego si la selecciona se abra la oportunidad para crear el
  // email y psw" — mismo patrón que el botón "Continue with Email" de Luna
  // Money, que también aparece colapsado junto a Google/Apple).
  const [mostrarEmailForm, setMostrarEmailForm] = useState(false);
  // Línea única que aclara trial + precio real (11 sept 2026, pedido de
  // Joel: "hay que aclarar que son 7 días gratis y luego ($14.99-$49.99) el
  // plan que escoja mensual" — reemplaza los 2 párrafos sueltos que había
  // antes por 1 solo, igual que el "Free for 7 days, then $X/month. Cancel
  // anytime." de Luna Money).
  const finePrint = esReferido
    ? `Tu primer mes de ${plan === "pro" ? "Pro" : "Core"} es gratis, luego $${precioMostrar}${precios.sufijo}. Cancela cuando quieras.`
    : `Gratis por 7 días, luego $${precioMostrar}${precios.sufijo}. Cancela cuando quieras.`;

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
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Panel de explicación (11 sept 2026, layout estilo Luna Money —
          pedido de Joel: "lo quiero así como este [Luna], que la explicación
          esté al lado y se vea fino, no esto tan largo". La explicación y el
          checklist ahora van AL LADO del formulario en desktop en vez de
          apilados arriba de los campos; en mobile quedan arriba pero mucho
          más cortos que antes porque el checklist ya no se repite dentro
          del form. */}
      <div className="flex flex-col justify-center gap-5 bg-gradient-to-br from-teal/10 via-teal/5 to-transparent px-8 py-10 md:w-[38%] md:px-12">
        <div className="flex items-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-lg font-medium">VICTOR</span>
        </div>
        <div>
          <h2 className="mb-2 text-2xl font-semibold text-teal">Prueba VICTOR gratis</h2>
          <p className="text-sm text-muted">
            {plan === "pro"
              ? "Negocio + personal en un solo lugar: facturación, pagos y VICTOR. Cancela cuando quieras."
              : "Tu asesor financiero con IA: banco conectado y todo lo que necesitas para manejar tus finanzas. Cancela cuando quieras."}
          </p>
        </div>
        <ul className="flex flex-col gap-2 text-sm text-text">
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span> Banco conectado (Plaid) — gastos e ingresos automáticos
          </li>
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span> VICTOR, tu asesor financiero por chat, 24/7
          </li>
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span> Metas, Bóveda de documentos y Citas
          </li>
          {plan === "pro" && (
            <li className="flex items-center gap-2">
              <span className="text-teal">✓</span> Facturación, cotizaciones y cobros con tarjeta
            </li>
          )}
          <li className="flex items-center gap-2">
            <span className="text-teal">✓</span> Reportes listos para Hacienda
          </li>
        </ul>
      </div>

      {/* Panel del formulario (11 sept 2026, pedido de Joel: "mas grande
          todo mas centralizado" comparando con Luna — tarjeta más ancha
          (max-w-md en vez de max-w-sm) y con más aire por dentro). */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-md">
          <form onSubmit={handleRegistro} className="vc-card flex flex-col gap-3 p-8">
            <div className="mb-1 text-center">
              <p className="text-5xl font-bold leading-none text-teal">GRATIS</p>
              <p className="mt-2 text-sm text-muted">
                {esReferido ? `tu primer mes de ${plan === "pro" ? "Pro" : "Core"}` : "por 7 días"}
              </p>
            </div>

            {/* Tabs Core/Pro (11 sept 2026, pedido de Joel: "que tengan color
                al seleccionarlas" — antes la opción activa solo se veía
                blanca/elevada, ahora lleva teal sólido, bien visible). */}
            <div className="mb-1 flex justify-center gap-1 rounded-full bg-bg p-1 text-sm">
              <button
                type="button"
                onClick={() => setPlan("core")}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition-colors ${
                  plan === "core" ? "bg-teal text-white shadow-sm" : "text-muted"
                }`}
              >
                Core
              </button>
              <button
                type="button"
                onClick={() => setPlan("pro")}
                className={`flex-1 rounded-full px-4 py-2 font-medium transition-colors ${
                  plan === "pro" ? "bg-teal text-white shadow-sm" : "text-muted"
                }`}
              >
                Pro (negocio)
              </button>
            </div>

            {/* Radio cards Mensual/Anual (11 sept 2026, pedido de Joel: "las
                descripciones más pegadas al precio" — precio en una sola
                línea con " · ", centrado verticalmente con la etiqueta, en
                vez de 2 líneas sueltas). */}
            <div className="mb-1 flex flex-col gap-2">
              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${
                  ciclo === "anual" ? "border-teal bg-teal/[.06]" : "border-border"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ciclo"
                    checked={ciclo === "anual"}
                    onChange={() => setCiclo("anual")}
                    className="accent-teal"
                  />
                  <span className="font-medium text-text">Anual</span>
                  <span className="rounded-full bg-teal px-2 py-0.5 text-[0.65rem] font-semibold text-white">
                    Ahorra {ahorroPct}%
                  </span>
                </span>
                <span className="text-xs text-muted">
                  ${anualPorMes}/mes · ${preciosPlan.anual.normal}/año
                </span>
              </label>

              <label
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 text-sm ${
                  ciclo === "mensual" ? "border-teal bg-teal/[.06]" : "border-border"
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ciclo"
                    checked={ciclo === "mensual"}
                    onChange={() => setCiclo("mensual")}
                    className="accent-teal"
                  />
                  <span className="font-medium text-text">Mensual</span>
                </span>
                <span className="text-xs text-muted">${preciosPlan.mensual.normal}/mes</span>
              </label>
            </div>

            {/* Aclaración de trial + precio real, en 1 línea (11 sept 2026,
                pedido de Joel: "hay que aclarar que son 7 días gratis y
                luego [precio] el plan que escoja mensual"). */}
            <p className="text-center text-xs text-muted">{finePrint}</p>

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

            {!mostrarEmailForm ? (
              <>
                {/* Apple queda oculto por ahora (10 sept 2026, pedido de
                    Joel: "si comenzamos con Google por ahora") — requiere
                    Apple Developer Program ($99/año) + Services ID/Key
                    ID/private key, mucho más setup que Google.
                    continuarConOAuth("apple") ya funciona y el callback ya
                    lo soporta — cuando Joel complete el lado de Apple, esto
                    es re-mostrar el botón, nada más. */}
                <button
                  type="button"
                  className="vc-btn-secondary flex items-center justify-center gap-2"
                  disabled={loading || !!oauthEnCurso || !aceptaTerminos}
                  onClick={() => continuarConOAuth("google")}
                >
                  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.1 29.5 4 24 4c-7.6 0-14.1 4.3-17.7 10.7z" />
                    <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.5l-6.5-5.5C29.4 34.8 26.8 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5c3.6 6.4 10.1 10.6 17.8 10.6z" />
                    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.5 5.5C40.5 36.6 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
                  </svg>
                  {oauthEnCurso === "google" ? "..." : "Continuar con Google"}
                </button>

                {/* Tarjeta "Continuar con email" (11 sept 2026, pedido de
                    Joel: "quítale lo de email y contraseña que sea una
                    tarjeta de 'continuar con email' y luego si la selecciona
                    se abra la oportunidad para crear el email y psw" — antes
                    los campos de email/contraseña estaban siempre visibles;
                    ahora son un paso aparte, igual que el botón "Continue
                    with Email" de Luna Money). */}
                <button
                  type="button"
                  className="vc-btn-secondary"
                  disabled={loading || !aceptaTerminos}
                  onClick={() => {
                    setError(null);
                    setMostrarEmailForm(true);
                  }}
                >
                  Continuar con email
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
              </>
            ) : (
              <>
                <input
                  className="vc-input"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
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

                <button type="submit" className="vc-btn-primary mt-1" disabled={loading || !aceptaTerminos}>
                  {loading && accionEnCurso === "pago" ? "Creando cuenta..." : "Crear cuenta"}
                </button>

                <button
                  type="button"
                  className="text-center text-xs text-muted hover:text-teal"
                  onClick={() => {
                    setError(null);
                    setMostrarEmailForm(false);
                  }}
                >
                  ‹ Volver
                </button>
              </>
            )}

            <p className="mt-1 text-center text-xs text-muted">
              ¿Ya tienes cuenta?{" "}
              <Link href="/login" className="font-medium text-teal">
                Entra aquí
              </Link>
            </p>
          </form>
        </div>
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
