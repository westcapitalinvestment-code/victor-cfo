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
  subtype: string | null;
  current_balance: number | null;
  iso_currency_code: string | null;
  es_negocio: boolean;
};

// Conectar banco de verdad (Plaid). El flujo:
//   1. Pedimos un link_token a /api/plaid/create-link-token.
//   2. Abrimos el widget de Plaid (usePlaidLink) con ese token.
//   3. Cuando el usuario termina, mandamos el public_token a
//      /api/plaid/exchange-token, que lo guarda y trae las cuentas.
//   4. Sincronizamos transacciones con /api/plaid/sync-transactions.
// Si PLAID_CLIENT_ID/SECRET no están configurados en el servidor, las
// rutas de arriba devuelven un error honesto y esta pantalla lo muestra
// en vez de fingir que algo pasó.
export default function CuentasPage() {
  const supabase = createClient();

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [cuentas, setCuentas] = useState<CuentaPlaid[]>([]);
  const [cuentasNegocioOcultas, setCuentasNegocioOcultas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [conectando, setConectando] = useState(false);
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

    // Plaid trae todas las cuentas bajo el login del usuario — si es Core,
    // no mostramos las que parecen de negocio (es_negocio), para que no
    // se pueda ver/usar esa parte gratis con solo conectar el banco.
    const { data } = await supabase
      .from("plaid_accounts")
      .select("id, name, mask, subtype, current_balance, iso_currency_code, es_negocio")
      .eq("owner_id", user.id)
      .order("name", { ascending: true });

    const todas = data ?? [];
    setCuentas(pro ? todas : todas.filter((c) => !c.es_negocio));
    setCuentasNegocioOcultas(pro ? 0 : todas.filter((c) => c.es_negocio).length);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarCuentas();
  }, [cargarCuentas]);

  async function pedirLinkToken() {
    setError(null);
    try {
      const res = await fetch("/api/plaid/create-link-token", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo iniciar la conexión.");
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
        const res = await fetch("/api/plaid/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institutionId: metadata.institution?.institution_id ?? null,
            institutionName: metadata.institution?.name ?? null,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No se pudo completar la conexión.");
        setMensaje(`Banco conectado — ${data.cuentas} cuenta(s) encontrada(s).`);
        await cargarCuentas();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo completar la conexión.");
      } finally {
        setConectando(false);
        setLinkToken(null);
      }
    },
  });

  // En cuanto tenemos link_token y el widget está listo, lo abrimos solo —
  // evita un clic extra ("Conectar" → esperar → "Abrir", en vez de eso
  // "Conectar" ya abre el widget directamente).
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

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
        `${data.nuevas} transacción(es) nueva(s), ${data.modificadas} actualizada(s).` +
          (omitidas > 0 ? ` (${omitidas} de cuentas de negocio, no incluidas en tu plan Core.)` : "")
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  const totalBalance = cuentas.reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  return (
    <div className="vc-shell">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-muted hover:opacity-80">
          ← VICTOR
        </Link>
      </div>

      <h1 className="mb-4 text-lg font-medium">Cuentas</h1>

      {error && <p className="mb-3 text-xs text-red">{error}</p>}
      {mensaje && <p className="mb-3 text-xs text-teal">{mensaje}</p>}

      {loading ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : cuentas.length === 0 ? (
        <div className="vc-card text-center">
          <p className="mb-2 text-sm font-medium">Conectar banco (Plaid)</p>
          <p className="mb-4 text-xs text-muted">
            Conecta BPPR, FirstBank, Oriental o Mercury para ver tu balance real y traer tus
            transacciones automáticamente.
          </p>
          <button className="vc-btn-primary" disabled={conectando} onClick={pedirLinkToken}>
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
                <p className="text-sm font-medium">
                  <Sensitive>{formatMoney(Number(c.current_balance || 0))}</Sensitive>
                </p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button className="vc-btn-primary" disabled={sincronizando} onClick={sincronizar}>
              {sincronizando ? "Sincronizando..." : "Sincronizar transacciones"}
            </button>
            <button
              className="rounded-lg border border-border px-4 py-3 text-sm text-muted"
              disabled={conectando}
              onClick={pedirLinkToken}
            >
              + Otro banco
            </button>
          </div>
        </>
      )}
    </div>
  );
}
