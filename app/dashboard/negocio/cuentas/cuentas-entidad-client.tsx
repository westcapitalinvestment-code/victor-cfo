"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { Sensitive } from "@/lib/privacy";
import CuentasManuales from "../../cuentas/cuentas-manuales";

type CuentaPlaid = {
  id: string;
  plaid_account_id: string;
  name: string | null;
  nickname: string | null;
  mask: string | null;
  type: string | null;
  subtype: string | null;
  current_balance: number | null;
};

function esPasivo(type: string | null): boolean {
  return type === "credit" || type === "loan";
}

// 8 sept 2026 — Joel: "debe haber un botón para sincronizar y añadir banco
// o cuentas manuales en cada entidad para que quede todo separado en su
// tab". Antes, /dashboard/negocio/cuentas era de solo lectura y mandaba
// todo (conectar, crear cuenta manual) a /dashboard/cuentas (Personal),
// donde encima había que asignar la entidad a mano con "Pertenece a" por
// cada cuenta. Este componente trae ese trabajo aquí mismo: conectar un
// banco nuevo lo asigna a ESTA entidad desde el primer momento (el
// exchange-token ya acepta entityId — ver app/api/plaid/exchange-token),
// y las cuentas manuales que se creen aquí también (CuentasManuales ya
// acepta el prop entityId). Si un banco conectado desde aquí resulta traer
// también cuentas personales mezcladas, se pueden reasignar con el mismo
// dropdown "Pertenece a" de siempre en /dashboard/cuentas — eso no cambió.
export default function CuentasEntidadClient({
  entidadId,
  cuentasIniciales,
}: {
  entidadId: string;
  cuentasIniciales: CuentaPlaid[];
}) {
  const supabase = createClient();
  const [cuentas, setCuentas] = useState<CuentaPlaid[]>(cuentasIniciales);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargarCuentas = useCallback(async () => {
    const { data } = await supabase
      .from("plaid_accounts")
      .select("id, plaid_account_id, name, nickname, mask, type, subtype, current_balance")
      .eq("entity_id", entidadId)
      .order("name", { ascending: true });
    if (data) setCuentas(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entidadId]);

  async function iniciarConexion() {
    setError(null);
    const quiereAnoCompleto = window.confirm(
      "Recomendado: traer todas las transacciones desde el 1 de enero de este año, así tienes todo listo para las planillas de abril.\n\nAceptar = año completo (recomendado). Cancelar = solo desde hoy en adelante."
    );
    setHistorialCompleto(quiereAnoCompleto);
    try {
      const res = await fetch("/api/plaid/create-link-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo iniciar la conexión.");
      setLinkToken(data.linkToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar la conexión con Plaid.");
    }
  }

  const [historialCompleto, setHistorialCompleto] = useState(true);

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
            historialCompleto,
            entityId: entidadId,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "No se pudo completar la conexión.");
        setMensaje(`Banco conectado — ${data.cuentas} cuenta(s) asignada(s) a esta entidad.`);
        await recargarCuentas();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo completar la conexión.");
      } finally {
        setConectando(false);
        setLinkToken(null);
      }
    },
  });

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
      setMensaje(`${data.nuevas} transacción(es) nueva(s), ${data.modificadas} actualizada(s) — de todas tus cuentas conectadas.`);
      await recargarCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo sincronizar.");
    } finally {
      setSincronizando(false);
    }
  }

  const totalBalance = cuentas
    .filter((c) => c.type === "depository")
    .reduce((sum, c) => sum + Number(c.current_balance || 0), 0);

  return (
    <div>
      {error && <p className="mb-3 text-xs text-red">{error}</p>}
      {mensaje && <p className="mb-3 text-xs text-teal">{mensaje}</p>}

      {cuentas.length > 0 && (
        <>
          <div className="vc-bal mb-3">
            <p className="vc-bal-lbl">Balance total</p>
            <p className="vc-bal-amt">
              <Sensitive>{formatMoney(totalBalance)}</Sensitive>
            </p>
          </div>
          <div className="vc-card mb-3 !p-0">
            {cuentas.map((c) => (
              <div key={c.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
                <div>
                  <p className="text-sm text-text">{c.nickname || c.name}</p>
                  <p className="text-xs capitalize text-muted">
                    {c.subtype} {c.mask && `••${c.mask}`}
                  </p>
                </div>
                <p className={`text-sm font-medium ${esPasivo(c.type) ? "!text-red" : ""}`}>
                  <Sensitive>
                    {esPasivo(c.type) ? "-" : ""}
                    {formatMoney(Number(c.current_balance || 0))}
                  </Sensitive>
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      <CuentasManuales entityId={entidadId} />

      <div className="flex gap-2">
        <button className="vc-btn-primary" disabled={sincronizando} onClick={sincronizar}>
          {sincronizando ? "Sincronizando..." : "Sincronizar transacciones"}
        </button>
        <button className="rounded-lg border border-border px-4 py-3 text-sm text-muted" disabled={conectando} onClick={iniciarConexion}>
          {conectando ? "Conectando..." : "+ Conectar banco"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Si el banco que conectes aquí trae también cuentas personales mezcladas, puedes reasignarlas desde{" "}
        <a href="/dashboard/cuentas" className="text-teal underline">
          Cuentas (Personal)
        </a>
        , con &quot;Pertenece a&quot;.
      </p>
    </div>
  );
}
