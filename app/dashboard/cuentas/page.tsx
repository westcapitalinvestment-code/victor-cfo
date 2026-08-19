"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePlaidLink } from "react-plaid-link";
import { createClient } from "@/lib/supabase/client";
import { Sensitive } from "@/lib/privacy";
import { formatMoney } from "@/lib/format";

type CuentaPlaid = {
  id: string;
  name: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
  es_negocio: boolean;
};

// Plaid siempre manda current_balance de tarjetas de crédito y préstamos
// como número POSITIVO (representa "cuánto debes", no un saldo negativo).
// Si sumamos eso igual que una cuenta de banco, el balance total queda
// inflado — una deuda de $18,000 se vería como si fuera dinero tuyo. Por
// eso hay que restar (no sumar) estos tipos, y mostrarlos en rojo con
// signo negativo en la lista, para que se lea como lo que realmente es:
// una deuda, no un ingreso.
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

  const cargarCuentas = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: perfil } = await supabase.from("users").select("plan").eq("id", user.id).maybeSingle();
    const pro = perfil?.plan === "pro" || perfil?.plan === "proplus";

    const { data } = await supabase
      .from("plaid_accounts")
      .select("id, name, mask, type, subtype, current_balance, iso_currency_code, es_negocio")
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
        `${data.nuevas} transacción(es) nueva(s), ${data.modificadas} actualizada(s). ` +
          `(Plaid mandó ${data.totalPlaidAdded ?? "?"} nuevas / ${data.totalPlaidModified ?? "?"} modificadas en total.)` +
          (omitidas > 0 ? ` (${omitidas} de cuentas de negocio, no incluidas en tu plan Core.)` : "")
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

  const totalBalance = cuentas.reduce(
    (sum, c) => sum + (esPasivo(c.type) ? -Number(c.current_balance || 0) : Number(c.current_balance || 0)),
    0
  );
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
                onClick={() => pedirLinkToken(b.id)}
              >
                Reconectar
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="mb-3 text-xs text-red">{error}</p>}
      {mensaje && <p className="mb-3 text-xs text-teal">{mensaje}</p>}

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : cuentas.length === 0 && bancos.length === 0 ? (
        <div className="vc-card text-center">
          <p className="mb-2 text-sm font-medium">Conectar banco (Plaid)</p>
          <p className="mb-4 text-xs text-muted">
            Conecta BPPR, FirstBank, Oriental o Mercury para ver tu balance real y traer tus
            transacciones automáticamente.
          </p>
          <button className="vc-btn-primary" disabled={conectando} onClick={() => pedirLinkToken()}>
            {conectando ? "Conectando..." : "Conectar banco"}
          </button>
        </div>
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
              <div key={c.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
                <div>
                  <p className="text-sm text-text">{c.name}</p>
                  <p className="text-xs capitalize text-muted">
                    {c.subtype} {c.mask && `••${c.mask}`}
                  </p>
                </div>
                <p className={`text-sm font-medium ${esPasivo(c.type) ? "text-red" : ""}`}>
                  <Sensitive>
                    {esPasivo(c.type) ? "-" : ""}
                    {formatMoney(Number(c.current_balance || 0))}
                  </Sensitive>
                </p>
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

          <div className="flex gap-2">
            <button className="vc-btn-primary" disabled={sincronizando} onClick={sincronizar}>
              {sincronizando ? "Sincronizando..." : "Sincronizar transacciones"}
            </button>
            <button
              className="rounded-lg border border-border px-4 py-3 text-sm text-muted"
              disabled={conectando}
              onClick={() => pedirLinkToken()}
            >
              + Otro banco
            </button>
          </div>
        </>
      )}
    </div>
  );
}
