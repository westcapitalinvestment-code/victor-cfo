"use client";

import { useEffect, useState } from "react";

// Sección "API / Integraciones" en Configuración (solo Pro) — primer paso
// hacia integraciones externas (Zapier, Shopify, etc. a futuro). Deja al
// usuario generar/revocar API keys para /api/v1/* (Clientes + Facturas).
// Ver API.md en la raíz del proyecto para la documentación completa.

type Entity = { id: string; name: string };

type ApiKeyRow = {
  id: string;
  entity_id: string | null;
  nombre: string;
  prefijo: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

function formatearFecha(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("es-PR", { year: "numeric", month: "short", day: "numeric" });
}

export default function ApiKeysConfig({ entities }: { entities: Entity[] }) {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState("");
  const [entityId, setEntityId] = useState("");
  const [keyNueva, setKeyNueva] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [revocando, setRevocando] = useState<string | null>(null);
  const [confirmarRevocar, setConfirmarRevocar] = useState<string | null>(null);

  function cargar() {
    fetch("/api/config/api-keys")
      .then((r) => r.json())
      .then((data) => setKeys(data?.data ?? []))
      .catch(() => setError("No se pudieron cargar las API keys."));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function generar() {
    if (!nombre.trim()) {
      setError("Ponle un nombre a la key (ej. 'Zapier producción').");
      return;
    }
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/config/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nombre.trim(), entity_id: entityId || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "No se pudo generar la key.");
        return;
      }
      setKeyNueva(data.data.key);
      setNombre("");
      setEntityId("");
      setMostrarForm(false);
      cargar();
    } finally {
      setCreando(false);
    }
  }

  async function revocar(id: string) {
    setRevocando(id);
    try {
      const res = await fetch(`/api/config/api-keys/${id}`, { method: "DELETE" });
      if (res.ok) cargar();
    } finally {
      setRevocando(null);
      setConfirmarRevocar(null);
    }
  }

  function copiar() {
    if (!keyNueva) return;
    navigator.clipboard?.writeText(keyNueva).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    });
  }

  const activas = (keys ?? []).filter((k) => !k.revoked_at);

  return (
    <div className="vc-card mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">API / Integraciones</p>
        {!mostrarForm && (
          <button
            onClick={() => {
              setMostrarForm(true);
              setError(null);
            }}
            className="rounded-lg border border-teal px-3 py-1.5 text-xs font-medium text-teal"
            style={{ background: "rgba(29,158,117,.1)" }}
          >
            Generar key
          </button>
        )}
      </div>
      <p className="mb-2 text-xs text-muted">
        Genera una API key para conectar VICTOR CFO con Zapier, Shopify u otra herramienta externa. Da acceso a
        Clientes y Facturas — ver <span className="font-medium">API.md</span> en el repositorio para la
        documentación completa.
      </p>

      {error && <p className="mb-2 text-xs text-red">{error}</p>}

      {mostrarForm && (
        <div className="mb-3 rounded-lg border border-border bg-bg p-3">
          <label className="mb-1 block text-xs text-muted">Nombre de la key</label>
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Zapier producción"
            className="vc-input mb-2"
          />
          {entities.length > 1 && (
            <>
              <label className="mb-1 block text-xs text-muted">Entidad (opcional — vacío = todas)</label>
              <select value={entityId} onChange={(e) => setEntityId(e.target.value)} className="vc-input mb-2">
                <option value="">Todas las entidades</option>
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <div className="flex gap-2">
            <button onClick={generar} disabled={creando} className="vc-btn-primary flex-1">
              {creando ? "Generando..." : "Generar"}
            </button>
            <button
              onClick={() => setMostrarForm(false)}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {keys === null && <p className="text-xs text-muted">Cargando...</p>}
      {keys !== null && activas.length === 0 && !mostrarForm && (
        <p className="text-xs text-muted">Todavía no has generado ninguna API key.</p>
      )}

      {activas.map((k) => (
        <div key={k.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{k.nombre}</p>
            <p className="truncate text-xs text-muted">
              {k.prefijo}... · creada {formatearFecha(k.created_at)} · último uso {formatearFecha(k.last_used_at)}
            </p>
          </div>
          {confirmarRevocar === k.id ? (
            <div className="flex shrink-0 gap-1">
              <button
                onClick={() => revocar(k.id)}
                disabled={revocando === k.id}
                className="rounded-lg bg-red px-2 py-1 text-xs font-medium text-white"
              >
                {revocando === k.id ? "..." : "Confirmar"}
              </button>
              <button onClick={() => setConfirmarRevocar(null)} className="rounded-lg border border-border px-2 py-1 text-xs">
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmarRevocar(k.id)}
              className="shrink-0 rounded-lg border border-red px-2 py-1 text-xs font-medium text-red"
            >
              Revocar
            </button>
          )}
        </div>
      ))}

      {keyNueva && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setKeyNueva(null)}>
          <div className="vc-card w-full max-w-sm rounded-b-none text-center sm:rounded-b-2xl" onClick={(e) => e.stopPropagation()}>
            <i className="ti ti-key mb-2 text-2xl" style={{ color: "#1D9E75" }} />
            <p className="mb-1 text-sm font-semibold">Tu API key nueva</p>
            <p className="mb-3 text-xs text-amb">
              Cópiala ahora — por seguridad no se vuelve a mostrar completa. Si la pierdes, tendrás que revocar
              esta y generar una nueva.
            </p>
            <div className="mb-3 break-all rounded-lg border border-border bg-bg p-2.5 text-left font-mono text-xs">
              {keyNueva}
            </div>
            <button className="vc-btn-primary mb-2" onClick={copiar}>
              {copiado ? "¡Copiada!" : "Copiar"}
            </button>
            <button className="w-full text-center text-sm text-muted" onClick={() => setKeyNueva(null)}>
              Ya la guardé, cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
