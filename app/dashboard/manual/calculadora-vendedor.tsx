"use client";

import { useState } from "react";

// Calculadora de ganancias del vendedor (manual del vendedor).
// Comisión: cliente mensual = 1 mensualidad del plan; cliente anual = 20% del año.
// Bonos de oficinas: $20 una vez por oficina activada + $10 una vez por cliente que traiga.
// Todo es bruto; la retención 1062.03 (10%) se muestra aparte como estimado.

const PLANES = {
  core: { nombre: "Core", mensual: 14.99, anual: 164 },
  pro: { nombre: "Pro", mensual: 49.99, anual: 549 },
  business: { nombre: "Business", mensual: 99.99, anual: 1099 },
} as const;
type PlanKey = keyof typeof PLANES;

const BONO_OFICINA = 20;
const BONO_CLIENTE = 10;
const RETENCION = 0.1;

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2 });

function Campo({ label, valor, onChange }: { label: string; valor: number; onChange: (n: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={valor}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="vc-input w-full text-base"
      />
    </label>
  );
}

export default function CalculadoraVendedor() {
  const [plan, setPlan] = useState<PlanKey>("business");
  const [mensuales, setMensuales] = useState(5);
  const [anuales, setAnuales] = useState(0);
  const [oficinas, setOficinas] = useState(20);
  const [porOficina, setPorOficina] = useState(3);

  const p = PLANES[plan];
  const comMensual = mensuales * p.mensual;
  const comAnual = anuales * p.anual * 0.2;
  const comisiones = comMensual + comAnual;
  const bonoClientes = oficinas * porOficina * BONO_CLIENTE;
  const bonoOficinas = porOficina > 0 ? oficinas * BONO_OFICINA : 0;
  const bonos = bonoClientes + bonoOficinas;
  const total = comisiones + bonos;
  const neto = total * (1 - RETENCION);

  return (
    <div className="vc-card mt-3">
      <p className="mb-1 flex items-center gap-2 text-base font-semibold">
        <i className="ti ti-calculator text-teal" /> Calculadora de tus ganancias
      </p>
      <p className="mb-3 text-sm text-muted">Mueve los números y mira cuánto podrías cobrar.</p>

      <p className="mb-1 text-sm text-muted">Plan que más vendes</p>
      <div className="mb-3 flex gap-2">
        {(Object.keys(PLANES) as PlanKey[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setPlan(k)}
            className={`flex-1 rounded-pill border px-3 py-2 text-sm font-medium ${
              plan === k ? "border-teal bg-teal text-white" : "border-border"
            }`}
          >
            {PLANES[k].nombre}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Campo label="Clientes mensuales que vendes" valor={mensuales} onChange={setMensuales} />
        <Campo label="Clientes anuales que vendes" valor={anuales} onChange={setAnuales} />
        <Campo label="Oficinas de contables activas" valor={oficinas} onChange={setOficinas} />
        <Campo label="Clientes por oficina" valor={porOficina} onChange={setPorOficina} />
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-lg bg-teal/[.06] p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Comisiones por tus ventas</span>
          <span className="font-medium">{usd(comisiones)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Bono por clientes de oficinas ({oficinas} × {porOficina} × $10)</span>
          <span className="font-medium">{usd(bonoClientes)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Bono por oficinas activadas ({oficinas} × $20)</span>
          <span className="font-medium">{usd(bonoOficinas)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-border pt-2 text-base">
          <span className="font-semibold">Total proyectado</span>
          <span className="text-lg font-semibold text-teal">{usd(total)}</span>
        </div>
        <div className="flex justify-between text-muted">
          <span>Estimado neto con retención de 10%</span>
          <span>{usd(neto)}</span>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted">
        Es una proyección, no una garantía. Las comisiones se pagan cuando cada cliente paga (mensual: 70% con su primer pago y 30% al 3er pago; anual: 20% del año con su primer pago). Los bonos se pagan cada 3 meses.
      </p>
    </div>
  );
}
