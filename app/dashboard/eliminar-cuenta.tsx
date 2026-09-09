"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Auto-eliminación de cuenta (self-service) — tarea #81, migración 0077.
// Dos vistas posibles:
//  1. Sin eliminación pendiente: "Zona de peligro" con un formulario de
//     confirmación (contraseña + escribir "ELIMINAR") — igual de serio que
//     borrar un repo de GitHub, a propósito, porque es irreversible pasado
//     el plazo de gracia.
//  2. Con eliminación pendiente (deletionScheduledFor): banner con la
//     fecha y un botón para deshacerlo, mientras siga dentro de los 30
//     días de gracia.
export default function EliminarCuenta({ deletionScheduledFor }: { deletionScheduledFor: string | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (deletionScheduledFor) {
    const fecha = new Date(deletionScheduledFor).toLocaleDateString("es-PR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    async function cancelar() {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/cuenta/cancelar-eliminacion", { method: "POST" });
      const json = await res.json().catch(() => null);
      setLoading(false);
      if (!res.ok) {
        setError(json?.error || "No se pudo cancelar. Intenta de nuevo.");
        return;
      }
      router.refresh();
    }

    return (
      <div className="vc-card mb-4 border border-amber-400" style={{ background: "rgba(217,119,6,.08)" }}>
        <p className="text-sm font-semibold">Tu cuenta será eliminada el {fecha}</p>
        <p className="mt-1 text-xs text-muted">
          Pediste eliminar tu cuenta. Tienes acceso normal hasta esa fecha — si cambiaste de idea, puedes
          cancelarlo aquí mismo.
        </p>
        {error && <p className="mt-2 text-xs text-red">{error}</p>}
        <button
          onClick={cancelar}
          disabled={loading}
          className="mt-3 w-full rounded-lg border border-amber-500 p-3 text-sm font-medium text-amber-700"
        >
          {loading ? "Cancelando..." : "Cancelar eliminación"}
        </button>
      </div>
    );
  }

  async function eliminar() {
    setLoading(true);
    setError(null);

    const res = await fetch("/api/cuenta/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmacion }),
    });
    const json = await res.json().catch(() => null);

    if (!res.ok) {
      setLoading(false);
      setError(json?.error || "No se pudo procesar la solicitud. Intenta de nuevo.");
      return;
    }

    // La cuenta queda programada, no borrada al instante — cerramos sesión
    // igual, porque el usuario ya pidió salir del producto.
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="vc-card mb-4">
      <p className="text-sm font-semibold text-red">Zona de peligro</p>
      {!abierto ? (
        <>
          <p className="mt-1 text-xs text-muted">
            Eliminar tu cuenta borra tu información personal y financiera de forma permanente (conservamos solo
            facturas y pagos ya emitidos, si aplica, por obligación contable).
          </p>
          {/* Relleno rojo clarito a propósito (8 sept 2026, pedido de Joel:
              "que de panico oprimirla para q nunca se salgan jajaja") — antes
              era solo el borde rojo, igual que cualquier botón secundario.
              Con fondo rojo se ve más "zona de peligro" de verdad, sin llegar
              a ser un botón sólido rojo fuerte (ese nivel de alarma se
              reserva para el modal de confirmación que sigue). */}
          <button
            onClick={() => setAbierto(true)}
            className="mt-3 w-full rounded-lg border border-red p-3 text-sm font-medium text-red"
            style={{ background: "rgba(207,34,46,.08)" }}
          >
            Eliminar mi cuenta
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-xs text-muted">
            Tu suscripción se cancela al final del período que ya pagaste. Tu cuenta queda archivada 30 días — si
            cambias de idea, puedes cancelar la eliminación en cualquier momento dentro de ese plazo. Pasados los
            30 días, se borra todo de forma permanente.
          </p>

          <label className="mb-1 mt-3 block text-xs font-medium text-muted">Tu contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border p-2.5 text-sm"
            autoComplete="current-password"
          />

          <label className="mb-1 mt-3 block text-xs font-medium text-muted">
            Escribe <strong>ELIMINAR</strong> para confirmar
          </label>
          <input
            type="text"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            className="w-full rounded-lg border border-border p-2.5 text-sm uppercase"
          />

          {error && <p className="mt-2 text-xs text-red">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setAbierto(false);
                setError(null);
                setPassword("");
                setConfirmacion("");
              }}
              className="flex-1 rounded-lg border border-border p-3 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={eliminar}
              disabled={loading || confirmacion.trim().toUpperCase() !== "ELIMINAR" || !password}
              className="flex-1 rounded-lg border border-red p-3 text-sm font-medium text-red disabled:opacity-40"
            >
              {loading ? "Procesando..." : "Sí, eliminar mi cuenta"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
