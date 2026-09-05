"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Verificación en dos pasos (MFA) — vive en Configuración, mismo lugar y
// mismo espíritu que PinConfig, pero esto SÍ es el mecanismo real de
// seguridad de la cuenta (el PIN es solo una traba de pantalla rápida). El
// factor TOTP (Google Authenticator, Authy, etc.) lo maneja Supabase Auth
// directamente — este componente solo arma la UI de activar/desactivar
// alrededor de supabase.auth.mfa.* (ver migración 0068 para los códigos de
// respaldo, que sí son nuestros).
//
// Opcional, no obligatorio (decisión de Joel, 4 sept 2026) — cada quien lo
// activa si quiere, para no arriesgar tumbar el login de nadie por un bug
// de día uno de una feature de seguridad.

type Estado = "cargando" | "inactivo" | "activando" | "verificando" | "mostrando_codigos" | "activo" | "desactivar_confirm";

export default function MfaConfig() {
  const supabase = createClient();
  const [estado, setEstado] = useState<Estado>("cargando");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [codigosRespaldo, setCodigosRespaldo] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    cargarEstado();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cargarEstado() {
    const { data } = await supabase.auth.mfa.listFactors();
    const factorVerificado = data?.totp?.find((f) => f.status === "verified");
    setEstado(factorVerificado ? "activo" : "inactivo");
  }

  async function empezarActivacion() {
    setError(null);
    setProcesando(true);
    // Si había un intento anterior sin terminar (factor 'unverified' colgado
    // de una activación que no se completó), lo limpiamos antes de crear
    // uno nuevo — Supabase no deja tener dos factores TOTP a medio activar.
    const { data: factores } = await supabase.auth.mfa.listFactors();
    for (const f of factores?.all ?? []) {
      if (f.factor_type === "totp" && f.status === "unverified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }

    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "VICTOR CFO" });
    setProcesando(false);
    if (error || !data) {
      setError(error?.message || "No se pudo empezar la activación.");
      return;
    }
    setFactorId(data.id);
    // Render directo del SVG en vez de meterlo en un <img src="data:...">
    // (4 sept 2026, reportado por Joel con screenshot: el QR salía como
    // ícono de imagen rota, incluso después de escapar el "#" de los
    // colores hex con encodeURIComponent — seguía sin cargar en
    // producción). dangerouslySetInnerHTML es seguro aquí: el SVG viene de
    // Supabase (fuente de confianza, no de un usuario), nunca de input
    // externo.
    setQrSvg(data.totp.qr_code);
    setSecreto(data.totp.secret);
    setCodigo("");
    setEstado("activando");
  }

  async function confirmarCodigo(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId || codigo.length !== 6) return;
    setProcesando(true);
    setError(null);

    const { data: challenge, error: errChallenge } = await supabase.auth.mfa.challenge({ factorId });
    if (errChallenge || !challenge) {
      setProcesando(false);
      setError(errChallenge?.message || "No se pudo verificar el código.");
      return;
    }

    const { error: errVerify } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: codigo });
    if (errVerify) {
      setProcesando(false);
      setError("Ese código no es correcto. Revisa la hora de tu celular y vuelve a intentar.");
      setCodigo("");
      return;
    }

    // Factor verificado — ahora sí generamos los códigos de respaldo (solo
    // se ven en claro esta vez, nunca más).
    const res = await fetch("/api/mfa/backup-codes/generate", { method: "POST" });
    const json = await res.json().catch(() => null);
    setProcesando(false);

    if (!res.ok || !json?.codigos) {
      // El factor SÍ quedó activo aunque esto falle — no lo dejamos en un
      // estado inconsistente, solo avisamos que los códigos de respaldo no
      // se pudieron generar esta vez.
      setError("MFA quedó activado, pero no se pudieron generar los códigos de respaldo. Intenta de nuevo desde aquí en un momento.");
      setEstado("activo");
      return;
    }

    setCodigosRespaldo(json.codigos);
    setEstado("mostrando_codigos");
  }

  async function desactivar() {
    setProcesando(true);
    setError(null);
    const { data: factores } = await supabase.auth.mfa.listFactors();
    for (const f of factores?.totp ?? []) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);
    }
    setProcesando(false);
    setEstado("inactivo");
  }

  if (estado === "cargando") return null;

  return (
    <div className="vc-card mb-4">
      <p className="text-sm font-semibold">Verificación en dos pasos (MFA)</p>

      {estado === "inactivo" && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-text">
            Pide un código de tu celular además de la contraseña al entrar — la forma más real de proteger tu
            cuenta, ya que aquí conectas tu banco y cobros.
          </p>
          <button
            onClick={empezarActivacion}
            disabled={procesando}
            className="ml-3 flex-shrink-0 rounded-pill border border-teal px-3 py-1.5 text-xs font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            {procesando ? "..." : "Activar"}
          </button>
        </div>
      )}

      {estado === "activo" && (
        <div className="mt-2 flex items-center justify-between">
          <p className="text-sm text-text">Activada — cada vez que entres te vamos a pedir un código de 6 dígitos.</p>
          <button
            onClick={() => setEstado("desactivar_confirm")}
            disabled={procesando}
            className="ml-3 flex-shrink-0 rounded-pill border border-border px-3 py-1.5 text-xs font-medium text-muted"
          >
            Desactivar
          </button>
        </div>
      )}

      {estado === "desactivar_confirm" && (
        <div className="mt-3">
          <p className="text-sm text-text">
            ¿Seguro que quieres desactivar la verificación en dos pasos? Tu cuenta va a quedar protegida solo con
            la contraseña.
          </p>
          {error && <p className="mt-2 text-xs text-red">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={desactivar}
              disabled={procesando}
              className="rounded-lg border border-red px-3 py-1.5 text-xs font-medium text-red"
            >
              {procesando ? "Desactivando..." : "Sí, desactivar"}
            </button>
            <button
              onClick={() => setEstado("activo")}
              disabled={procesando}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {estado === "activando" && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-text">
            Escanea este código con Google Authenticator, Authy, o cualquier app de autenticación:
          </p>
          {qrSvg && (
            <div
              className="mx-auto mb-3 h-40 w-40 rounded-lg border border-border p-2 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}
          {secreto && (
            <p className="mb-3 text-center text-xs text-muted">
              ¿No puedes escanear? Escribe este código a mano: <span className="font-mono font-medium text-text">{secreto}</span>
            </p>
          )}
          <form onSubmit={confirmarCodigo} className="flex flex-col items-center gap-3">
            <input
              className="vc-input w-40 text-center text-lg tracking-widest"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
            {error && <p className="text-xs text-red">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className="vc-btn-primary" disabled={procesando || codigo.length !== 6}>
                {procesando ? "Verificando..." : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEstado("inactivo");
                  setError(null);
                }}
                disabled={procesando}
                className="rounded-lg border border-border px-4 py-3 text-sm text-muted"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {estado === "mostrando_codigos" && (
        <div className="mt-3">
          <p className="mb-1 text-sm font-medium text-text">¡Activada! Guarda estos códigos de respaldo</p>
          <p className="mb-3 text-xs text-muted">
            Si algún día pierdes el celular con tu app de autenticación, usa uno de estos códigos para entrar. Cada
            uno funciona una sola vez. Guárdalos en un lugar seguro — esta es la única vez que los vas a ver.
          </p>
          <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg p-3 font-mono text-xs">
            {codigosRespaldo.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button onClick={() => setEstado("activo")} className="vc-btn-primary w-full">
            Ya los guardé
          </button>
        </div>
      )}
    </div>
  );
}
