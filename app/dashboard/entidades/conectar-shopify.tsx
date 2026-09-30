"use client";

import { useState } from "react";

// Conexión directa con Shopify (migración 0109, 30 sept 2026, pedido de
// Joel: cuando se paga una orden en Shopify, VICTOR crea el Cliente y la
// Factura automáticamente — integración vía webhook propio, no pasa por
// Zapier). Vive en el tab "Facturas" de EntidadForm, junto a Métodos de
// cobro. Solo aparece EDITANDO una entidad que ya existe (necesita un
// entityId real, mismo criterio que CobroTarjeta).
export default function ConectarShopify({
  entityId,
  conectado,
  shopDomainActual,
}: {
  entityId: string;
  conectado: boolean | null | undefined;
  shopDomainActual: string | null | undefined;
}) {
  const [abierto, setAbierto] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conectadoLocal, setConectadoLocal] = useState(!!conectado);

  async function conectar() {
    setCargando(true);
    setError(null);
    const res = await fetch("/api/negocio/shopify/conectar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, shopDomain, accessToken, webhookSecret }),
    });
    const json = await res.json().catch(() => null);
    setCargando(false);

    if (res.ok) {
      setConectadoLocal(true);
      setAbierto(false);
      setAccessToken("");
      setWebhookSecret("");
      return;
    }
    setError(json?.error || "No se pudo conectar con Shopify. Intenta de nuevo.");
  }

  async function desconectar() {
    if (!confirm("¿Desconectar Shopify de este negocio? Las órdenes nuevas dejarán de crear facturas automáticas.")) {
      return;
    }
    setCargando(true);
    setError(null);
    const res = await fetch("/api/negocio/shopify/desconectar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId }),
    });
    setCargando(false);
    if (res.ok) {
      setConectadoLocal(false);
      return;
    }
    const json = await res.json().catch(() => null);
    setError(json?.error || "No se pudo desconectar.");
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Shopify</p>
          <p className="mt-0.5 text-xs text-muted">
            {conectadoLocal
              ? `Conectado — cada orden pagada en ${shopDomainActual ?? "tu tienda"} crea el cliente y la factura automáticamente.`
              : "Conecta tu tienda para que cada orden pagada cree el cliente y la factura solos, sin que tengas que hacer nada."}
          </p>
        </div>
        {conectadoLocal ? (
          <span className="shrink-0 rounded-pill bg-teal/10 px-2 py-1 text-[11px] font-medium text-teal">Activo ✓</span>
        ) : (
          <button
            onClick={() => setAbierto(!abierto)}
            className="shrink-0 rounded-lg border border-teal px-3 py-1.5 text-xs font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            Conectar
          </button>
        )}
      </div>

      {conectadoLocal && (
        <button onClick={desconectar} disabled={cargando} className="mt-2 text-xs text-red underline">
          {cargando ? "Desconectando..." : "Desconectar"}
        </button>
      )}

      {!conectadoLocal && abierto && (
        <div className="mt-3 flex flex-col gap-2">
          <div>
            <label className="mb-1 block text-xs text-muted">Dominio de tu tienda</label>
            <input
              className="vc-input"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="mi-tienda.myshopify.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Admin API access token</label>
            <input
              className="vc-input"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="shpat_..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">API secret key (webhook)</label>
            <input
              className="vc-input"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder="shpss_..."
            />
          </div>
          <p className="text-[11px] text-muted">
            Los 3 datos están en tu Shopify Admin → Configuración → Apps y canales de venta → Desarrollar apps → tu
            app (créala si no existe, con permisos de lectura de órdenes y clientes) → API credentials.
          </p>
          <button
            onClick={conectar}
            disabled={cargando || !shopDomain || !accessToken || !webhookSecret}
            className="vc-btn-primary mt-1"
          >
            {cargando ? "Conectando..." : "Conectar Shopify"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red">{error}</p>}
    </div>
  );
}
