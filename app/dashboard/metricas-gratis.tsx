"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import TransaccionForm, { type CategoriaOpcion, type CuentaManualOpcion } from "./gastos/transaccion-form";

// Tarjetas del Inicio para el plan GRATIS (22 oct 2026, pedido de Joel: "que
// sean clickeables y desde ahí mismo se puedan llenar"). Sin banco conectado,
// las 5 tarjetas siempre mostraban "—" o $0 sin forma obvia de llenarlas. Aquí
// cada una es un botón:
//   Ingresos / Gastos → formulario de transacción a mano (mismo de Transacciones)
//   Deuda             → calculadora de deudas (/dashboard/deudas)
//   Ahorrado / Inversiones → un campo "saldo actual" que crea o actualiza una
//                         cuenta manual (type depository+savings / investment).
// Los planes de pago siguen con las tarjetas normales (se llenan por banco).
type CuentaSaldo = { id: string; saldo: number } | null;

type Panel = "ingreso" | "gasto" | "ahorro" | "inversion" | "balance" | "deuda" | null;
type DeudaFila = { id: string; nombre: string; saldo: number; apr: number; pago_minimo: number };

export default function MetricasGratis({
  hoy,
  mesLabel,
  esMesActual,
  ingresos,
  gastos,
  ahorrado,
  deuda,
  deudasFilas,
  inversion,
  cuentas,
  categorias,
  cuentaAhorro,
  cuentaInversion,
  cuentaEfectivo,
}: {
  deudasFilas: DeudaFila[];
  hoy: string;
  mesLabel: string;
  esMesActual: boolean;
  ingresos: number;
  gastos: number;
  ahorrado: number;
  deuda: number;
  inversion: number;
  cuentas: CuentaManualOpcion[];
  categorias: CategoriaOpcion[];
  cuentaAhorro: CuentaSaldo;
  cuentaInversion: CuentaSaldo;
  cuentaEfectivo: CuentaSaldo;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [saldo, setSaldo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const esSaldo = panel === "ahorro" || panel === "inversion" || panel === "balance";
  const cuentaActual =
    panel === "ahorro" ? cuentaAhorro : panel === "inversion" ? cuentaInversion : panel === "balance" ? cuentaEfectivo : null;

  // Deudas (tarjetas/préstamos) — se anotan aquí mismo, sin saltar a otra página.
  // Misma tabla que usa /dashboard/deudas (deudas_plan), así que el plan de pago
  // (bola de nieve) sigue viendo lo que anotes aquí.
  const [dNombre, setDNombre] = useState("");
  const [dSaldo, setDSaldo] = useState("");
  const [dApr, setDApr] = useState("");
  const [dMin, setDMin] = useState("");
  const [dEditId, setDEditId] = useState<string | null>(null);

  function limpiarDeuda() {
    setDNombre("");
    setDSaldo("");
    setDApr("");
    setDMin("");
    setDEditId(null);
  }

  async function guardarDeuda() {
    setError(null);
    const s = Number(dSaldo.replace(",", "."));
    const a = dApr === "" ? 0 : Number(dApr.replace(",", "."));
    const m = dMin === "" ? 0 : Number(dMin.replace(",", "."));
    if (!dNombre.trim() || !(s > 0)) return setError("Escribe el nombre y el saldo de la deuda.");
    if (a < 0 || a > 100 || m < 0) return setError("Revisa la tasa (0–100) y el pago mínimo.");
    setGuardando(true);
    const supabase = createClient();
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) {
      setGuardando(false);
      return setError("Sesión expirada — vuelve a entrar.");
    }
    const { error: e } = dEditId
      ? await supabase.from("deudas_plan").update({ nombre: dNombre.trim(), saldo: s, apr: a, pago_minimo: m }).eq("id", dEditId).eq("owner_id", u.user.id)
      : await supabase.from("deudas_plan").insert({ owner_id: u.user.id, nombre: dNombre.trim(), saldo: s, apr: a, pago_minimo: m });
    setGuardando(false);
    if (e) return setError("No se pudo guardar la deuda.");
    limpiarDeuda();
    router.refresh();
  }

  async function quitarDeuda(id: string) {
    const supabase = createClient();
    await supabase.from("deudas_plan").delete().eq("id", id);
    if (dEditId === id) limpiarDeuda();
    router.refresh();
  }

  function editarDeuda(f: DeudaFila) {
    setDEditId(f.id);
    setDNombre(f.nombre);
    setDSaldo(String(f.saldo));
    setDApr(String(f.apr));
    setDMin(String(f.pago_minimo));
    setError(null);
  }

  // Si aún no hay balance anotado, tocar Ingresos/Gastos pide primero el
  // balance (si no, la primera vez no se ve nada) y luego abre lo que tocó.
  const [pendiente, setPendiente] = useState<Panel>(null);

  function abrir(p: Panel) {
    setError(null);
    setSaldo("");
    if ((p === "ingreso" || p === "gasto") && !cuentaEfectivo) {
      setPendiente(p);
      return setPanel("balance");
    }
    setPendiente(null);
    setPanel(p);
  }

  async function guardarSaldo() {
    setError(null);
    const n = Number(saldo.replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || saldo.trim() === "") return setError("Escribe un saldo válido (0 o más).");
    setGuardando(true);
    const res = cuentaActual
      ? await fetch(`/api/cuentas-manuales/${cuentaActual.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ balance: n }),
        })
      : await fetch("/api/cuentas-manuales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            panel === "ahorro"
              ? { nombre: "Ahorros", tipo: "depository", subtipo: "savings", balanceInicial: n }
              : panel === "balance"
                ? { nombre: "Efectivo", tipo: "depository", subtipo: "cash", balanceInicial: n }
                : { nombre: "Inversiones", tipo: "investment", balanceInicial: n }
          ),
        });
    setGuardando(false);
    if (!res.ok) {
      const b = await res.json().catch(() => null);
      return setError(b?.error ?? "No se pudo guardar.");
    }
    const siguiente = pendiente;
    setPendiente(null);
    setSaldo("");
    setPanel(siguiente);
    router.refresh();
  }

  // El botón de la tarjeta de balance (Inicio) manda este evento.
  useEffect(() => {
    function alEvento() {
      abrir("balance");
      setTimeout(() => document.getElementById("registra-finanzas")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    window.addEventListener("vc-abrir-balance", alEvento);
    return () => window.removeEventListener("vc-abrir-balance", alEvento);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sub = esMesActual ? "este mes" : mesLabel;
  const cls = "vc-met cursor-pointer text-left transition hover:border-teal";

  return (
    <>
      <div id="registra-finanzas" className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">✍️ Registra tus finanzas aquí</p>
          <p className="text-[11px] text-muted">
            Toca una tarjeta para anotar lo tuyo. Todo lo que anotes se suma o se resta de tu balance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => abrir("balance")}
          className="flex-shrink-0 rounded-pill border border-teal px-3 py-1.5 text-[11px] font-medium text-teal hover:opacity-80"
        >
          {cuentaEfectivo ? "Ajustar mi balance" : "Anotar mi balance"}
        </button>
      </div>
      <div className="vc-mets">
        <button type="button" className={cls} onClick={() => abrir("ingreso")} aria-label="Anotar un ingreso">
          <p className="vc-ml">Ingresos</p>
          <p className={`vc-mv ${ingresos > 0 ? "!text-grn" : ""}`}>
            <Sensitive>{formatMoney(ingresos)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{sub}</p>
          <p className="mt-1 text-[10px] font-medium text-teal">+ Anotar</p>
        </button>
        <button type="button" className={cls} onClick={() => abrir("gasto")} aria-label="Anotar un gasto">
          <p className="vc-ml">Gastos</p>
          <p className="vc-mv">
            <Sensitive>{formatMoney(gastos)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">{sub}</p>
          <p className="mt-1 text-[10px] font-medium text-teal">+ Anotar</p>
        </button>
        <button type="button" className={cls} onClick={() => abrir("ahorro")} aria-label="Anotar tu ahorro">
          <p className="vc-ml">Ahorrado</p>
          <p className="vc-mv">
            <Sensitive>{formatMoney(ahorrado)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">en cuentas de ahorro</p>
          <p className="mt-1 text-[10px] font-medium text-teal">{cuentaAhorro ? "Actualizar" : "+ Anotar"}</p>
        </button>
        <button type="button" className={cls} onClick={() => abrir("deuda")} aria-label="Anotar una deuda">
          <p className="vc-ml">Deuda</p>
          <p className={`vc-mv ${deuda > 0 ? "!text-red" : ""}`}>
            <Sensitive>{formatMoney(deuda)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">tarjetas y préstamos</p>
          <p className="mt-1 text-[10px] font-medium text-teal">+ Anotar</p>
        </button>
        <button type="button" className={cls} onClick={() => abrir("inversion")} aria-label="Anotar tus inversiones">
          <p className="vc-ml">Inversiones</p>
          <p className="vc-mv">
            <Sensitive>{formatMoney(inversion)}</Sensitive>
          </p>
          <p className="mt-0.5 text-[10px] text-muted">cuentas de inversión</p>
          <p className="mt-1 text-[10px] font-medium text-teal">{cuentaInversion ? "Actualizar" : "+ Anotar"}</p>
        </button>
      </div>

      {(panel === "ingreso" || panel === "gasto") && (
        <TransaccionForm
          key={panel}
          hoy={hoy}
          tipoInicial={panel}
          bloquearTipo
          cuentas={cuentas}
          categorias={categorias}
          onListo={() => setPanel(null)}
          onCancelar={() => setPanel(null)}
        />
      )}

      {panel === "deuda" && (
        <div className="vc-card mb-3 flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{dEditId ? "Editar deuda" : "Anotar una deuda"}</p>
          <input className="vc-input" placeholder="Nombre (ej. Tarjeta Visa)" value={dNombre} maxLength={80} onChange={(e) => setDNombre(e.target.value)} />
          <div className="flex gap-2">
            <input className="vc-input" inputMode="decimal" placeholder="Saldo $" value={dSaldo} onChange={(e) => setDSaldo(e.target.value)} />
            <input className="vc-input" inputMode="decimal" placeholder="Tasa anual %" value={dApr} onChange={(e) => setDApr(e.target.value)} />
            <input className="vc-input" inputMode="decimal" placeholder="Pago mínimo $" value={dMin} onChange={(e) => setDMin(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="vc-btn-primary" disabled={guardando} onClick={guardarDeuda}>
              {guardando ? "Guardando..." : dEditId ? "Guardar cambios" : "Añadir deuda"}
            </button>
            <button type="button" className="rounded-lg border border-border px-4 text-sm text-muted" onClick={() => { limpiarDeuda(); setPanel(null); }}>
              Cerrar
            </button>
          </div>

          {deudasFilas.length > 0 && (
            <div className="flex flex-col divide-y divide-border border-t border-border pt-1">
              {deudasFilas.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.nombre}</p>
                    <p className="text-[11px] text-muted">
                      {formatMoney(d.saldo)} · {d.apr}% anual · mínimo {formatMoney(d.pago_minimo)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-3">
                    <button type="button" className="text-[11px] font-medium text-teal" onClick={() => editarDeuda(d)}>
                      Editar
                    </button>
                    <button type="button" className="text-[11px] font-medium text-red" onClick={() => quitarDeuda(d.id)}>
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
              <Link href="/dashboard/deudas" className="pt-2 text-xs font-medium text-teal underline">
                Ver mi plan para pagarlas (bola de nieve) →
              </Link>
            </div>
          )}
        </div>
      )}

      {esSaldo && (
        <div className="vc-card mb-3 flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {panel === "ahorro" ? "Cuánto tienes ahorrado" : panel === "balance" ? "Tu balance de hoy" : "Cuánto tienes invertido"}
          </p>
          <p className="text-xs text-muted">
            {panel === "balance" && (pendiente ? "Primero dinos con cuánto empiezas: cuánto dinero tienes hoy (efectivo y cuenta). Luego registras tu " + pendiente + ". " : "Cuánto dinero tienes hoy en efectivo y en tu cuenta. Desde aquí, cada ingreso que anotes lo suma y cada gasto lo resta. ")}
            {cuentaActual
              ? `Ahora mismo tienes anotado ${formatMoney(cuentaActual.saldo)}. Escribe el saldo nuevo.`
              : "Escribe el saldo total de hoy. Lo puedes actualizar cuando quieras."}
          </p>
          <input
            className="vc-input"
            inputMode="decimal"
            placeholder="Saldo actual $"
            value={saldo}
            autoFocus
            onChange={(e) => setSaldo(e.target.value)}
          />
          {error && <p className="text-xs text-red">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="vc-btn-primary" disabled={guardando} onClick={guardarSaldo}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
            <button type="button" className="rounded-lg border border-border px-4 text-sm text-muted" onClick={() => { setPendiente(null); setPanel(null); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
