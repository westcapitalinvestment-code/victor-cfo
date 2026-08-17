"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Wizard de 2 pasos — calcado del modal #m-add-entity en
// VICTOR — Dashboard Core.html (versión CORE: solo datos básicos + banco).
// La versión Pro añade régimen fiscal y preferencias de factura como pasos
// 2 y 3 extra — eso se construye después, sobre esta misma base. Las
// columnas de business_entities para lo de Pro (tax_regime, invoice_prefix,
// etc. — ver 0005_business_entities_wizard_fields.sql) ya existen con
// valores default, así que una entidad creada aquí en Core queda con
// defaults razonables y no rompe nada cuando Pro llene esos campos después.

export default function NuevaEntidadPage() {
  const router = useRouter();
  const supabase = createClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [ein, setEin] = useState("");
  const [entityType, setEntityType] = useState("LLC");

  async function crearEntidad() {
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

    const { error: insertError } = await supabase.from("business_entities").insert({
      owner_id: user.id,
      name: name || "Nueva entidad",
      ein: ein || null,
      entity_type: entityType,
      // Todo lo demás (tax_regime, invoice_prefix, ivu_applies...) se queda
      // en los defaults de la tabla — Core no los pregunta, Pro los editará
      // después desde configuración de la entidad.
    });

    setLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-medium">Nueva entidad</h1>
        <button
          onClick={() => router.push("/dashboard")}
          className="text-sm text-muted hover:opacity-80"
        >
          Cancelar
        </button>
      </div>

      <div className="mb-6 flex gap-1">
        {[1, 2].map((n) => (
          <div
            key={n}
            className="h-[3px] flex-1 rounded"
            style={{ background: n <= step ? "#1D9E75" : "var(--border)" }}
          />
        ))}
      </div>

      <div className="vc-card">
        {error && <p className="mb-3 text-xs text-red">{error}</p>}

        {/* PASO 1 — Datos de la entidad */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <StepHeader n={1} title="Datos de la entidad" />
            <Field label="Nombre de la entidad">
              <input
                className="vc-input"
                placeholder="Valentín Medical Group LLC"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="EIN">
              <input
                className="vc-input"
                placeholder="XX-XXXXXXX"
                value={ein}
                onChange={(e) => setEin(e.target.value)}
              />
            </Field>
            <Field label="Tipo de entidad">
              <select className="vc-input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                <option>LLC</option>
                <option>Corporación</option>
                <option>Sole Proprietorship</option>
                <option>Partnership</option>
              </select>
            </Field>
            <div className="rounded-lg border border-teal bg-teal/5 p-3 text-xs text-teal">
              El siguiente paso conectará el banco de esta entidad vía Plaid. +$24.99/mes.
            </div>
            <button className="vc-btn-primary" disabled={!name} onClick={() => setStep(2)}>
              Continuar — conectar banco →
            </button>
          </div>
        )}

        {/* PASO 2 — Conectar banco */}
        {step === 2 && (
          <div className="flex flex-col gap-3">
            <StepHeader n={2} title="Conectar banco" subtitle={name || "Nueva entidad"} />
            <div className="rounded-lg border border-border bg-bg p-4 text-center">
              <p className="mb-1 text-sm font-medium">Conecta el banco de esta entidad</p>
              <p className="text-xs text-muted">
                BPPR, FirstBank, Oriental, Mercury — VICTOR detecta los movimientos automáticamente.
              </p>
            </div>
            <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--amb)", background: "rgba(154,103,0,.08)", color: "var(--amb)" }}>
              Plaid todavía no está conectado en esta app (es el siguiente paso del roadmap) —
              por ahora crea la entidad sin banco y lo conectamos después.
            </div>
            <button className="vc-btn-primary" disabled={loading} onClick={crearEntidad}>
              {loading ? "Creando..." : "Crear entidad sin banco (por ahora)"}
            </button>
            <button
              className="vc-btn-primary !bg-transparent !text-muted border border-border"
              onClick={() => setStep(1)}
              disabled={loading}
            >
              ← Atrás
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StepHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-1 flex gap-2">
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-teal text-xs font-semibold text-white">
        {n}
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="il mb-1 block text-xs uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}
