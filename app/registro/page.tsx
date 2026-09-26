"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { esCicloValido, type Ciclo } from "@/lib/stripe";
import { fbqTrack } from "@/lib/fbpixel";

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
// banco ni hablar con VICTOR hasta que suba de plan.
//
// Rediseño de 3 tarjetas (26 sept 2026, pedido de Joel viendo el registro
// simplificado del 25 sept: "hay que cambiar, poner lo que sí hace gratis
// y lo que todo queda automático con Core y Pro, además todos estaban con
// 'Comienza Gratis' — si una persona quiere comenzar en Core o Pro no le
// da la oportunidad de comprar"). El registro del 25 sept resolvió la
// fricción del anuncio (escoger plan+ciclo+términos antes de poder tocar
// un botón) pero se pasó al otro extremo: escondía la opción de pagar
// detrás de un toggle colapsado, y el panel izquierdo listaba cosas como
// "Banco conectado" y "VICTOR 24/7" como si el plan gratis las incluyera,
// cuando son justo lo que el gratis NO trae (mismo principio de honestidad
// de siempre — nunca implicar que algo pasa automático cuando el usuario
// tiene que hacerlo él mismo). Ahora las 3 opciones (Gratis/Core/Pro) se
// muestran lado a lado, cada una con su propio botón de "un clic" — sigue
// siendo tan fácil de usar como el 25 sept (nadie tiene que llenar un
// formulario largo para empezar), pero ahora SÍ es obvio que pagar es una
// opción real desde el primer segundo, no algo escondido.
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

type PlanPago = "core" | "pro";

function RegistroForm() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const planQuery = searchParams.get("plan");
  const cicloQuery = searchParams.get("ciclo");
  const refQuery = searchParams.get("ref");
  const socioQuery = searchParams.get("socio");
  // Si alguien llega con ?plan=pro, esa es la tarjeta que se destaca — pero
  // las 3 siempre están visibles y activas, nunca se esconde ninguna.
  const planDestacado: PlanPago = planQuery === "pro" ? "pro" : "core";
  const cicloInicial: Ciclo = esCicloValido(cicloQuery) ? cicloQuery : "mensual";
  const refId = refQuery && UUID_RE.test(refQuery) ? refQuery : null;
  const socioCodigo = socioQuery && SOCIO_CODIGO_RE.test(socioQuery) ? socioQuery.toUpperCase() : null;
  // Mes gratis para los dos programas (5 sept 2026, extendido al Programa de
  // Socios — ver esReferido en app/api/stripe/checkout/route.ts, que es
  // quien de verdad activa el trial de 30 días; esto solo decide qué
  // mensaje MOSTRAR en pantalla).
  const esReferido = !!refId || !!socioCodigo;

  // Toggle Mensual/Anual compartido por las tarjetas de Core y Pro (10 sept
  // 2026, pedido de Joel tras comparar con Luna Money).
  const [ciclo, setCiclo] = useState<Ciclo>(cicloInicial);

  function datosPrecio(planId: PlanPago) {
    const precios = PRECIOS_REGISTRO[planId];
    const precioMostrar = precios[ciclo].normal;
    const sufijo = precios[ciclo].sufijo;
    const mensualNum = parseFloat(precios.mensual.normal);
    const anualNum = parseFloat(precios.anual.normal);
    const anualPorMes = (anualNum / 12).toFixed(2);
    const ahorroPct = Math.round((1 - anualNum / (mensualNum * 12)) * 100);
    return { precioMostrar, sufijo, anualPorMes, ahorroPct };
  }

  function finePrint(planId: PlanPago) {
    const { precioMostrar, sufijo } = datosPrecio(planId);
    const nombre = planId === "pro" ? "Pro" : "Core";
    return esReferido
      ? `Tu primer mes de ${nombre} es gratis, luego $${precioMostrar}${sufijo}. Cancela cuando quieras.`
      : `Gratis por 7 días, luego $${precioMostrar}${sufijo}. Cancela cuando quieras.`;
  }

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<"pago" | "gratis" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [oauthEnCurso, setOauthEnCurso] = useState<"google" | "apple" | null>(null);
  // Email/contraseña como tarjeta colapsada (11 sept 2026, pedido de Joel).
  // Ahora se abre desde CUALQUIERA de las 3 tarjetas — emailFlujo recuerda
  // cuál escogió antes de abrir el formulario, para que el submit sepa si
  // debe crear la cuenta gratis o mandar a pagar, y con qué plan.
  const [mostrarEmailForm, setMostrarEmailForm] = useState(false);
  const [emailFlujo, setEmailFlujo] = useState<{ gratis: boolean; plan: PlanPago }>({
    gratis: true,
    plan: planDestacado,
  });

  function abrirEmailForm(gratis: boolean, plan: PlanPago) {
    setError(null);
    setEmailFlujo({ gratis, plan });
    setMostrarEmailForm(true);
  }

  // Login/registro con Google y Apple (10 sept 2026, pedido de Joel tras
  // comparar con Luna Money). A diferencia de signUp(), signInWithOAuth()
  // no acepta options.data (los metadatos del usuario los define el
  // proveedor) — así que el plan/ciclo/ref/socio/gratis elegidos aquí
  // viajan como query params en el redirectTo y se aplican en
  // app/auth/callback/route.ts (ver migración 0083).
  async function continuarConOAuth(provider: "google" | "apple", esGratis: boolean, planEscogido: PlanPago) {
    setError(null);
    setOauthEnCurso(provider);

    const params = new URLSearchParams({ plan: planEscogido, ciclo });
    if (refId) params.set("ref", refId);
    if (socioCodigo) params.set("socio", socioCodigo);
    if (esGratis) params.set("gratis", "true");

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

  async function crearCuenta(esGratis: boolean, planEscogido: PlanPago) {
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

    // Cuenta creada de verdad en Supabase — este es el momento correcto
    // para "Lead" de Meta: alguien completó el formulario de registro, sin
    // importar si termina pagando o se queda en el plan gratis.
    fbqTrack("Lead", { plan: planEscogido, ciclo, gratis: esGratis });

    // Bienvenida al registro, pague o no (21 sept 2026, pedido de Joel).
    if (data.user?.id) {
      fetch("/api/registro/bienvenida-inicial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: data.user.id }),
      }).catch(() => {});
    }

    if (data.session) {
      if (esGratis) {
        setLoading(false);
        router.push("/onboarding");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planEscogido,
          ciclo,
          returnTo: "/onboarding",
          cancelTo: "/registro/completar-pago",
        }),
      });
      const json = await res.json().catch(() => null);
      setLoading(false);

      if (res.ok && json?.url) {
        window.location.href = json.url;
      } else {
        router.push("/registro/completar-pago");
      }
    } else {
      setLoading(false);
      setRevisaCorreo(true);
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    crearCuenta(emailFlujo.gratis, emailFlujo.plan);
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

  const { precioMostrar: precioCore, sufijo: sufijoCore, anualPorMes: anualPorMesCore, ahorroPct: ahorroCore } =
    datosPrecio("core");
  const { precioMostrar: precioPro, sufijo: sufijoPro, anualPorMes: anualPorMesPro, ahorroPct: ahorroPro } =
    datosPrecio("pro");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Panel de explicación — ahora describe las 3 opciones de verdad, en
          vez de un checklist único genérico (26 sept 2026). Honesto a
          propósito: el gratis dice justo lo que hace, sin dar a entender
          que VICTOR o el banco están ahí cuando no lo están. */}
      <div className="flex flex-col justify-center gap-5 bg-gradient-to-br from-teal/10 via-teal/5 to-transparent px-8 py-10 md:w-[34%] md:px-12">
        <div className="flex items-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-lg font-medium">VICTOR</span>
        </div>
        <div>
          <h2 className="mb-2 text-2xl font-semibold text-teal">Escoge cómo empezar</h2>
          <p className="text-sm text-muted">
            VICTOR se adapta a lo que necesites — desde organizar tus finanzas tú mismo hasta que todo quede
            automático.
          </p>
        </div>
        <div className="flex flex-col gap-4 text-sm">
          <div>
            <p className="font-semibold text-text">Gratis</p>
            <p className="text-muted">
              Tú organizas: sube tus estados de cuenta (CSV/Excel) y categoriza tus gastos, guarda documentos en la
              Bóveda, anota tus Citas y pon Metas. Sin conectar banco ni hablar con VICTOR.
            </p>
          </div>
          <div>
            <p className="font-semibold text-text">Core — personal</p>
            <p className="text-muted">
              Todo automático: VICTOR conecta tu banco (Plaid) y categoriza cada transacción, contesta lo que sea de
              tu dinero 24/7, te recuerda tus citas y avisa de documentos antes de que venzan.
            </p>
          </div>
          <div>
            <p className="font-semibold text-text">Pro — negocio</p>
            <p className="text-muted">
              Todo lo de Core, más Facturación, cotizaciones, cobros con tarjeta, pagos a contratistas y reportes
              listos para Hacienda.
            </p>
          </div>
        </div>
      </div>

      {/* Panel de las 3 tarjetas */}
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className={mostrarEmailForm ? "w-full max-w-md" : "w-full max-w-4xl"}>
          {!mostrarEmailForm ? (
            <>
              <label className="mb-4 flex items-start justify-center gap-2 text-center text-xs text-muted">
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
                  .
                </span>
              </label>

              {error && <p className="mb-3 text-center text-xs text-red">{error}</p>}

              {/* Toggle Mensual/Anual, aplica a las tarjetas de Core y Pro */}
              <div className="mx-auto mb-5 flex w-fit justify-center gap-1 rounded-full bg-bg p-1 text-sm">
                <button
                  type="button"
                  onClick={() => setCiclo("mensual")}
                  className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                    ciclo === "mensual" ? "bg-teal text-white shadow-sm" : "text-muted"
                  }`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setCiclo("anual")}
                  className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
                    ciclo === "anual" ? "bg-teal text-white shadow-sm" : "text-muted"
                  }`}
                >
                  Anual
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {/* Tarjeta Gratis */}
                <div className="vc-card flex flex-col gap-3 p-6 text-center">
                  <p className="text-lg font-semibold text-text">Gratis</p>
                  <p className="text-3xl font-bold text-teal">$0</p>
                  <ul className="flex flex-1 flex-col gap-1.5 text-left text-xs">
                    <li className="text-text">✓ Bóveda de documentos</li>
                    <li className="text-text">✓ Metas y Citas</li>
                    <li className="text-text">✓ Categorizar por CSV/Excel</li>
                    <li className="text-muted">✕ Sin banco conectado</li>
                    <li className="text-muted">✕ Sin chat con VICTOR</li>
                  </ul>
                  <button
                    type="button"
                    className="vc-btn-secondary flex items-center justify-center gap-2"
                    disabled={loading || !!oauthEnCurso || !aceptaTerminos}
                    onClick={() => continuarConOAuth("google", true, "core")}
                  >
                    {oauthEnCurso === "google" ? "..." : "Comenzar gratis"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    disabled={loading || !!oauthEnCurso}
                    onClick={() => abrirEmailForm(true, "core")}
                  >
                    o con email
                  </button>
                </div>

                {/* Tarjeta Core */}
                <div
                  className={`vc-card flex flex-col gap-3 p-6 text-center ${
                    planDestacado === "core" ? "border-2 border-teal" : ""
                  }`}
                >
                  <p className="text-lg font-semibold text-text">Core</p>
                  <p className="text-xs text-muted">Personal</p>
                  <p className="text-3xl font-bold text-teal">
                    ${precioCore}
                    <span className="text-sm font-normal">{sufijoCore}</span>
                  </p>
                  {ciclo === "anual" && (
                    <p className="-mt-2 text-[0.7rem] text-muted">
                      ${anualPorMesCore}/mes · ahorra {ahorroCore}%
                    </p>
                  )}
                  <ul className="flex flex-1 flex-col gap-1.5 text-left text-xs">
                    <li className="text-text">✓ Banco conectado (Plaid)</li>
                    <li className="text-text">✓ VICTOR, tu asesor por chat, 24/7</li>
                    <li className="text-text">✓ Categorización automática</li>
                    <li className="text-text">✓ Metas, Bóveda y Citas</li>
                    <li className="text-text">✓ Reportes listos para Hacienda</li>
                  </ul>
                  <p className="text-xs text-muted">{finePrint("core")}</p>
                  <button
                    type="button"
                    className="vc-btn-primary flex items-center justify-center gap-2"
                    disabled={loading || !!oauthEnCurso || !aceptaTerminos}
                    onClick={() => continuarConOAuth("google", false, "core")}
                  >
                    {oauthEnCurso === "google" ? "..." : esReferido ? "Activar Core — primer mes gratis" : "Activar Core"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    disabled={loading || !!oauthEnCurso}
                    onClick={() => abrirEmailForm(false, "core")}
                  >
                    o con email
                  </button>
                </div>

                {/* Tarjeta Pro */}
                <div
                  className={`vc-card flex flex-col gap-3 p-6 text-center ${
                    planDestacado === "pro" ? "border-2 border-teal" : ""
                  }`}
                >
                  <p className="text-lg font-semibold text-text">Pro</p>
                  <p className="text-xs text-muted">Negocio</p>
                  <p className="text-3xl font-bold text-teal">
                    ${precioPro}
                    <span className="text-sm font-normal">{sufijoPro}</span>
                  </p>
                  {ciclo === "anual" && (
                    <p className="-mt-2 text-[0.7rem] text-muted">
                      ${anualPorMesPro}/mes · ahorra {ahorroPro}%
                    </p>
                  )}
                  <ul className="flex flex-1 flex-col gap-1.5 text-left text-xs">
                    <li className="text-text">✓ Todo lo de Core</li>
                    <li className="text-text">✓ Facturación y cotizaciones</li>
                    <li className="text-text">✓ Cobros con tarjeta</li>
                    <li className="text-text">✓ Pagos a contratistas</li>
                    <li className="text-text">✓ Reportes multi-entidad</li>
                  </ul>
                  <p className="text-xs text-muted">{finePrint("pro")}</p>
                  <button
                    type="button"
                    className="vc-btn-secondary flex items-center justify-center gap-2"
                    disabled={loading || !!oauthEnCurso || !aceptaTerminos}
                    onClick={() => continuarConOAuth("google", false, "pro")}
                  >
                    {oauthEnCurso === "google" ? "..." : esReferido ? "Activar Pro — primer mes gratis" : "Activar Pro"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-muted underline"
                    disabled={loading || !!oauthEnCurso}
                    onClick={() => abrirEmailForm(false, "pro")}
                  >
                    o con email
                  </button>
                </div>
              </div>

              <p className="mt-5 text-center text-xs text-muted">
                ¿Ya tienes cuenta?{" "}
                <Link href="/login" className="font-medium text-teal">
                  Entra aquí
                </Link>
              </p>
            </>
          ) : (
            <form onSubmit={handleRegistro} className="vc-card flex flex-col gap-3 p-8">
              <p className="text-center text-sm font-medium text-text">
                {emailFlujo.gratis
                  ? "Creando tu cuenta gratis"
                  : `Creando tu cuenta ${emailFlujo.plan === "pro" ? "Pro" : "Core"}`}
              </p>

              {error && <p className="text-center text-xs text-red">{error}</p>}

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
                {loading
                  ? "Creando cuenta..."
                  : emailFlujo.gratis
                    ? "Crear cuenta gratis"
                    : "Crear cuenta y pagar"}
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
            </form>
          )}
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
