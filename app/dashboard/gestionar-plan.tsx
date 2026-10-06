"use client";

import { useState } from "react";

// Botón "Gestionar mi plan" en Config — abre el Customer Portal de Stripe,
// donde el usuario puede cancelar su suscripción, cambiar su tarjeta o ver
// sus recibos. No mostramos nada de esto dentro de VICTOR mismo (evita
// duplicar UI que Stripe ya hace bien y de forma segura).
//
// pagadoPorFirma (migración 0139, 4 oct 2026, programa Firma Accountant):
// si viene con un nombre, este usuario no tiene suscripción propia que
// gestionar — su plan Business lo paga la firma de su contador. En ese
// caso se oculta "Gestionar mi plan" (no hay portal de Stripe al que
// mandarlo) y se muestra de qué se trata en su lugar.
export default function GestionarPlan({
  pagadoPorFirma = null,
  graciaHasta = null,
  firmaLiberadoNombre = null,
  tienePlanPropio = false,
}: {
  pagadoPorFirma?: string | null;
  // Si la firma lo liberó (6 oct 2026): hasta cuándo conserva Business para
  // contratar su propio plan, y qué firma lo liberó.
  graciaHasta?: string | null;
  firmaLiberadoNombre?: string | null;
  tienePlanPropio?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asumiendo, setAsumiendo] = useState<null | "mensual" | "anual">(null);

  // "Asumir mi plan": el cliente invitado por una firma deja de depender de
  // ella (típico cuando cambia de contador) y sigue con Business pagándolo él.
  // Primero se libera de la firma (que deja de pagar su seat al instante) y
  // luego va directo al Checkout de Stripe para poner su propia tarjeta.
  async function asumirPlan(ciclo: "mensual" | "anual", confirmar: boolean) {
    if (
      confirmar &&
      !window.confirm(
        "Vas a continuar con tu plan Business pagándolo tú. Tu contador deja de pagarlo desde hoy y no pierdes nada de tus datos. ¿Continuar?",
      )
    )
      return;
    setAsumiendo(ciclo);
    setError(null);

    if (confirmar) {
      const r = await fetch("/api/firma/asumir-plan", { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        setAsumiendo(null);
        setError(j?.error || "No se pudo completar el cambio. Intenta de nuevo.");
        return;
      }
    }

    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: "proplus",
        ciclo,
        returnTo: "/dashboard/config",
        cancelTo: "/dashboard/config",
      }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }
    setAsumiendo(null);
    setError(json?.error || "No se pudo iniciar el pago. Intenta de nuevo en un momento.");
  }

  const fechaGracia = graciaHasta
    ? new Date(graciaHasta).toLocaleDateString("es-PR", { day: "numeric", month: "long", year: "numeric" })
    : null;
  const enGracia = !!graciaHasta && !pagadoPorFirma && !tienePlanPropio;
  const [descargandoCertificado, setDescargandoCertificado] = useState(false);
  const [errorCertificado, setErrorCertificado] = useState<string | null>(null);

  async function abrirPortal() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/stripe/portal", { method: "POST" });
    const json = await res.json().catch(() => null);

    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }

    setLoading(false);
    setError(json?.error || "No se pudo abrir el portal de pago. Intenta de nuevo en un momento.");
  }

  // Certificado Anual de Gastos (#791, 1 oct 2026) — a diferencia del
  // portal de Stripe (recibos sueltos, uno por uno), esto es 1 PDF con
  // TODO lo pagado en el año consolidado, para que el cliente se lo mande
  // directo a su CPA en enero sin tener que juntar 12 recibos. Default: el
  // año contributivo que acaba de cerrar (la API decide eso mismo del lado
  // del servidor si no se manda ?anio=).
  async function descargarCertificado() {
    setDescargandoCertificado(true);
    setErrorCertificado(null);

    const res = await fetch("/api/suscripcion/certificado-anual/pdf");
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setErrorCertificado(json?.error || "No se pudo generar el certificado. Intenta de nuevo en un momento.");
      setDescargandoCertificado(false);
      return;
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "certificado-gastos-victorcfo.pdf";
    a.click();
    window.URL.revokeObjectURL(url);
    setDescargandoCertificado(false);
  }

  return (
    <div className="vc-card mb-4">
      <p className="mb-2 text-sm font-medium">Facturación</p>

      {pagadoPorFirma ? (
        <>
          <p className="mb-3 rounded-lg border border-teal bg-teal/[.06] px-3 py-2 text-xs text-text">
            Tu plan Business está incluido por tu contador <strong>{pagadoPorFirma}</strong> — no tienes que pagar
            nada ni poner tarjeta. Si activas un addon (Técnicos, Administrador, Entidades adicionales o Pagos), eso
            sí se te factura a ti aparte, a precio normal.
          </p>
          <p className="mb-2 text-xs text-muted">
            ¿Cambiaste de contador o prefieres manejar tu plan tú mismo? Puedes continuar con Business pagándolo tú,
            sin perder nada de tus datos.
          </p>
          {error && <p className="mb-2 text-xs text-red">{error}</p>}
          <div className="mb-2 flex gap-2">
            <button
              onClick={() => asumirPlan("mensual", true)}
              disabled={asumiendo !== null}
              className="flex-1 rounded-lg border border-teal p-3 text-sm font-medium text-teal"
              style={{ background: "rgba(29,158,117,.1)" }}
            >
              {asumiendo === "mensual" ? "Procesando..." : "Continuar yo — $99.99/mes"}
            </button>
            <button
              onClick={() => asumirPlan("anual", true)}
              disabled={asumiendo !== null}
              className="flex-1 rounded-lg border border-border p-3 text-sm font-medium text-muted"
            >
              {asumiendo === "anual" ? "Procesando..." : "Anual — $1,099"}
            </button>
          </div>
        </>
      ) : enGracia ? (
        <>
          <p className="mb-3 rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs text-text">
            {firmaLiberadoNombre ? (
              <>
                <strong>{firmaLiberadoNombre}</strong> ya no incluye tu plan Business.
              </>
            ) : (
              <>Tu plan Business ya no está incluido por tu contador.</>
            )}{" "}
            Conservas Business y todos tus datos hasta el <strong>{fechaGracia}</strong>. Para continuar sin
            interrupciones, activa tu propio plan; si no lo haces, tu cuenta pasa al plan gratis (no se borra nada).
          </p>
          {error && <p className="mb-2 text-xs text-red">{error}</p>}
          <div className="mb-2 flex gap-2">
            <button
              onClick={() => asumirPlan("mensual", false)}
              disabled={asumiendo !== null}
              className="flex-1 rounded-lg border border-teal p-3 text-sm font-medium text-teal"
              style={{ background: "rgba(29,158,117,.1)" }}
            >
              {asumiendo === "mensual" ? "Procesando..." : "Continuar — $99.99/mes"}
            </button>
            <button
              onClick={() => asumirPlan("anual", false)}
              disabled={asumiendo !== null}
              className="flex-1 rounded-lg border border-border p-3 text-sm font-medium text-muted"
            >
              {asumiendo === "anual" ? "Procesando..." : "Anual — $1,099"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            Cambia tu tarjeta, revisa tus recibos o cancela tu suscripción cuando quieras.
          </p>
          {error && <p className="mb-2 text-xs text-red">{error}</p>}
          <button
            onClick={abrirPortal}
            disabled={loading}
            className="mb-2 w-full rounded-lg border border-teal p-3 text-sm font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            {loading ? "Abriendo..." : "Gestionar mi plan"}
          </button>
        </>
      )}

      {errorCertificado && <p className="mb-2 text-xs text-red">{errorCertificado}</p>}
      <button
        onClick={descargarCertificado}
        disabled={descargandoCertificado}
        className="w-full rounded-lg border border-border p-3 text-sm font-medium text-muted"
      >
        {descargandoCertificado ? "Generando..." : "Certificado Anual de Gastos (para tu CPA)"}
      </button>
    </div>
  );
}
