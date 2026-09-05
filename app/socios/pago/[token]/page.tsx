"use client";

import { useEffect, useState } from "react";

// Página pública protegida por token (migración 0071, 5 sept 2026) donde un
// socio APROBADO llena su propia info bancaria para que Joel le pague por
// ACH desde Mercury — sin cuenta ni login de por medio (un socio externo no
// necesariamente es cliente de VICTOR CFO). El token es el uuid
// payment_token generado al aprobar (ver app/api/socios/[id]/route.ts);
// Joel se lo manda manual por WhatsApp/email, mismo patrón que ya usa para
// el código de referido. Nunca se le muestra al socio su propio número una
// vez guardado — este formulario es de una sola vía (escribir, no leer).
export default function PagoSocioPage({ params }: { params: { token: string } }) {
  const [cargando, setCargando] = useState(true);
  const [valido, setValido] = useState(false);
  const [nombreSocio, setNombreSocio] = useState("");
  const [yaCompletado, setYaCompletado] = useState(false);

  const [bankName, setBankName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmarAccountNumber, setConfirmarAccountNumber] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/socios/pago/${params.token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.valido) {
          setValido(true);
          setNombreSocio(json.nombre ?? "");
          setYaCompletado(!!json.yaCompletado);
        }
      })
      .finally(() => setCargando(false));
  }, [params.token]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim() || !routingNumber.trim() || !accountNumber.trim()) {
      setError("Completa todos los campos.");
      return;
    }
    if (accountNumber !== confirmarAccountNumber) {
      setError("El número de cuenta no coincide en los dos campos — revísalo.");
      return;
    }
    if (!/^\d{9}$/.test(routingNumber.trim())) {
      setError("El routing number debe tener exactamente 9 dígitos.");
      return;
    }

    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/socios/pago/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bankName: bankName.trim(),
        routingNumber: routingNumber.trim(),
        accountNumber: accountNumber.trim(),
      }),
    });
    const json = await res.json().catch(() => null);
    setEnviando(false);

    if (res.ok) {
      setGuardado(true);
    } else {
      setError(json?.error || "No se pudo guardar. Intenta de nuevo.");
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted">Cargando...</p>
      </div>
    );
  }

  if (!valido) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="vc-card">
            <p className="text-sm font-medium">Link no válido</p>
            <p className="mt-2 text-xs text-muted">
              Este link no es válido o ya expiró. Contacta a VICTOR CFO para que te manden uno nuevo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (guardado || yaCompletado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">¡Listo!</p>
            <p className="text-xs text-muted">
              {guardado
                ? "Guardamos tu información de forma segura. Ya podemos pagarte por ACH cuando tengas comisiones pendientes."
                : "Ya tienes tu información de pago registrada. Si necesitas actualizarla, contacta a VICTOR CFO."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={enviar} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Hola{nombreSocio ? `, ${nombreSocio}` : ""} 👋</h1>
          <p className="mb-1 text-xs text-muted">
            Para pagarte tus comisiones por ACH necesitamos los datos de tu cuenta bancaria. Esta información se
            guarda cifrada y solo la usamos para transferirte tu dinero.
          </p>

          <input
            className="vc-input"
            type="text"
            placeholder="Nombre del banco (ej. Banco Popular, Oriental, Mercury)"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            required
          />
          <input
            className="vc-input"
            type="text"
            inputMode="numeric"
            placeholder="Routing number (9 dígitos)"
            value={routingNumber}
            onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, ""))}
            maxLength={9}
            required
          />
          <input
            className="vc-input"
            type="text"
            inputMode="numeric"
            placeholder="Número de cuenta"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
            required
          />
          <input
            className="vc-input"
            type="text"
            inputMode="numeric"
            placeholder="Confirma el número de cuenta"
            value={confirmarAccountNumber}
            onChange={(e) => setConfirmarAccountNumber(e.target.value.replace(/\D/g, ""))}
            required
          />

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={enviando}>
            {enviando ? "Guardando..." : "Guardar mis datos"}
          </button>
        </form>
      </div>
    </div>
  );
}
