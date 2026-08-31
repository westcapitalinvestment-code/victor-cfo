"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePlaidLink } from "react-plaid-link";
import { createClient } from "@/lib/supabase/client";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";
import CuentasManuales from "./cuentas-manuales";
import SubirEstado from "./subir-csv";
type CuentaPlaid = {
  id: string;
  plaid_account_id: string;
  name: string | null;
  nickname: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
  es_negocio: boolean;
};
function esPasivo(type: string | null): boolean {
  return type === "credit" || type === "loan";
}
type BancoPlaid = {
  id: string;
  institution_name: string | null;
  status: string;
};
export default function CuentasPage() {
  const supabase = createClient();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [reconectandoItemId, setReconectandoItemId] = useState<string | null>(null);
  const [historialCompleto, setHistorialCompleto] = useState(true);
  const [cuentas, setCuentas] = useState<CuentaPlaid[]>([]);
  const [bancos, setBancos] = useState<BancoPlaid[]>([]);
  const [cuentasNegocioOcultas, setCuentasNegocioOcultas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [desconectandoId, setDesconectandoId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rellenar el hueco de historial que Plaid no trajo (ej. BPPR solo da
  // ~45 días) — subir el estado de cuenta directo a una cuenta que YA
  // está conectada, igual que se puede hacer con una cuenta manual.
  const [subiendoEstadoId, setSubiendoEstadoId] = useState<string | null>(null);
  // Renombrar cuenta de Plaid — caso real de Joel: dos cuentas "checking"
  // del mismo banco llegan con nombres iguales o casi iguales, y no hay
  // forma de saber cuál es cuál sin adivinar por el balance. Nunca se toca
  // el "name" real que manda el banco — nickname es aparte y se prefiere
  // mostrar cuando existe (ver migración 0024).
  const [renombrandoId, setRenombrandoId] = useState<string | null>(null);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  // Gate del plan gratis (30 agosto 2026, migración 0031): conectar banco
  // es una de las dos cosas caras (~$2/usuario/mes de Plaid) que requieren
  // Core — un usuario 'gratis' ve el mismo upsell que en el chat de
  // VICTOR en vez de abrir Plaid Link de una vez.
  const [plan, setPlan] = useState<string | null>(null);
  const [esReferido, setEsReferido] = useState(false);
  const [mostrandoUpsell, setMostrandoUpsell] = useState(false);
  const [activandoCore, setActivandoCore] = useState(false);
  const [upsellError, setUpsellError] = useState<string | null>(null);
  const cargarCuentas = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: perfil } = await supabase
      .from("users")
      .select("plan, referred_by")
      .eq("id", user.id)
      .maybeSingle();
    const pro = perfil?.plan === "pro" || perfil?.plan === "proplus";
    setPlan(perfil?.plan ?? null);
    setEsReferido(!!perfil?.referred_by);
    const { data } = await supabase
      .from("plaid_accounts")
      .select("id, plaid_account_id, name, nickname, mask, type, subtype, current_balance, iso_currency_code, es_negocio")
      .eq("owner_id", user.id)
      .order("name", { ascending: true });
    const todas = data ?? [];
    setCuentas(pro ? todas : todas.filter((c) => !c.es_negocio));
    setCuentasNegocioOcultas(pro ? 0 : todas.filter((c) => c.es_negocio).length);
    const { data: bancosData } = await supabase
      .from("plaid_items")
      .select("id, institution_name, status")
      .eq("owner_id", user.id)
      .order("institution_name", { ascending: true });
    setBancos(bancosData ?? []);
    setLoading(false);
  }, [supabase]);
  useEffect(() => {
    cargarCuentas();
  }, [cargarCuentas]);
  // Igual que en victor-chat.tsx: llama al checkout de Stripe de verdad,
  // con el precio correcto ($12.99 referido / $14.99 normal) ya resuelto
  // por priceIdPara en el server a partir de users.referred_by.
  async function activarCore() {
    setActivandoCore(true);
    setUpsellError(null);
    const returnTo = typeof window !== "undefined" ? window.location.pathname : "/dashboard/cuentas";
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: "core", ciclo: "mensual", returnTo, cancelTo: returnTo }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.url) {
      window.location.href = json.url;
      return;
    }
    setActivandoCore(false);
    setUpsellError(json?.error || "No se pudo iniciar el pago. Intenta de nuevo en un momento.");
  }

  // Punto único por el que pasa cualquier botón que quiera abrir Plaid
  // Link — así el gate de plan='gratis' no se puede saltar añadiendo un
  // botón nuevo que llame pedirLinkToken() directo.
  function iniciarConexion(itemId?: string) {
    if (plan === "gratis") {
      setMostrandoUpsell(true);
      return;
    }
    pedirLinkToken(itemId);
  }

  async function pedirLinkToken(itemId?: string) {
    setError(null);
    setReconectandoItemId(itemId ?? null);
    if (!itemId) {
      const quiereAnoCompleto = window.confirm(
        "Recomendado: traer todas las transacciones desde el 1 de enero de este año, así tienes todo listo para las planillas de abril.\n\nAceptar = año completo (recomendado). Cancelar = solo desde hoy en adelante."
      );
      setHistorialCompleto(quiereAnoCompleto);
    }
    try {
      const res = await fetch("/api/plaid/create-link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemId ? { itemId } : {}),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          `${data?.error || "No se pudo iniciar la conexión."}${data?.detalle ? ` (${data.detalle})` : ""}${data?.ambiente ? ` [ambiente: ${data.ambiente}]` : ""}`
        );
      setLinkToken(data.linkToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la conexión con Plaid.");
    }
  }
  const { open, ready } = usePlaidLink({
    token: linkToken ?? "",
    onSuccess: async (publicToken, metadata) => {
      setConectando(true);
      setError(null);
      try {
        if (reconectandoItemId) {
          const res = await fetch("/api/plaid/confirmar-reconexion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ itemId: reconectandoItemId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "No se pudo confirmar la reconexión.");
          setMensaje("Banco reconectado — VICTOR ya puede volver a traer tus transacciones.");
        } else {
          const res = await fetch("/api/plaid/exchange-token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicToken,
              institutionId: metadata.institution?.institution_id ?? null,
              institutionName: metadata.institution?.name ?? null,
              historialCompleto,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "No se pudo completar la conexión.");
          setMensaje(`Banco conectado — ${data.cuentas} cuenta(s) encontrada(s).`);
        }
        await cargarCuentas();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo completar la conexión.");
      } finally {
        setConectando(false);
        setLinkToken(null);
        setReconectandoItemId(null);
      }
    },
  });
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);
  async function desconectarBanco(itemId: string, nombre: string | null) {
    const ok = window.confirm(`¿Desconectar ${nombre || "este banco"}? Dejarás de ver sus cuentas y VICTOR dejará de traer transacciones nuevas de ahí.`);
    if (!ok) return;
    const borrarHistorial = window.confirm(
      `¿También quieres borrar las transacciones que VICTOR ya importó de ${nombre || "este banco"}? Si dices que no, se quedan como historial (útil para referencia o taxes). Esto no se puede deshacer.`
    );
    setDesconectandoId(itemId);
    setError(null);
    setMensaje(null);
    try {
      const res = await fetch("/api/plaid/desconectar-banco", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, borrarHistorial }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo desconectar el banco.");
      setMensaje(
        borrarHistorial
          ? `Banco desconectado — ${data.transaccionesBorradas ?? 0} transacción(es) borrada(s).`
          : "Banco desconectado — el historial de transacciones se mantuvo."
      );
      await cargarCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo desconectar el banco.");
    } finally {
      setDesconectandoId(null);
    }
  }
  async function sincronizar() {
    setSincronizando(true);
    setError(null);
    setMensaje(null);
    try {
      const res = await fetch("/api/plaid/sync-transactions", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo sincronizar.");
      const omitidas = data.cuentasNegocioOmitidas || 0;
      setMensaje(
        `${data.nuevas} transacción(es) nueva(s), ${data.modificadas} actualizada(s)` +
          (data.eliminadas > 0 ? `, ${data.eliminadas} reemplazada(s) por el banco` : "") +
          `. (Plaid mandó ${data.totalPlaidAdded ?? "?"} nuevas / ${data.totalPlaidModified ?? "?"} modificadas en total.)` +
          (omitidas > 0 ? ` (${omitidas} de cuentas de negocio, no incluidas en tu plan Core.)` : "") +
          // Diagnóstico del refresh a Plaid — si el banco no soporta pedirle
          // datos frescos ahora mismo, esto lo dice explícito en vez de
          // dejar la pantalla en silencio sin explicar por qué "Plaid
          // mandó 0 nuevas" aunque el usuario vea algo distinto en su banco.
          (data.refreshInfo && data.refreshInfo.length > 0 ? ` — ${data.refreshInfo.join(" | ")}` : "")
      );
      if (data.errores && data.errores.length > 0) {
        setError(`Errores al guardar: ${data.errores.join(" | ")}`);
      }
      await cargarCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }
  async function guardarNickname(accountId: string) {
    setGuardandoNombre(true);
    setError(null);
    try {
      const res = await fetch("/api/plaid/renombrar-cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, nickname: nuevoNombre.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo renombrar la cuenta.");
      setRenombrandoId(null);
      await cargarCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo renombrar la cuenta.");
    } finally {
      setGuardandoNombre(false);
    }
  }

  const totalBalance = cuentas
    .filter((c) => c.type === "depository")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);
  const bancosVencidos = bancos.filter((b) => b.status !== "active");
  return (
    <div className="vc-shell">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>
      <h1 className="mb-4 text-lg font-medium">Cuentas</h1>
      {bancosVencidos.length > 0 && (
        <div className="mb-3 space-y-2">
          {bancosVencidos.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-lg border border-red bg-red/[.06] px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium text-text">
                  {b.institution_name || "Un banco"} perdió la conexión
                </p>
                <p className="text-xs text-muted">
                  Puede ser que cambiaste la contraseña o venció el código de verificación. Mientras tanto no
                  estamos trayendo transacciones nuevas de ahí.
                </p>
              </div>
              <button
                className="vc-btn-primary shrink-0"
                disabled={conectando}
                onClick={() => iniciarConexion(b.id)}
              >
                Reconectar
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mb-3 text-xs text-red">{error}</p>}
      {mensaje && <p className="mb-3 text-xs text-teal">{mensaje}</p>}
      {mostrandoUpsell && (
        <div className="vc-card mb-3 text-center">
          <p className="mb-1 text-sm font-medium">Conectar banco es parte de Core</p>
          <p className="mb-3 text-xs text-muted">
            En el plan gratis puedes categorizar por CSV — conectar tu banco de verdad (BPPR, FirstBank,
            Oriental, Mercury) se activa con Core.
          </p>
          <div className="mb-3 rounded-lg border border-teal bg-teal/[.06] p-3">
            <p className="text-2xl font-semibold text-teal">
              ${esReferido ? "12.99" : "14.99"}
              <span className="text-sm font-normal">/mes</span>
            </p>
            {esReferido && <p className="text-xs text-muted">Precio de referido</p>}
          </div>
          {upsellError && <p className="mb-2 text-xs text-red">{upsellError}</p>}
          <button className="vc-btn-primary mb-2" disabled={activandoCore} onClick={activarCore}>
            {activandoCore ? "Conectando con Stripe..." : `Activar Core — $${esReferido ? "12.99" : "14.99"}/mes`}
          </button>
          <button
            className="w-full rounded-lg border border-border bg-transparent p-3 text-sm text-muted"
            onClick={() => setMostrandoUpsell(false)}
          >
            Ahora no
          </button>
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : cuentas.length === 0 && bancos.length === 0 ? (
        <>
          <div className="vc-card mb-3 text-center">
            <p className="mb-2 text-sm font-medium">Conectar banco (Plaid)</p>
            <p className="mb-4 text-xs text-muted">
              Conecta BPPR, FirstBank, Oriental o Mercury para ver tu balance real y traer tus
              transacciones automáticamente.
            </p>
            <button className="vc-btn-primary" disabled={conectando} onClick={() => iniciarConexion()}>
              {conectando ? "Conectando..." : "Conectar banco"}
            </button>
          </div>
          {plan === "gratis" && (
            // Pista explícita para plan gratis (30 agosto 2026, reportado por
            // Joel: "no vi dónde el usuario sube el CSV" al probar el flujo
            // gratis) — sin Plaid, la única forma de traer transacciones es
            // crear una cuenta manual abajo y subir el CSV desde ahí. Antes
            // no había ningún texto que conectara "categorizar por CSV" (lo
            // que promete /registro) con la sección de Cuentas manuales.
            <div className="mb-3 rounded-lg border border-teal bg-teal/[.06] p-3 text-center text-xs text-text">
              ¿Prefieres no conectar el banco todavía? Crea tus cuentas manual abajo (ej. "BPPR
              Checking, Oriental, Firstbank, etc") y sube tus CSV para categorizar tus gastos —
              es gratis.
            </div>
          )}
          <CuentasManuales />
        </>
      ) : (
        <>
          <div className="vc-bal mb-3">
            <p className="vc-bal-lbl">Balance total</p>
            <p className="vc-bal-amt">
              <Sensitive>{formatMoney(totalBalance)}</Sensitive>
            </p>
          </div>
          {cuentasNegocioOcultas > 0 && (
            <div className="mb-3 rounded-lg border border-teal bg-teal/[.06] p-3 text-xs text-text">
              Detectamos {cuentasNegocioOcultas} cuenta{cuentasNegocioOcultas > 1 ? "s" : ""} que parece
              {cuentasNegocioOcultas > 1 ? "n" : ""} de negocio en este banco — no la
              {cuentasNegocioOcultas > 1 ? "s" : ""} mostramos ni contamos en tu plan Core.{" "}
              <Link href="/dashboard/equipo" className="font-medium text-teal underline">
                Activa VICTOR Pro
              </Link>{" "}
              para verla{cuentasNegocioOcultas > 1 ? "s" : ""}.
            </div>
          )}
          <div className="vc-card mb-3 !p-0">
            {cuentas.map((c) => (
              <div key={c.id} className="border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-text">{c.nickname || c.name}</p>
                    <p className="text-xs capitalize text-muted">
                      {c.subtype} {c.mask && `••${c.mask}`}
                      {c.nickname && c.name ? ` · ${c.name}` : ""}
                    </p>
                  </div>
                  <p className={`text-sm font-medium ${esPasivo(c.type) ? "!text-red" : ""}`}>
                    <Sensitive>
                      {esPasivo(c.type) ? "-" : ""}
                      {formatMoney(Number(c.current_balance || 0))}
                    </Sensitive>
                  </p>
                </div>

                <button
                  className="mt-1 text-[11px] text-teal hover:opacity-80"
                  onClick={() => setSubiendoEstadoId(subiendoEstadoId === c.plaid_account_id ? null : c.plaid_account_id)}
                >
                  {subiendoEstadoId === c.plaid_account_id
                    ? "Ocultar"
                    : "Subir estado de cuenta (rellenar historial)"}
                </button>
                <button
                  className="ml-3 mt-1 text-[11px] text-muted hover:opacity-80"
                  onClick={() => {
                    if (renombrandoId === c.id) {
                      setRenombrandoId(null);
                    } else {
                      setRenombrandoId(c.id);
                      setNuevoNombre(c.nickname || "");
                    }
                  }}
                >
                  {renombrandoId === c.id ? "Cancelar" : "Renombrar"}
                </button>

                {renombrandoId === c.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      autoFocus
                      className="vc-input !py-1.5 !text-xs"
                      placeholder={c.name || "Nombre de la cuenta"}
                      value={nuevoNombre}
                      onChange={(e) => setNuevoNombre(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") guardarNickname(c.id);
                      }}
                    />
                    <button
                      className="text-xs text-teal disabled:opacity-50"
                      disabled={guardandoNombre}
                      onClick={() => guardarNickname(c.id)}
                    >
                      ✓
                    </button>
                  </div>
                )}

                {subiendoEstadoId === c.plaid_account_id && (
                  <SubirEstado
                    origen="plaid"
                    cuentaId={c.plaid_account_id}
                    plan={plan}
                    onCerrar={() => {
                      setSubiendoEstadoId(null);
                      cargarCuentas();
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          {bancos.length > 0 && (
            <div className="vc-card mb-3 !p-0">
              <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted">Bancos conectados</p>
              {bancos.map((b) => (
                <div key={b.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
                  <div>
                    <p className="text-sm text-text">{b.institution_name || "Banco sin nombre"}</p>
                    <p className="text-xs text-muted">{b.status === "active" ? "Conectado" : "Necesita reconexión"}</p>
                  </div>
                  <button
                    className="text-xs text-red disabled:opacity-50"
                    disabled={desconectandoId === b.id}
                    onClick={() => desconectarBanco(b.id, b.institution_name)}
                  >
                    {desconectandoId === b.id ? "Desconectando..." : "Desconectar"}
                  </button>
                </div>
              ))}
            </div>
          )}
          <CuentasManuales />
          <div className="flex gap-2">
            <button className="vc-btn-primary" disabled={sincronizando} onClick={sincronizar}>
              {sincronizando ? "Sincronizando..." : "Sincronizar transacciones"}
            </button>
            <button
              className="rounded-lg border border-border px-4 py-3 text-sm text-muted"
              disabled={conectando}
              onClick={() => iniciarConexion()}
            >
              + Otro banco
            </button>
          </div>
        </>
      )}
    </div>
  );
}
