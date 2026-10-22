"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// Landing para el anuncio de "quiero las plantillas" (22 oct 2026). La gente
// que pide una plantilla de presupuesto en Excel/Sheets es justo quien se
// beneficia de lo que ya hace el plan gratis de VICTOR sin fórmulas que
// romper: regla 50/30/20, bola de nieve/avalancha, efectivo a mano, importar
// el estado de cuenta (CSV/PDF), resumen mensual y metas. Un solo botón:
// Google → cuenta gratis (mismo flujo que /registro: /auth/callback con
// gratis=true). Quien prefiera email va a /registro. A propósito NO promete
// banco conectado ni chat con VICTOR (eso es de Core): mismo principio de
// honestidad de /registro.
const BENEFICIOS = [
  {
    icono: "🥧",
    titulo: "Regla 50/30/20 automática",
    texto: "Tus gastos se reparten solos en necesidades, gustos y ahorro. Sin fórmulas ni celdas que se dañan.",
  },
  {
    icono: "💪",
    titulo: "Plan para salir de deudas",
    texto: "Escribe tus tarjetas y préstamos. Te decimos en qué orden pagarlas (bola de nieve o avalancha), en cuántos meses sales y cuánto pagas en intereses.",
  },
  {
    icono: "💵",
    titulo: "Efectivo y gastos a mano",
    texto: "Anota lo que pagas en efectivo en 10 segundos. Lo puedes editar o borrar cuando quieras.",
  },
  {
    icono: "📄",
    titulo: "Sube tu estado de cuenta",
    texto: "Sube el CSV, Excel o PDF de tu banco y tus gastos se llenan solos, ya categorizados.",
  },
  {
    icono: "🎯",
    titulo: "Metas de ahorro",
    texto: "Pon una meta, y la calculadora te dice cuánto ahorrar al mes para llegar.",
  },
  {
    icono: "📊",
    titulo: "Resumen del mes",
    texto: "Cuánto entró, cuánto salió y en qué se te fue el dinero, sin que tengas que armar nada.",
  },
];

export default function PlantillaPage() {
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

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-5 py-8">
      <div className="mb-8 flex items-center justify-center gap-2">
        <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
        <span className="text-lg font-medium">VICTOR</span>
      </div>

      <section className="mb-8 text-center">
        <h1 className="mb-3 text-2xl font-semibold leading-tight">
          Tu presupuesto, sin plantillas de Excel que se rompen
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted">
          Lo que hace una plantilla de presupuesto, hecho solo: la regla 50/30/20, tu plan para pagar deudas, tus gastos y tus
          metas. Gratis para empezar.
        </p>
      </section>

      <section className="vc-card mb-8 text-center">
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
          ¿Prefieres usar tu email?{" "}
          <Link href="/registro" className="font-medium text-teal">
            Regístrate aquí
          </Link>
        </p>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        {BENEFICIOS.map((b) => (
          <div key={b.titulo} className="vc-card">
            <p className="mb-1 text-sm font-medium">
              <span aria-hidden>{b.icono}</span> {b.titulo}
            </p>
            <p className="text-xs text-muted">{b.texto}</p>
          </div>
        ))}
      </section>

      <section className="vc-card mb-8">
        <p className="mb-2 text-sm font-medium">Plantilla de Excel vs. VICTOR gratis</p>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1.5 text-xs">
          <span />
          <span className="font-medium text-muted">Plantilla</span>
          <span className="font-medium text-teal">VICTOR</span>
          {[
            ["Se calcula sola", "No", "Sí"],
            ["Reparte tu mes en 50/30/20", "A mano", "Sí"],
            ["Plan para pagar deudas", "A mano", "Sí"],
            ["Importa tu estado de cuenta", "No", "Sí"],
            ["Funciona en el celular", "Incómodo", "Sí"],
          ].map(([a, b, c]) => (
            <div key={a} className="contents">
              <span>{a}</span>
              <span className="text-muted">{b}</span>
              <span className="font-medium text-teal">{c}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 text-center">
        <p className="text-xs text-muted">
          El plan gratis no conecta tu banco ni incluye el chat con VICTOR. Eso es del plan Core, cuando lo quieras. Para empezar a
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
