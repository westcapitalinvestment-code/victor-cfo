"use client";

import { useState } from "react";

// Conexión de banco SIMULADA para la cuenta de demostración (18 oct 2026).
// El Plaid Link real manda un código por SMS al celular de quien lo usa; en
// una demo eso no debe pasar. Aquí todo es de mentira: no se llama a Plaid ni
// se guarda nada, solo recorre los mismos pasos (banco → usuario → código →
// listo) con datos prellenados. Las cuentas que se ven después son las de
// ejemplo que ya trae la cuenta demo.

const BANCOS = ["Banco Popular", "FirstBank", "Oriental", "Banesco"];

export default function DemoBancoModal({ onCerrar, onListo }: { onCerrar: () => void; onListo: (banco: string) => void }) {
  const [paso, setPaso] = useState<"banco" | "login" | "codigo" | "listo">("banco");
  const [banco, setBanco] = useState(BANCOS[0]);

  function avanzar(siguiente: typeof paso, ms = 700) {
    setTimeout(() => setPaso(siguiente), ms);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
        <p className="mb-3 rounded-lg bg-amb/[.12] px-2 py-1 text-center text-[11px] font-medium text-amb">
          Modo demostración — no se conecta ningún banco real
        </p>

        {paso === "banco" && (
          <>
            <p className="mb-2 text-sm font-medium">Selecciona tu banco</p>
            <div className="mb-3 flex flex-col gap-2">
              {BANCOS.map((b) => (
                <button
                  key={b}
                  onClick={() => setBanco(b)}
                  className={`rounded-lg border p-3 text-left text-sm ${banco === b ? "border-teal bg-teal/[.08]" : "border-border"}`}
                >
                  {b}
                </button>
              ))}
            </div>
            <button className="vc-btn-primary" onClick={() => setPaso("login")}>
              Continuar
            </button>
          </>
        )}

        {paso === "login" && (
          <>
            <p className="mb-2 text-sm font-medium">Inicia sesión en {banco}</p>
            <input className="mb-2 w-full rounded-lg border border-border p-3 text-sm" defaultValue="usuario.demo" readOnly />
            <input className="mb-3 w-full rounded-lg border border-border p-3 text-sm" type="password" defaultValue="••••••••••" readOnly />
            <button
              className="vc-btn-primary"
              onClick={() => {
                setPaso("codigo");
              }}
            >
              Iniciar sesión
            </button>
          </>
        )}

        {paso === "codigo" && (
          <>
            <p className="mb-1 text-sm font-medium">Verifica tu identidad</p>
            <p className="mb-2 text-xs text-muted">En la versión real, tu banco envía un código a tu celular. Aquí es solo una demostración.</p>
            <input className="mb-3 w-full rounded-lg border border-border p-3 text-center text-lg tracking-[.4em]" defaultValue="123456" readOnly />
            <button
              className="vc-btn-primary"
              onClick={() => {
                setPaso("listo");
              }}
            >
              Verificar
            </button>
          </>
        )}

        {paso === "listo" && (
          <>
            <p className="mb-1 text-center text-3xl">✅</p>
            <p className="mb-1 text-center text-sm font-medium">{banco} conectado</p>
            <p className="mb-3 text-center text-xs text-muted">VICTOR ya puede traer tus cuentas y transacciones (datos de ejemplo).</p>
            <button className="vc-btn-primary" onClick={() => onListo(banco)}>
              Listo
            </button>
          </>
        )}

        {paso !== "listo" && (
          <button onClick={onCerrar} className="mt-2 w-full p-2 text-xs text-muted">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
