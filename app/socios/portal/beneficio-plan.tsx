"use client";

import { useEffect, useState } from "react";

type Datos = {
  estado: string;
  graciaHasta: string;
  enGracia: boolean;
  tieneNegocio: boolean;
  reserva: number;
  puntosMes: number;
  metaMes: number;
  reservaMax: number;
  email: string | null;
  cuenta: { plan: string | null; origen: string | null } | null;
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// Tarjeta "Tu plan de VICTOR gratis" del portal del vendedor (migración 0200).
export default function BeneficioPlan() {
  const [d, setD] = useState<Datos | null>(null);

  useEffect(() => {
    fetch("/api/socios/portal/beneficio")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.ok && setD(j))
      .catch(() => {});
  }, []);

  if (!d) return null;

  const activo = d.estado === "gracia" || d.estado === "activo";
  const regalado = d.cuenta?.origen === "vendedor";
  const fechaGracia = new Date(d.graciaHasta).toLocaleDateString("es-PR", { day: "numeric", month: "long" });

  let mensaje: string;
  if (!d.cuenta) {
    mensaje = `Crea tu cuenta de VICTOR con este mismo email (${d.email ?? "el de tu solicitud"}) y tu plan se activa solo.`;
  } else if (d.cuenta.origen !== "vendedor" && d.cuenta.plan !== "gratis") {
    mensaje = "Ya tienes tu propio plan pagado, así que no hace falta activar el regalo.";
  } else if (d.enGracia) {
    mensaje = `Estás en tus 30 días de gracia (hasta el ${fechaGracia}). Después necesitas ${d.metaMes} puntos al mes para conservarlo.`;
  } else if (activo) {
    mensaje = "Tu plan gratis está activo este mes.";
  } else {
    mensaje = `Tu plan gratis está en pausa. Con ${d.metaMes} puntos en ventas se reactiva.`;
  }

  return (
    <div className="vc-card mb-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Tu plan de VICTOR gratis</p>
        <span
          className={`rounded-pill px-2 py-0.5 text-[11px] font-medium ${activo ? "bg-teal/10 text-teal" : "bg-border text-muted"}`}
        >
          {activo ? (d.tieneNegocio ? "Pro / Core" : "Core") : "En pausa"}
        </span>
      </div>
      <p className="text-sm text-muted">{mensaje}</p>
      {!d.enGracia && (
        <p className="mt-2 text-xs text-muted">
          Este mes: <strong>{fmt(d.puntosMes)}</strong> de {d.metaMes} puntos · Reserva: <strong>{fmt(d.reserva)}</strong> (máx. {d.reservaMax}).
          Core vale 1 punto, Pro 1.5 y Business 3.
        </p>
      )}
      {regalado && (
        <p className="mt-1 text-xs text-muted">Para subir de plan, suscríbete desde tu cuenta y paga solo la diferencia.</p>
      )}
    </div>
  );
}
