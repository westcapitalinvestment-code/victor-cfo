"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Invitar al contador/CPA — GRATIS para cualquier plan (Core o Pro), no
// es un upsell. La idea de negocio: un cliente invita a su CPA sin costo,
// el CPA entra y ve lo que necesita, y de ahí ese mismo CPA termina
// invitando a sus otros clientes a VICTOR — el loop se paga solo.
// El guardado + envío de correo pasa por /api/cpa-invite (necesita la
// llave de Resend del servidor, así que no puede ser un insert directo
// desde aquí).
export default function InvitarContablePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ emailSent: boolean } | null>(null);

  const [cpaName, setCpaName] = useState("");
  const [cpaEmail, setCpaEmail] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function enviarInvitacion() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/cpa-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpaName: cpaName || null, cpaEmail, customMessage: mensaje || null }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "No se pudo enviar la invitación.");

      setResultado({ emailSent: !!data.emailSent });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setLoading(false);
    }
  }

  if (resultado) {
    return (
      <div className="vc-shell">
        <div className="vc-card text-center">
          <div className="mb-2 text-3xl">{resultado.emailSent ? "✅" : "📝"}</div>
          <p className="mb-1 text-sm font-medium">
            {resultado.emailSent ? "Invitación enviada" : "Invitación guardada"}
          </p>
          <p className="mb-4 text-xs text-muted">
            {resultado.emailSent
              ? `Le mandamos un correo a ${cpaEmail} avisándole que lo invitaste a VICTOR.`
              : `Guardamos la invitación para ${cpaEmail}, pero el envío automático del correo todavía no está conectado — mientras tanto, avísale tú mismo que ya lo invitaste.`}
          </p>
          <button className="vc-btn-primary" onClick={() => router.push("/dashboard")}>
            Volver a Inicio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Invita a tu contable</h1>
        <button onClick={() => router.push("/dashboard")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
        <p className="font-medium">Acceso gratis · sin costo adicional</p>
        <p className="mt-1 text-xs text-white/80">
          Tu contable puede ver lo que compartas con él sin pagar nada extra — ni tú ni él.
        </p>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre (opcional)</label>
          <input className="vc-input" placeholder="Nombre y apellidos" value={cpaName} onChange={(e) => setCpaName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Correo del contable</label>
          <input
            className="vc-input"
            type="email"
            placeholder="correo@contabilidad.com"
            value={cpaEmail}
            onChange={(e) => setCpaEmail(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Mensaje (opcional)</label>
          <textarea
            className="vc-input"
            rows={3}
            placeholder="Hola, te invité a ver mis finanzas en VICTOR..."
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
          />
        </div>

        <button className="vc-btn-primary mt-1" disabled={!cpaEmail || loading} onClick={enviarInvitacion}>
          {loading ? "Guardando..." : "Invitar"}
        </button>
      </div>
    </div>
  );
}
