"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// "Mi equipo" dentro del Portal CPA — 2 oct 2026, pedido de Joel: un CPA
// líder (ej. Héctor) con cientos de clientes no debería tener que pedirle
// al dueño que invite a cada colega suyo (ej. Josué) uno por uno. Desde
// aquí Héctor invita directamente; en cuanto el colega acepta, hereda
// AUTOMÁTICAMENTE todos los clientes activos de Héctor (migración 0137) —
// sin tocar nada del lado del dueño. El dueño, por su parte, siempre
// puede ver quién tiene acceso a su cuenta y quitárselo a cualquiera
// individualmente desde /dashboard/invitar-contable, sin que esto lo
// afecte a él.
type InvitacionEquipo = {
  id: string;
  staff_name: string | null;
  staff_email: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
};

export default function EquipoCpaPage() {
  const router = useRouter();

  const [cargando, setCargando] = useState(true);
  const [invitaciones, setInvitaciones] = useState<InvitacionEquipo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ emailSent: boolean; emailReason?: string } | null>(null);

  async function cargarInvitaciones() {
    try {
      const res = await fetch("/api/cpa-equipo/invitar");
      const data = await res.json();
      if (res.ok) setInvitaciones(data.invitaciones ?? []);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarInvitaciones();
  }, []);

  async function enviarInvitacion() {
    setEnviando(true);
    setError(null);
    setResultado(null);

    try {
      const res = await fetch("/api/cpa-equipo/invitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffName: staffName || null, staffEmail }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "No se pudo enviar la invitación.");

      setResultado({ emailSent: !!data.emailSent, emailReason: data.emailReason });
      setStaffName("");
      setStaffEmail("");
      cargarInvitaciones();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Algo salió mal.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="vc-shell">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Mi equipo</h1>
        <button onClick={() => router.push("/cpa")} className="text-sm text-muted hover:opacity-80">
          Volver
        </button>
      </div>

      <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
        <p className="font-medium">Comparte tus clientes con tu equipo</p>
        <p className="mt-1 text-xs text-white/80">
          Invita a un colega y, en cuanto acepte, va a ver automáticamente los mismos clientes que tú — sin que
          nadie más tenga que hacer nada. Si consigues un cliente nuevo después, tu equipo lo ve solo.
        </p>
      </div>

      <div className="vc-card mb-4 flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}
        {resultado && (
          <p className="text-xs text-grn">
            {resultado.emailSent
              ? "Invitación enviada — en cuanto tu colega la acepte, va a ver tus clientes."
              : "Guardamos la invitación, pero el correo automático no se pudo mandar — avísale tú mismo mientras tanto."}
          </p>
        )}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Nombre (opcional)</label>
          <input className="vc-input" placeholder="Nombre y apellidos" value={staffName} onChange={(e) => setStaffName(e.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Correo de tu colega</label>
          <input
            className="vc-input"
            type="email"
            placeholder="correo@contabilidad.com"
            value={staffEmail}
            onChange={(e) => setStaffEmail(e.target.value)}
          />
        </div>

        <button className="vc-btn-primary mt-1" disabled={!staffEmail || enviando} onClick={enviarInvitacion}>
          {enviando ? "Enviando..." : "Invitar a mi equipo"}
        </button>
      </div>

      <div className="vc-card">
        <p className="mb-3 text-xs uppercase tracking-wide text-muted">Tu equipo ({invitaciones.length})</p>
        {cargando ? (
          <p className="text-xs text-muted">Cargando...</p>
        ) : invitaciones.length === 0 ? (
          <p className="text-xs text-muted">Todavía no has invitado a nadie de tu equipo.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {invitaciones.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{inv.staff_name || inv.staff_email}</p>
                  <p className="text-xs text-muted">{inv.staff_email}</p>
                </div>
                <span
                  className={
                    "rounded-full px-2 py-1 text-[10px] font-medium " +
                    (inv.status === "accepted" ? "bg-grn/10 text-grn" : "bg-amb/10 text-amb")
                  }
                >
                  {inv.status === "accepted" ? "Activo" : "Pendiente"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
