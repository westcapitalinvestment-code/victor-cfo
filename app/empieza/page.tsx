"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Capturas reales de la app (cuenta de ejemplo) en /public/empieza.
function Captura({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} loading="lazy" className="w-full rounded-2xl border border-border shadow-lg" />;
}

// Landing del plan gratis (22 oct 2026). Enfoque: ORGANIZAR las finanzas —
// dashboard, resumen del mes, saldar deudas, alertas, documentos y citas —
// mostrando la app por dentro con réplicas de las pantallas (datos ficticios).
// Un solo botón: Google → cuenta gratis (mismo flujo que /registro). A propósito
// NO promete banco conectado ni chat con VICTOR (eso es de Core).
function Seccion({ etiqueta, titulo, texto, puntos, mock, invertir }: { etiqueta: string; titulo: string; texto: string; puntos: string[]; mock: ReactNode; invertir?: boolean }) {
  return (
    <section className="mb-14 grid items-center gap-6 md:grid-cols-2 md:gap-10">
      <div className={invertir ? "md:order-2" : ""}>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-teal">{etiqueta}</p>
        <h2 className="mb-2 text-xl font-semibold leading-tight">{titulo}</h2>
        <p className="mb-3 text-sm text-muted">{texto}</p>
        <ul className="flex flex-col gap-1.5">
          {puntos.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-teal" aria-hidden>
                ✓
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={invertir ? "md:order-1" : ""}>{mock}</div>
    </section>
  );
}

export default function EmpiezaPage() {
  const supabase = createClient();
  const [acepta, setAcepta] = useState(false);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function empezar() {
    if (!acepta) {
      setError("Marca la casilla para aceptar los términos y continuar.");
      return;
    }
    setError(null);
    setEnCurso(true);
    const params = new URLSearchParams({ plan: "core", ciclo: "mensual", gratis: "true" });
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?${params.toString()}` },
    });
    if (e) {
      setError(e.message);
      setEnCurso(false);
    }
  }

  const registro = (
    <div className="vc-card text-center">
      <p className="mb-3 text-sm font-medium">Crea tu cuenta gratis en un clic</p>
      <label className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-bg px-2.5 py-2 text-left text-[0.7rem] leading-snug">
        <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-teal" />
        <span>
          Acepto la{" "}
          <Link href="/privacidad" target="_blank" className="font-medium text-teal underline">
            Política de Privacidad
          </Link>{" "}
          y los{" "}
          <Link href="/terminos" target="_blank" className="font-medium text-teal underline">
            Términos de Servicio
          </Link>
          .
        </span>
      </label>
      {error && <p className="mb-2 text-xs text-red">{error}</p>}
      <button type="button" onClick={empezar} disabled={enCurso} className="vc-btn-primary">
        {enCurso ? "..." : "Empezar gratis con Google"}
      </button>
      <p className="mt-3 text-xs text-muted">
        Sin tarjeta. ¿Prefieres tu email?{" "}
        <Link href="/registro" className="font-medium text-teal">
          Regístrate aquí
        </Link>
      </p>
    </div>
  );

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-5 py-8">
      <div className="mb-8 flex items-center justify-center gap-2">
        <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
        <span className="text-lg font-medium">VICTOR</span>
      </div>

      {/* HERO */}
      <section className="mb-16 grid items-center gap-8 md:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-teal">Gratis · sin tarjeta</p>
          <h1 className="mb-3 text-3xl font-semibold leading-tight">Todo tu dinero, ordenado en un solo lugar</h1>
          <p className="mb-5 text-sm text-muted">
            Anota lo que entra y lo que sale y VICTOR lo ordena: tu dashboard, el resumen del mes, tu plan para salir de deudas, alertas que te avisan
            y tus documentos y citas con recordatorio. Pensado para que sepas dónde estás parado, sin hojas de cálculo.
          </p>
          {registro}
        </div>
        <Captura src="/empieza/inicio.png" alt="Inicio de VICTOR con balance, alertas y tarjetas de ingresos, gastos, ahorro y deuda" />
      </section>

      <p className="mb-10 text-center text-[11px] text-muted">Capturas reales de la app con datos de ejemplo.</p>

      <Seccion
        etiqueta="Dashboard"
        titulo="Tu balance y tus números, al abrir la app"
        texto="Un inicio claro con tu balance, lo que entró, lo que salió, lo que ahorras y lo que debes. Todo lo que anotas se suma o se resta solo."
        puntos={["Toca una tarjeta y anota ahí mismo", "Anota efectivo y gastos chiquitos en 10 segundos", "Todo se puede editar o deshacer"]}
        mock={<Captura src="/empieza/inicio.png" alt="Inicio de VICTOR" />}
      />

      <Seccion
        invertir
        etiqueta="Alertas"
        titulo="La app te avisa antes de que sea tarde"
        texto="Una hoja de cálculo no te dice nada. VICTOR vigila tus números y te avisa lo que importa, con una campanita para que no se te pase."
        puntos={["Te avisa si vas en déficit este mes", "Detecta cargos nuevos y gastos que se dispararon", "Te recuerda cuánto apartar para impuestos"]}
        mock={<Captura src="/empieza/alertas.png" alt="Alertas inteligentes de VICTOR" />}
      />

      <Seccion
        etiqueta="Resumen del mes"
        titulo="En qué se te fue el dinero, sin armar nada"
        texto="Cada mes ves cuánto entró, cuánto salió y cuál es tu categoría de mayor gasto, comparado con tu regla 50/30/20."
        puntos={["Tu categoría con más gasto", "Comparación con el mes pasado", "Reparto en necesidades, gustos y ahorro"]}
        mock={<Captura src="/empieza/resumen.png" alt="Resumen del mes y regla 50/30/20" />}
      />

      <Seccion
        invertir
        etiqueta="Transacciones"
        titulo="Cada gasto y cada ingreso, en su categoría"
        texto="Anota lo que entra y sale, o sube el estado de tu banco. Ves tu reporte por categoría y buscas cualquier movimiento por nombre o monto."
        puntos={["Gastos e ingresos separados, por mes", "Reporte por categoría que se arma solo", "Descarga un reporte para tu contable"]}
        mock={<Captura src="/empieza/transacciones.png" alt="Pantalla de transacciones con reporte de gastos por categoría" />}
      />

      <Seccion
        etiqueta="Saldar deudas"
        titulo="Por cuál deuda empezar y cuándo sales"
        texto="Escribe tus tarjetas y préstamos. Te explicamos bola de nieve y avalancha, te decimos el orden y en cuántos meses sales."
        puntos={["Cada pago baja tu deuda y tu balance", "Ves cuánto pagas en intereses", "Te ayuda a separar un colchón antes de acelerar"]}
        mock={<Captura src="/empieza/deudas.png" alt="Tus deudas en orden de pago y fecha en que quedas libre" />}
      />

      <Seccion
        invertir
        etiqueta="Documentos y citas"
        titulo="Que no se te venza nada"
        texto="Guarda tus documentos importantes y tus citas en un solo sitio. Te llega una notificación antes de la fecha."
        puntos={["Marbete, póliza, contratos y más", "Citas médicas, pagos y compromisos", "Recordatorio en tu celular"]}
        mock={<Captura src="/empieza/citas.png" alt="Metas, alertas de documentos y próximas citas" />}
      />

      <Seccion
        etiqueta="Tu plan"
        titulo="Cuatro preguntas y te armamos tu camino"
        texto="Dinos qué quieres lograr y te damos los pasos para ti: salir de deudas, ordenar y crecer, o probar la app con tus números."
        puntos={["Pasos que se marcan solos al avanzar", "Patrimonio neto y fondo de emergencia", "Págate primero: empieza con 10% y sube a 20%"]}
        mock={<Captura src="/empieza/plan.png" alt="Tu plan: pasos, patrimonio neto, fondo de emergencia y págate primero" />}
      />

      {/* CÓMO EMPIEZO */}
      <section className="mb-14">
        <h2 className="mb-4 text-center text-xl font-semibold">Empieza en 3 pasos</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Crea tu cuenta", "Un clic con Google. Sin tarjeta."],
            ["2", "Anota tu balance de hoy", "O sube el estado de tu banco (CSV, Excel o PDF)."],
            ["3", "Sigue tu plan", "Ves tu dashboard, tus alertas y tu plan desde el primer día."],
          ].map(([n, t, d]) => (
            <div key={n} className="vc-card text-center">
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-[#eefaf4] text-sm font-bold text-[#14543d]">{n}</div>
              <p className="mb-1 text-sm font-medium">{t}</p>
              <p className="text-xs text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="mx-auto mb-8 max-w-md">
        <h2 className="mb-3 text-center text-xl font-semibold">Ordena tu dinero hoy</h2>
        {registro}
      </section>

      <section className="mb-6 text-center">
        <p className="mx-auto max-w-lg text-xs text-muted">
          El plan gratis no conecta tu banco automáticamente ni incluye el chat con VICTOR: eso es del plan Core, cuando lo quieras. Para empezar a
          ordenar tu dinero no lo necesitas.
        </p>
      </section>

      <p className="text-center text-xs text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-teal">
          Entra aquí
        </Link>
      </p>
    </div>
  );
}
