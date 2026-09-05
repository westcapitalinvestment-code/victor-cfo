"use client";

// Modal de confirmación con advertencia de entidad (4 sept 2026, pedido de
// Joel: "en el mockup teniamos esa advertencia de pago por entidad para que
// no se confundiera en caso de que tenga mas de una entidad el usuario").
// Se muestra justo antes de un registro que ya no se puede deshacer con un
// solo click (Registrar corrida en Pagos, Registrar pago en Facturación) —
// el nombre de la entidad se repite a propósito dos veces (en la frase y en
// la fila de abajo), calcado del mockup, porque el punto es exactamente que
// no pase desapercibido si el selector de entidad del topbar quedó en la
// entidad equivocada. Compartido entre Pagos y Facturación — mismo diseño,
// misma necesidad en los dos.
export type LineaConfirmacion = {
  label: string;
  valor: string;
  tono?: "amb" | "red";
};

export default function ConfirmarPagoModal({
  abierto,
  titulo = "¿Confirmas este pago?",
  descripcion,
  entidadNombre,
  lineas,
  confirmando = false,
  labelConfirmar = "Sí, registrar pago",
  onConfirmar,
  onCancelar,
}: {
  abierto: boolean;
  titulo?: string;
  /** Texto antes de "bajo {entidadNombre}." — ej. "Vas a registrar un pago a José Ramírez por $1,500.00" */
  descripcion: string;
  entidadNombre: string;
  lineas: LineaConfirmacion[];
  confirmando?: boolean;
  labelConfirmar?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancelar}>
      <div
        className="vc-card w-full max-w-sm rounded-b-none text-center sm:rounded-b-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <i className="ti ti-alert-triangle mb-2 text-2xl" style={{ color: "#D97706" }} />
        <p className="mb-1 text-sm font-semibold">{titulo}</p>
        <p className="mb-3 text-sm text-muted">
          {descripcion} bajo <span className="font-medium text-text">{entidadNombre}</span>.
        </p>

        <div className="mb-3 rounded-lg border border-border bg-bg p-2.5 text-left text-xs">
          {lineas.map((l, i) => (
            <div key={i} className="flex justify-between py-1">
              <span className={l.tono === "amb" ? "text-amb" : l.tono === "red" ? "text-red" : "text-muted"}>{l.label}</span>
              <span className={`font-medium ${l.tono === "amb" ? "text-amb" : l.tono === "red" ? "text-red" : ""}`}>{l.valor}</span>
            </div>
          ))}
          <div className="mt-0.5 flex justify-between border-t border-border pt-1.5">
            <span className="text-muted">Entidad que paga</span>
            <span className="font-medium">{entidadNombre}</span>
          </div>
        </div>

        <button className="vc-btn-primary mb-2" disabled={confirmando} onClick={onConfirmar}>
          {confirmando ? "Guardando..." : labelConfirmar}
        </button>
        <button className="w-full text-xs text-muted hover:opacity-80" onClick={onCancelar} disabled={confirmando}>
          Revisar antes de confirmar
        </button>
      </div>
    </div>
  );
}
