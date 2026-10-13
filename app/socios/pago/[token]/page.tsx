"use client";

import { useEffect, useState } from "react";

// Página pública protegida por token (migración 0071, 5 sept 2026) donde un
// socio APROBADO completa sus documentos — sin cuenta ni login de por medio
// (un socio externo no necesariamente es cliente de VICTOR CFO). El token es
// el uuid payment_token (ver app/api/socios/[id]/route.ts).
//
// 13 oct 2026 (pedido de Joel): ahora son dos pasos —
//   1) Contrato de Servicios Independientes + datos de contratista (solo
//      vendedores): lee el PDF, teclea su nombre legal como firma, SSN/EIN y
//      dirección.
//   2) Datos bancarios para el ACH.
// Al terminar ambos recibe por correo su código, QR y PIN del portal. El
// formulario es de una sola vía: nunca se le muestra de vuelta lo que escribió.
type Estado = {
  nombre: string;
  requiereContrato: boolean;
  contratoAceptado: boolean;
  datosPagoCompletados: boolean;
  yaCompletado: boolean;
};

function Logo() {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
      <span className="text-lg font-medium">VICTOR</span>
    </div>
  );
}

export default function PagoSocioPage({ params }: { params: { token: string } }) {
  const [cargando, setCargando] = useState(true);
  const [valido, setValido] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);

  // Paso 1
  const [acepta, setAcepta] = useState(false);
  const [nombreFirma, setNombreFirma] = useState("");
  const [taxId, setTaxId] = useState("");
  const [direccion, setDireccion] = useState("");

  // Paso 2
  const [bankName, setBankName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmarAccountNumber, setConfirmarAccountNumber] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalizado, setFinalizado] = useState(false);

  useEffect(() => {
    fetch(`/api/socios/pago/${params.token}`)
      .then((r) => r.json())
      .then((json) => {
        if (json?.valido) {
          setValido(true);
          setEstado({
            nombre: json.nombre ?? "",
            requiereContrato: !!json.requiereContrato,
            contratoAceptado: !!json.contratoAceptado,
            datosPagoCompletados: !!json.datosPagoCompletados,
            yaCompletado: !!json.yaCompletado,
          });
        }
      })
      .finally(() => setCargando(false));
  }, [params.token]);

  async function enviar(cuerpo: Record<string, unknown>) {
    setEnviando(true);
    setError(null);
    const res = await fetch(`/api/socios/pago/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const json = await res.json().catch(() => null);
    setEnviando(false);
    if (!res.ok) {
      setError(json?.error || "No se pudo guardar. Intenta de nuevo.");
      return null;
    }
    return json as { completado: boolean; contratoListo: boolean; pagoListo: boolean };
  }

  async function enviarContrato(e: React.FormEvent) {
    e.preventDefault();
    if (!acepta) return setError("Tienes que aceptar el contrato para continuar.");
    if (nombreFirma.trim().length < 5) return setError("Escribe tu nombre legal completo como firma.");
    if (!/^\d{9}$/.test(taxId)) return setError("El SSN o EIN debe tener 9 dígitos.");
    if (direccion.trim().length < 8) return setError("Escribe tu dirección postal completa.");
    const r = await enviar({ paso: "contrato", acepta: true, nombreFirma, taxId, direccion });
    if (r) {
      setEstado((s) => (s ? { ...s, contratoAceptado: true } : s));
      if (r.completado) setFinalizado(true);
    }
  }

  async function enviarPago(e: React.FormEvent) {
    e.preventDefault();
    if (!bankName.trim() || !routingNumber.trim() || !accountNumber.trim()) return setError("Completa todos los campos.");
    if (accountNumber !== confirmarAccountNumber) return setError("El número de cuenta no coincide en los dos campos — revísalo.");
    if (!/^\d{9}$/.test(routingNumber.trim())) return setError("El routing number debe tener exactamente 9 dígitos.");
    const r = await enviar({ paso: "pago", bankName: bankName.trim(), routingNumber: routingNumber.trim(), accountNumber: accountNumber.trim() });
    if (r) {
      setEstado((s) => (s ? { ...s, datosPagoCompletados: true } : s));
      if (r.completado) setFinalizado(true);
    }
  }

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-muted">Cargando...</p>
      </div>
    );
  }

  if (!valido || !estado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="vc-card">
            <p className="text-sm font-medium">Link no válido</p>
            <p className="mt-2 text-xs text-muted">
              Este link no es válido o todavía no está activo. Contacta a VICTOR CFO para que te manden uno nuevo.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const contratoPendiente = estado.requiereContrato && !estado.contratoAceptado;
  const pagoPendiente = !estado.datosPagoCompletados;

  if (finalizado || estado.yaCompletado || (!contratoPendiente && !pagoPendiente)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <Logo />
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">¡Listo!</p>
            <p className="text-xs text-muted">
              {estado.requiereContrato
                ? "Tus documentos están completos. Te enviamos por correo tu código personal, tu QR y el PIN de tu portal de vendedor (revisa también spam)."
                : "Guardamos tu información de forma segura. Ya podemos pagarte por ACH cuando tengas comisiones pendientes."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalPasos = estado.requiereContrato ? 2 : 1;
  const pasoActual = contratoPendiente ? 1 : totalPasos;

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <Logo />

        {contratoPendiente ? (
          <form onSubmit={enviarContrato} className="vc-card flex flex-col gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Paso {pasoActual} de {totalPasos}
            </p>
            <h1 className="mb-1 text-base font-medium">Hola{estado.nombre ? `, ${estado.nombre}` : ""}, tu contrato</h1>
            <p className="mb-1 text-xs text-muted">
              Lee el Contrato de Servicios Independientes y completa tus datos de contratista. Se guardan cifrados y solo
              se usan para el contrato y para reportar tus pagos a Hacienda.
            </p>

            <a
              href="/documentos/contrato-vendedor.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-border p-2 text-center text-xs font-medium text-teal"
            >
              Leer el contrato (PDF)
            </a>

            <input
              className="vc-input"
              type="text"
              placeholder="Nombre legal completo (será tu firma)"
              value={nombreFirma}
              onChange={(e) => setNombreFirma(e.target.value)}
              required
            />
            <input
              className="vc-input"
              type="text"
              inputMode="numeric"
              placeholder="Seguro social o EIN (9 dígitos)"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 9))}
              maxLength={9}
              required
            />
            <textarea
              className="vc-input"
              placeholder="Dirección postal completa"
              rows={2}
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              required
            />

            <label className="flex items-start gap-2 text-xs text-muted">
              <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5" required />
              <span>
                He leído y acepto el Contrato de Servicios Independientes con West Capital Ventures LLC. Entiendo que
                escribir mi nombre arriba equivale a mi firma.
              </span>
            </label>

            {error && <p className="text-xs text-red">{error}</p>}

            <button type="submit" className="vc-btn-primary mt-2" disabled={enviando || !acepta}>
              {enviando ? "Guardando..." : "Aceptar y continuar"}
            </button>
          </form>
        ) : (
          <form onSubmit={enviarPago} className="vc-card flex flex-col gap-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
              Paso {pasoActual} de {totalPasos}
            </p>
            <h1 className="mb-1 text-base font-medium">Hola{estado.nombre ? `, ${estado.nombre}` : ""}, tus datos de pago</h1>
            <p className="mb-1 text-xs text-muted">
              Para pagarte tus comisiones por ACH necesitamos los datos de tu cuenta bancaria. Esta información se guarda
              cifrada y solo la usamos para transferirte tu dinero.
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
        )}
      </div>
    </div>
  );
}
