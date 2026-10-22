"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Invitar al contador/CPA — GRATIS para cualquier plan (Core o Pro), no
// es un upsell. La idea de negocio: un cliente invita a su CPA sin costo,
// el CPA entra y ve lo que necesita, y de ahí ese mismo CPA termina
// invitando a sus otros clientes a VICTOR — el loop se paga solo.
// El guardado + envío de correo pasa por /api/cpa-invite (necesita la
// llave de Resend del servidor, así que no puede ser un insert directo
// desde aquí).
//
// 2 oct 2026 (pedido de Joel, "Opción B"): un CPA líder (ej. Héctor) puede
// invitar a su propio equipo (ej. Josué) desde SU portal (/cpa/equipo) sin
// que Joel participe — en cuanto el colega acepta, hereda automáticamente
// los mismos clientes del líder (migración 0137). Para que eso no se
// sienta como perder el control, esta página ahora también muestra TODO
// el que tiene acceso hoy (directo o heredado, con "agregado por X") y
// deja apagarle el acceso a cualquiera individualmente — sin afectar al
// resto. Usa el cliente normal (no una API aparte): la RLS
// account_members_owner_write ya garantiza que Joel solo puede leer/tocar
// sus propias filas.
type AccesoCpa = {
  id: string;
  member_email: string;
  active: boolean;
  entity_id: string | null;
  delegated_from_email: string | null;
  // 0146: el contable ve tus finanzas PERSONALES solo si lo activas aquí.
  share_personal: boolean;
};

export default function InvitarContablePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ emailSent: boolean; emailReason?: string } | null>(null);

  const [cpaName, setCpaName] = useState("");
  const [cpaEmail, setCpaEmail] = useState("");
  const [mensaje, setMensaje] = useState("");

  const [accesos, setAccesos] = useState<AccesoCpa[]>([]);
  const [cargandoAccesos, setCargandoAccesos] = useState(true);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  // Entidades del dueño (0185: el acceso del contable es por entidad).
  const [entidades, setEntidades] = useState<{ id: string; name: string }[]>([]);
  const [todas, setTodas] = useState(true);
  const [elegidas, setElegidas] = useState<string[]>([]);

  const nombreEntidad = (id: string | null) =>
    id ? entidades.find((e) => e.id === id)?.name ?? "Entidad" : "Todas tus entidades";

  async function cargarAccesos() {
    const { data } = await supabase
      .from("account_members")
      .select("id, member_email, active, entity_id, delegated_from_email, share_personal")
      .eq("role", "cpa")
      .order("invited_at", { ascending: false });
    setAccesos(data ?? []);
    setCargandoAccesos(false);
  }

  useEffect(() => {
    cargarAccesos();
    supabase
      .from("business_entities")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setEntidades((data ?? []) as { id: string; name: string }[]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrupa las filas por correo: un contable puede tener varias entidades.
  const porContable = (() => {
    const m = new Map<string, AccesoCpa[]>();
    for (const a of accesos) {
      const k = a.member_email.toLowerCase();
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return Array.from(m.values());
  })();

  async function toggleAcceso(id: string, nuevoActivo: boolean) {
    setActualizandoId(id);
    const { error: updateError } = await supabase.from("account_members").update({ active: nuevoActivo }).eq("id", id);
    if (!updateError) await cargarAccesos();
    setActualizandoId(null);
  }

  // El permiso de lo personal es por contable (no por entidad): se aplica a
  // todas sus filas para que quede consistente.
  async function togglePersonal(ids: string[], compartir: boolean) {
    setActualizandoId(ids[0]);
    const { error: updateError } = await supabase
      .from("account_members")
      .update({ share_personal: compartir })
      .in("id", ids);
    if (!updateError) await cargarAccesos();
    setActualizandoId(null);
  }

  async function enviarInvitacion() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/cpa-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cpaName: cpaName || null,
          cpaEmail,
          customMessage: mensaje || null,
          entityIds: todas || entidades.length <= 1 ? [] : elegidas,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data?.error || "No se pudo enviar la invitación.");

      setResultado({ emailSent: !!data.emailSent, emailReason: data.emailReason });
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
              : resultado.emailReason?.includes("RESEND_API_KEY")
                ? `Guardamos la invitación para ${cpaEmail}, pero el envío automático del correo todavía no está conectado — mientras tanto, avísale tú mismo que ya lo invitaste.`
                : `Guardamos la invitación para ${cpaEmail}, pero el correo no se pudo mandar (mientras el dominio de envío no esté verificado en Resend, solo entrega a la bandeja del dueño de la cuenta). Avísale tú mismo que ya lo invitaste mientras tanto.${
                    resultado.emailReason ? ` Detalle técnico: ${resultado.emailReason}` : ""
                  }`}
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
        <button onClick={() => router.push("/dashboard")} className="vc-btn-back">
          Cancelar
        </button>
      </div>

      <div className="mb-4 rounded-lg p-3.5 text-sm text-white" style={{ background: "#1B3A5C" }}>
        <p className="font-medium">Acceso gratis · sin costo adicional</p>
        <p className="mt-1 text-xs text-white/80">
          Tu contable trabaja con las entidades que le asignes (facturas, pagos, nómina y reportes) sin pagar nada extra — ni tú ni él.
        </p>
      </div>

      <div className="vc-card mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">¿Todavía no tienes contable?</p>
          <p className="text-[11px] text-muted">Mira los contables de VICTOR y escoge por pueblo y especialidad.</p>
        </div>
        <a href="/dashboard/contables" className="shrink-0 rounded-pill bg-teal px-3 py-1.5 text-xs font-medium text-white">
          Buscar contable
        </a>
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

        {entidades.length > 1 && (
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-muted">¿Qué entidades verá?</label>
            <label className="mb-1 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={todas} onChange={(e) => setTodas(e.target.checked)} />
              Todas mis entidades
            </label>
            {!todas && (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-2.5">
                {entidades.map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={elegidas.includes(e.id)}
                      onChange={(ev) =>
                        setElegidas((prev) => (ev.target.checked ? [...prev, e.id] : prev.filter((x) => x !== e.id)))
                      }
                    />
                    {e.name}
                  </label>
                ))}
                <p className="mt-1 text-[11px] text-muted">
                  Este contable solo verá y trabajará (facturas, pagos, nómina) las entidades marcadas. Puedes invitar a otro
                  contable para las demás.
                </p>
              </div>
            )}
          </div>
        )}

        <button
          className="vc-btn-primary mt-1"
          disabled={!cpaEmail || loading || (!todas && entidades.length > 1 && elegidas.length === 0)}
          onClick={enviarInvitacion}
        >
          {loading ? "Guardando..." : "Invitar"}
        </button>
      </div>

      <div className="vc-card mt-4">
        <p className="mb-1 text-xs uppercase tracking-wide text-muted">Quién tiene acceso hoy</p>
        <p className="mb-3 text-xs text-muted">
          Cada contable aparece con las entidades que tiene asignadas (puedes tener uno distinto por entidad). Incluye a
          los colegas que ellos hayan agregado a su equipo — a cualquiera lo puedes apagar aquí sin afectar a los demás.
        </p>
        {cargandoAccesos ? (
          <p className="text-xs text-muted">Cargando...</p>
        ) : accesos.length === 0 ? (
          <p className="text-xs text-muted">Todavía no has invitado a ningún contable.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {porContable.map((filas) => {
              const activas = filas.filter((f) => f.active);
              const personalOn = activas.some((f) => f.share_personal);
              return (
                <div key={filas[0].member_email} className="py-3">
                  <p className="text-sm font-medium">{filas[0].member_email}</p>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {filas.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5">
                        <div className="min-w-0">
                          <p className={`truncate text-xs font-medium ${a.active ? "" : "text-muted line-through"}`}>
                            {nombreEntidad(a.entity_id)}
                          </p>
                          {a.delegated_from_email && (
                            <p className="text-[11px] text-muted">agregado por {a.delegated_from_email}</p>
                          )}
                        </div>
                        <button
                          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-medium ${
                            a.active ? "bg-red/10 text-red" : "bg-grn/10 text-grn"
                          }`}
                          disabled={actualizandoId === a.id}
                          onClick={() => toggleAcceso(a.id, !a.active)}
                        >
                          {actualizandoId === a.id ? "..." : a.active ? "Quitar acceso" : "Reactivar"}
                        </button>
                      </div>
                    ))}
                  </div>
                  {activas.length > 0 && (
                    <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={personalOn}
                        disabled={actualizandoId === activas[0].id}
                        onChange={(e) =>
                          togglePersonal(
                            filas.map((f) => f.id),
                            e.target.checked
                          )
                        }
                      />
                      <span className="text-xs">
                        <span className="font-medium">Compartir también mis finanzas personales</span>
                        <span className="block text-muted">
                          {personalOn
                            ? "Ve tus ingresos, gastos, impuestos estimados, metas y documentos personales. Puedes apagarlo cuando quieras."
                            : "Apagado: solo ve las entidades de negocio indicadas arriba. Actívalo si te prepara también tu planilla personal."}
                        </span>
                      </span>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
