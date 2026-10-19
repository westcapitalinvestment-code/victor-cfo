"use client";

import { useEffect, useState } from "react";

// Cambio de plan dentro de la suscripción que el cliente ya tiene (18 oct
// 2026). Subir (Core→Pro→Business) es inmediato y se cobra al momento la
// diferencia prorrateada; bajar queda programado para el final del ciclo ya
// pagado. Ver app/api/stripe/cambiar-plan/route.ts.

type PlanId = "core" | "pro" | "proplus";
type Estado = {
  puedeCambiar: boolean;
  plan?: PlanId;
  ciclo?: "mensual" | "anual" | null;
  pendiente?: { plan: PlanId; ciclo: string; fecha: string } | null;
  disponibles?: Partial<Record<PlanId, boolean>>;
};

const ORDEN: PlanId[] = ["core", "pro", "proplus"];
const NOMBRE: Record<PlanId, string> = { core: "Core", pro: "Pro", proplus: "Business" };
const DESCRIPCION: Record<PlanId, string> = {
  core: "Finanzas personales",
  pro: "Tu negocio: facturación, cobros, técnicos y más",
  proplus: "Todo incluido: técnicos, administrador, secretaria y pagos",
};
const PRECIO: Record<PlanId, { mensual: string; anual?: string }> = {
  core: { mensual: "$14.99/mes", anual: "$164/año" },
  pro: { mensual: "$49.99/mes" },
  proplus: { mensual: "$99.99/mes", anual: "$1,099/año" },
};

function fechaLarga(iso: string) {
  return new Date(iso).toLocaleDateString("es-PR", { day: "numeric", month: "long", year: "numeric" });
}

export default function CambiarPlan() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function cargar() {
    const r = await fetch("/api/stripe/cambiar-plan");
    if (r.ok) setEstado(await r.json());
  }
  useEffect(() => {
    cargar();
  }, []);

  if (!estado?.puedeCambiar || !estado.plan) return null;
  const actual = estado.plan;
  const ciclo = estado.ciclo ?? "mensual";

  async function cambiar(destino: PlanId) {
    const sube = ORDEN.indexOf(destino) > ORDEN.indexOf(actual);
    const msg = sube
      ? `Vas a subir a ${NOMBRE[destino]}. Se te cobra hoy la diferencia prorrateada por los días que quedan de tu ciclo y tienes acceso de inmediato.${destino === "proplus" ? " Los addons que Business ya incluye (Técnicos, Pagos, Administrador y Secretaria) dejan de cobrarse." : ""} ¿Continuar?`
      : `Vas a bajar a ${NOMBRE[destino]}. Conservas ${NOMBRE[actual]} hasta que termine el ciclo que ya pagaste y después cambia, sin reembolsos ni créditos.${destino === "core" ? " Los addons de negocio dejarán de estar disponibles." : ""} ¿Continuar?`;
    if (!window.confirm(msg)) return;
    setTrabajando(destino);
    setError(null);
    setAviso(null);
    const r = await fetch("/api/stripe/cambiar-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: destino, ciclo }),
    });
    const j = await r.json().catch(() => null);
    setTrabajando(null);
    if (!r.ok) {
      setError(j?.error || "No se pudo cambiar el plan. Intenta de nuevo.");
      return;
    }
    if (j.tipo === "subida") {
      window.location.reload();
      return;
    }
    setAviso(`Listo: pasas a ${NOMBRE[destino]} el ${fechaLarga(j.fecha)}.`);
    cargar();
  }

  async function cancelarBajada() {
    setTrabajando("cancelar");
    setError(null);
    const r = await fetch("/api/stripe/cambiar-plan", { method: "DELETE" });
    setTrabajando(null);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setError(j?.error || "No se pudo cancelar el cambio.");
      return;
    }
    setAviso(null);
    cargar();
  }

  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-muted">
        Tu plan: <strong className="text-text">{NOMBRE[actual]}</strong> ({ciclo})
      </p>

      {estado.pendiente && (
        <div className="mb-2 rounded-lg border border-amb bg-amb/[.08] px-3 py-2 text-xs">
          Cambio programado a <strong>{NOMBRE[estado.pendiente.plan]}</strong> el{" "}
          <strong>{fechaLarga(estado.pendiente.fecha)}</strong>.{" "}
          <button onClick={cancelarBajada} disabled={trabajando !== null} className="underline">
            {trabajando === "cancelar" ? "Cancelando..." : "Cancelar cambio"}
          </button>
        </div>
      )}
      {aviso && <p className="mb-2 text-xs text-teal">{aviso}</p>}
      {error && <p className="mb-2 text-xs text-red">{error}</p>}

      <div className="flex flex-col gap-2">
        {ORDEN.filter((p) => p !== actual && estado.disponibles?.[p] !== false).map((p) => {
          const sube = ORDEN.indexOf(p) > ORDEN.indexOf(actual);
          const precio = PRECIO[p][ciclo] ?? PRECIO[p].mensual;
          return (
            <button
              key={p}
              onClick={() => cambiar(p)}
              disabled={trabajando !== null}
              className={`rounded-lg border p-3 text-left ${sube ? "border-teal" : "border-border"}`}
              style={sube ? { background: "rgba(29,158,117,.08)" } : undefined}
            >
              <span className={`block text-sm font-medium ${sube ? "text-teal" : "text-muted"}`}>
                {trabajando === p ? "Procesando..." : `${sube ? "Subir" : "Bajar"} a ${NOMBRE[p]} · ${precio}`}
              </span>
              <span className="block text-[11px] text-muted">
                {DESCRIPCION[p]} · {sube ? "se cobra hoy la diferencia" : "al final de tu ciclo"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
