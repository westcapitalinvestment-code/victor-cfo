"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";

type Entity = { id: string; name: string; ivu_applies: boolean; ivu_rate_estatal: number; ivu_rate_municipal: number };
type Client = { id: string; name: string; entity_id: string | null; ivu_exempt_reseller: boolean };
type ServicioCat = { id: string; nombre: string; tipo: string; precio: number; ivu_exento: boolean };
type Linea = { descripcion: string; cantidad: string; precioUnitario: string };

function sumaLinea(l: Linea): number {
  const cant = Number(l.cantidad) || 0;
  const precio = Number(l.precioUnitario) || 0;
  return cant * precio;
}

export default function NuevaCotizacionForm({
  entities,
  clients,
  servicios,
  numeroInicial,
}: {
  entities: Entity[];
  clients: Client[];
  servicios: ServicioCat[];
  numeroInicial: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const entidad = entities.find((e) => e.id === entityId) ?? entities[0];

  const clientesDeEntidad = useMemo(
    () => clients.filter((c) => !c.entity_id || c.entity_id === entityId),
    [clients, entityId]
  );
  const [clientId, setClientId] = useState(clientesDeEntidad[0]?.id ?? "");
  const cliente = clientesDeEntidad.find((c) => c.id === clientId) ?? clientesDeEntidad[0];

  const hoy = new Date().toISOString().slice(0, 10);
  const [fechaVencimiento, setFechaVencimiento] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().slice(0, 10);
  });
  const [notas, setNotas] = useState("");
  const [lineas, setLineas] = useState<Linea[]>([{ descripcion: "", cantidad: "1", precioUnitario: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function actualizarLinea(i: number, campo: keyof Linea, valor: string) {
    setLineas((prev) => prev.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }
  function agregarLinea() {
    setLineas((prev) => [...prev, { descripcion: "", cantidad: "1", precioUnitario: "" }]);
  }
  function quitarLinea(i: number) {
    setLineas((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  }
  function agregarDesdeServicio(servicioId: string) {
    const s = servicios.find((x) => x.id === servicioId);
    if (!s) return;
    setLineas((prev) => {
      const vacias = prev.filter((l) => !l.descripcion.trim());
      const nueva = { descripcion: s.nombre, cantidad: "1", precioUnitario: String(s.precio) };
      return vacias.length === prev.length ? [nueva] : [...prev.filter((l) => l.descripcion.trim()), nueva];
    });
  }

  const subtotal = lineas.reduce((sum, l) => sum + sumaLinea(l), 0);
  const ivuPct =
    entidad?.ivu_applies && !cliente?.ivu_exempt_reseller
      ? Number(entidad.ivu_rate_estatal || 0) + Number(entidad.ivu_rate_municipal || 0)
      : 0;
  const ivuMonto = subtotal * (ivuPct / 100);
  const total = subtotal + ivuMonto;

  async function guardar() {
    if (!entidad || !cliente) return;
    const lineasValidas = lineas.filter((l) => l.descripcion.trim() && sumaLinea(l) > 0);
    if (lineasValidas.length === 0) {
      setError("Añade al menos una línea con descripción y precio.");
      return;
    }

    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sesión expirada — vuelve a entrar.");
      setLoading(false);
      return;
    }

    const { data: cotizacion, error: insertError } = await supabase
      .from("cotizaciones")
      .insert({
        owner_id: user.id,
        entity_id: entidad.id,
        client_id: cliente.id,
        numero: numeroInicial,
        subtotal,
        ivu_pct: ivuPct,
        ivu_monto: ivuMonto,
        total,
        estado: "enviada",
        fecha_emision: hoy,
        fecha_vencimiento: fechaVencimiento,
        notas: notas || null,
      })
      .select("id")
      .maybeSingle();

    if (insertError || !cotizacion) {
      setError(insertError?.message || "No se pudo crear la cotización.");
      setLoading(false);
      return;
    }

    const { error: itemsError } = await supabase.from("cotizacion_items").insert(
      lineasValidas.map((l) => ({
        cotizacion_id: cotizacion.id,
        descripcion: l.descripcion,
        cantidad: Number(l.cantidad) || 1,
        precio_unitario: Number(l.precioUnitario) || 0,
        subtotal_linea: sumaLinea(l),
      }))
    );

    setLoading(false);

    if (itemsError) {
      setError(itemsError.message);
      return;
    }

    router.push(`/dashboard/facturacion/cotizaciones/${cotizacion.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva cotización</h1>
        <button onClick={() => router.push("/dashboard/facturacion?tab=cotizaciones")} className="text-sm text-muted hover:opacity-80">
          Cancelar
        </button>
      </div>

      <div className="vc-card flex flex-col gap-3">
        {error && <p className="text-xs text-red">{error}</p>}

        <p className="text-xs text-muted">
          Número: <span className="font-medium text-text">{numeroInicial}</span>
        </p>

        {entities.length > 1 && (
          <Field label="Entidad">
            <select className="vc-input" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Cliente">
          {clientesDeEntidad.length === 0 ? (
            <p className="text-xs text-amb">Esta entidad no tiene clientes todavía.</p>
          ) : (
            <select className="vc-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {clientesDeEntidad.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Válida hasta">
          <input
            className="vc-input"
            type="date"
            value={fechaVencimiento}
            onChange={(e) => setFechaVencimiento(e.target.value)}
          />
        </Field>

        {servicios.length > 0 && (
          <Field label="Añadir desde el catálogo (opcional)">
            <select className="vc-input" defaultValue="" onChange={(e) => e.target.value && agregarDesdeServicio(e.target.value)}>
              <option value="">Elegir un servicio guardado...</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {formatMoney(s.precio)}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted">Líneas</label>
          <div className="flex flex-col gap-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="vc-input flex-1"
                  placeholder="Descripción del servicio"
                  value={l.descripcion}
                  onChange={(e) => actualizarLinea(i, "descripcion", e.target.value)}
                />
                <input
                  className="vc-input w-16"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Cant."
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, "cantidad", e.target.value)}
                />
                <input
                  className="vc-input w-24"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Precio"
                  value={l.precioUnitario}
                  onChange={(e) => actualizarLinea(i, "precioUnitario", e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => quitarLinea(i)}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-muted hover:bg-bg"
                  title="Quitar línea"
                >
                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={agregarLinea} className="mt-2 text-xs font-medium text-teal hover:opacity-80">
            + Añadir línea
          </button>
        </div>

        <Field label="Notas (opcional)">
          <textarea
            className="vc-input"
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Alcance del trabajo, condiciones, etc."
          />
        </Field>

        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="flex justify-between py-0.5">
            <span className="text-muted">Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>
          {ivuPct > 0 && (
            <div className="flex justify-between py-0.5">
              <span className="text-muted">IVU ({ivuPct}%)</span>
              <span>+{formatMoney(ivuMonto)}</span>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-1.5 font-medium">
            <span>Total</span>
            <span>{formatMoney(total)}</span>
          </div>
        </div>

        <button className="vc-btn-primary mt-1" disabled={loading || !cliente} onClick={guardar}>
          {loading ? "Guardando..." : "Guardar cotización"}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}
