"use client";

import { useState } from "react";

// Cobro con tarjeta por B2B Merchant (Authorize.Net) — 18 nov 2026. El
// negocio pega las credenciales de su cuenta de Authorize.Net (se las da B2B
// Merchant) y VICTOR las prueba, las guarda cifradas y registra el aviso de
// pagos. Las llaves nunca se muestran de vuelta.
export default function CobroB2B({
  entityId,
  activo,
  apiLoginId,
  ambiente,
}: {
  entityId: string;
  activo: boolean | null | undefined;
  apiLoginId: string | null | undefined;
  ambiente: string | null | undefined;
}) {
  const [conectado, setConectado] = useState(!!activo);
  const [abierto, setAbierto] = useState(false);
  const [loginId, setLoginId] = useState(apiLoginId ?? "");
  const [transactionKey, setTransactionKey] = useState("");
  const [signatureKey, setSignatureKey] = useState("");
  const [amb, setAmb] = useState(ambiente === "produccion" ? "produccion" : "sandbox");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error" | "aviso"; texto: string } | null>(null);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const res = await fetch(`/api/entidades/${entityId}/b2b-merchant`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiLoginId: loginId, transactionKey, signatureKey, ambiente: amb }),
    });
    const json = await res.json().catch(() => null);
    setGuardando(false);
    if (res.ok && json?.ok) {
      setConectado(true);
      setAbierto(false);
      setTransactionKey("");
      setSignatureKey("");
      setMensaje(json.avisoWebhook ? { tipo: "aviso", texto: json.avisoWebhook } : { tipo: "ok", texto: "Conectado. Tus facturas ya se pueden cobrar con tarjeta por B2B Merchant." });
    } else {
      setMensaje({ tipo: "error", texto: json?.error || "No se pudo conectar. Intenta de nuevo." });
    }
  }

  async function desconectar() {
    if (!confirm("¿Desconectar B2B Merchant? Tus facturas dejarán de cobrarse por ahí.")) return;
    setGuardando(true);
    const res = await fetch(`/api/entidades/${entityId}/b2b-merchant`, { method: "DELETE" });
    setGuardando(false);
    if (res.ok) {
      setConectado(false);
      setMensaje({ tipo: "ok", texto: "Desconectado." });
    }
  }

  const input = "vc-input mt-1 w-full";

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Cobro con tarjeta (B2B Merchant)</p>
          <p className="mt-0.5 text-xs text-muted">
            {conectado
              ? `Activo${amb === "sandbox" ? " en modo de pruebas" : ""}. Si también tienes Stripe, las facturas se cobran por B2B Merchant.`
              : "Si tu terminal o cuenta de cobro es de B2B Merchant, conéctala aquí con las credenciales de Authorize.Net que te dieron."}
          </p>
        </div>
        {conectado ? (
          <span className="shrink-0 rounded-pill bg-teal/10 px-2 py-1 text-[11px] font-medium text-teal">Activo ✓</span>
        ) : (
          !abierto && (
            <button
              onClick={() => setAbierto(true)}
              className="shrink-0 rounded-lg border border-teal px-3 py-1.5 text-xs font-medium text-teal"
              style={{ background: "rgba(29,158,117,.1)" }}
            >
              Conectar
            </button>
          )
        )}
      </div>

      {abierto && (
        <div className="mt-3 space-y-2">
          <label className="block text-xs">
            API Login ID
            <input className={input} name="authnet-login-id" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="off" data-1p-ignore data-lpignore="true" />
          </label>
          <label className="block text-xs">
            Transaction Key{conectado && " (déjala vacía para no cambiarla)"}
            <input className={input} type="password" name="authnet-transaction-key" value={transactionKey} onChange={(e) => setTransactionKey(e.target.value)} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
          </label>
          <label className="block text-xs">
            Signature Key{conectado && " (déjala vacía para no cambiarla)"}
            <input className={input} type="password" name="authnet-signature-key" value={signatureKey} onChange={(e) => setSignatureKey(e.target.value)} autoComplete="new-password" data-1p-ignore data-lpignore="true" />
          </label>
          <label className="block text-xs">
            Ambiente
            <select className={input} value={amb} onChange={(e) => setAmb(e.target.value)}>
              <option value="sandbox">Pruebas (sandbox)</option>
              <option value="produccion">Producción (cobros reales)</option>
            </select>
          </label>
          <p className="text-[11px] text-muted">
            Las encuentras en Authorize.Net → Account → Settings → API Credentials &amp; Keys. Se guardan cifradas y nunca se muestran de vuelta.
          </p>
          <div className="flex gap-2">
            <button onClick={guardar} disabled={guardando} className="rounded-lg bg-teal px-3 py-1.5 text-xs font-medium text-white">
              {guardando ? "Probando..." : "Guardar y probar"}
            </button>
            <button onClick={() => setAbierto(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {conectado && !abierto && (
        <div className="mt-2 flex gap-2">
          <button onClick={() => setAbierto(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs">
            Cambiar credenciales
          </button>
          <button onClick={desconectar} disabled={guardando} className="rounded-lg border border-border px-3 py-1.5 text-xs text-red">
            Desconectar
          </button>
        </div>
      )}

      {mensaje && (
        <p className={`mt-2 text-xs ${mensaje.tipo === "error" ? "text-red" : mensaje.tipo === "aviso" ? "text-amber-600" : "text-teal"}`}>
          {mensaje.texto}
        </p>
      )}
    </div>
  );
}
