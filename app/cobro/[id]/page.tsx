"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Página pública de cobro (28 sept 2026, pedido de Joel: "un POS... que si
// alguien quiere pagar por tarjeta salga un QR... y el cliente escoja como
// lo quiere pagar, quizás Apple Pay, Google Pay, o ATH Móvil"). Esta es la
// página a la que apunta el QR que se muestra en factura-detalle.tsx (y la
// que se genera en Cobro Rápido) — sin login, porque el que paga es el
// cliente del negocio, no un usuario de VICTOR CFO.
//
// Tarjeta: redirige a /api/facturas/[id]/pagar, que ya existe (Stripe
// Checkout hospedado por Stripe — Apple Pay/Google Pay salen solos ahí si
// el navegador del cliente los soporta, sin nada que integrar aparte).
//
// ATH Móvil: embebe el Payment Button OFICIAL de Evertec
// (athmovil_base.js) — real, con push notification al ATH Móvil del
// cliente y confirmación desde su propia app, no un simulacro. Requiere
// que la entidad tenga su Public Token configurado (Entidades → Facturas).

type InfoCobro = {
  numero: string;
  total: number;
  pagada: boolean;
  negocioNombre: string;
  tarjetaDisponible: boolean;
  athDisponible: boolean;
  athPublicToken: string | null;
};

declare global {
  interface Window {
    ATHM_Checkout?: Record<string, unknown>;
    authorizationATHM?: () => Promise<void>;
    cancelATHM?: () => Promise<void>;
    expiredATHM?: () => Promise<void>;
    authorization?: () => Promise<{ data?: { ecommerceId?: string; ecommerceStatus?: string } }>;
  }
}

const ATH_SCRIPT_SRC = "https://payments.athmovil.com/api/modal/js/athmovil_base.js";

export default function CobroPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : "";

  const [info, setInfo] = useState<InfoCobro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [athEstado, setAthEstado] = useState<"idle" | "confirmando" | "pagado" | "error">("idle");
  const [athError, setAthError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/facturas/${id}/info-cobro`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data: InfoCobro) => setInfo(data))
      .catch(() => setError("No se pudo cargar esta factura."))
      .finally(() => setCargando(false));
  }, [id]);

  // Monta el widget de ATH Móvil solo cuando ya sabemos que está disponible
  // — window.ATHM_Checkout debe existir ANTES de que el script cargue,
  // porque athmovil_base.js lo lee una sola vez al inicializarse.
  useEffect(() => {
    if (!info?.athDisponible || !info.athPublicToken || athEstado === "pagado") return;

    window.ATHM_Checkout = {
      env: "production",
      publicToken: info.athPublicToken,
      timeout: 600,
      theme: "btn",
      lang: "es",
      total: info.total,
      subtotal: info.total,
      tax: 0,
      metadata1: info.numero || id.slice(0, 8),
      metadata2: "VICTORCFO",
      items: [
        {
          name: `Factura ${info.numero || ""}`.trim(),
          description: info.negocioNombre || "",
          quantity: "1",
          price: String(info.total),
          tax: "0",
          metadata: "VICTOR CFO",
        },
      ],
      phoneNumber: "",
    };

    window.authorizationATHM = async () => {
      setAthEstado("confirmando");
      try {
        const auth = await window.authorization?.();
        const ecommerceId = auth?.data?.ecommerceId;
        if (!ecommerceId) {
          setAthEstado("error");
          setAthError("No se pudo leer la confirmación de ATH Móvil.");
          return;
        }
        const res = await fetch(`/api/facturas/${id}/confirmar-ath`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ecommerceId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAthEstado("error");
          setAthError(data?.error || "No se pudo confirmar el pago.");
          return;
        }
        setAthEstado("pagado");
      } catch {
        setAthEstado("error");
        setAthError("No se pudo confirmar el pago. Si ya pagaste, dile al negocio que lo revise.");
      }
    };
    window.cancelATHM = async () => {};
    window.expiredATHM = async () => {};

    const existente = document.getElementById("athmovil-base-script");
    if (existente) existente.remove();
    const script = document.createElement("script");
    script.id = "athmovil-base-script";
    script.src = ATH_SCRIPT_SRC;
    script.async = true;
    document.body.appendChild(script);
  }, [info, id, athEstado]);

  if (cargando) {
    return (
      <Envoltorio>
        <p style={{ color: "#666" }}>Cargando...</p>
      </Envoltorio>
    );
  }

  if (error || !info) {
    return (
      <Envoltorio>
        <p style={{ color: "#666" }}>Este link no es válido.</p>
      </Envoltorio>
    );
  }

  if (info.pagada || athEstado === "pagado") {
    return (
      <Envoltorio negocioNombre={info.negocioNombre}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✓</div>
          <h1 style={{ fontSize: "1.2rem", marginBottom: 4 }}>Ya está pagada</h1>
          <p style={{ color: "#666", fontSize: "0.9rem" }}>Gracias — este pago ya quedó registrado.</p>
        </div>
      </Envoltorio>
    );
  }

  return (
    <Envoltorio negocioNombre={info.negocioNombre}>
      <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        <p style={{ color: "#666", fontSize: "0.85rem", marginBottom: 2 }}>Factura {info.numero}</p>
        <p style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>${info.total.toFixed(2)}</p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {info.tarjetaDisponible && (
          <a
            href={`/api/facturas/${id}/pagar`}
            style={{
              display: "block",
              textAlign: "center",
              background: "#1D9E75",
              color: "#fff",
              borderRadius: 10,
              padding: "0.9rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            💳 Pagar con tarjeta (o Apple Pay / Google Pay)
          </a>
        )}

        {info.athDisponible && athEstado !== "confirmando" && athEstado !== "error" && (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 10, padding: "0.9rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "0.6rem" }}>Pagar con ATH Móvil</p>
            <div id="ATHMovil_Checkout_Button_payment" />
          </div>
        )}

        {athEstado === "confirmando" && (
          <p style={{ textAlign: "center", color: "#666", fontSize: "0.9rem" }}>Confirmando tu pago con ATH Móvil...</p>
        )}
        {athEstado === "error" && (
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "#b91c1c", fontSize: "0.85rem", marginBottom: 8 }}>{athError}</p>
            <button
              onClick={() => {
                setAthEstado("idle");
                setAthError(null);
              }}
              style={{ background: "none", border: "1px solid #e5e5e5", borderRadius: 8, padding: "0.5rem 1rem", fontSize: "0.85rem" }}
            >
              Intentar de nuevo
            </button>
          </div>
        )}

        {!info.tarjetaDisponible && !info.athDisponible && (
          <p style={{ textAlign: "center", color: "#666", fontSize: "0.85rem" }}>
            Este negocio todavía no activó un método de cobro en línea — pregúntale directamente cómo prefiere que le pagues.
          </p>
        )}
      </div>
    </Envoltorio>
  );
}

function Envoltorio({ children, negocioNombre }: { children: React.ReactNode; negocioNombre?: string }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f7f9fb", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 14, padding: "2rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <p style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0 }}>{negocioNombre || "VICTOR CFO"}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
