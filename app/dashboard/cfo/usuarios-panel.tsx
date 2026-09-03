"use client";

import { useMemo, useState } from "react";
import { PLAN_LABEL } from "@/lib/plan-label";

// Panel de "Usuarios" del Dashboard de Operaciones — colapsable + búsqueda
// por nombre o email (3 sept 2026, pedido de Joel: "ponle un serach a
// usuario por si tengo q buscar"). Recibe los datos YA calculados desde el
// Server Component (app/dashboard/cfo/page.tsx) — este componente solo
// maneja estado de UI (abierto/cerrado, texto de búsqueda), no vuelve a
// tocar Supabase.

export type UsuarioFila = {
  id: string;
  nombre: string;
  email: string;
  plan: string;
  planStatus: string | null;
  creadoEn: string | null;
  gastoIaCentavos: number;
};

const ESTADO_LABEL: Record<string, { texto: string; clase: string }> = {
  active: { texto: "Activo", clase: "text-grn" },
  trialing: { texto: "Trial", clase: "text-amb" },
  incomplete: { texto: "Incompleto", clase: "text-muted" },
  cancelled: { texto: "Cancelado", clase: "text-red" },
};

function fmt(n: number) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtFecha(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "short", year: "numeric" })
    : "—";
}

export default function UsuariosPanel({ usuarios, defaultAbierto = false }: { usuarios: UsuarioFila[]; defaultAbierto?: boolean }) {
  const [abierto, setAbierto] = useState(defaultAbierto);
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [usuarios, busqueda]);

  return (
    <div className="vc-card mb-3">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center justify-between text-left">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Usuarios ({usuarios.length})</p>
        <span className="shrink-0 text-[11px] text-muted">{abierto ? "Ocultar ▲" : "Ver ▼"}</span>
      </button>

      {abierto && (
        <div className="mt-3">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="vc-input mb-3 !py-2 text-sm"
          />

          {usuarios.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Sin usuarios todavía.</p>
          ) : filtrados.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted">Nadie coincide con &quot;{busqueda}&quot;.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted">
                    <th className="pb-2 pr-2">Usuario</th>
                    <th className="pb-2 pr-2">Plan</th>
                    <th className="pb-2 pr-2">Estado</th>
                    <th className="pb-2 pr-2">Desde</th>
                    <th className="pb-2 text-right">Gasto IA</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((u) => {
                    const estado = ESTADO_LABEL[u.planStatus ?? ""] ?? { texto: u.planStatus ?? "—", clase: "text-muted" };
                    return (
                      <tr key={u.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-2">
                          <p className="truncate">{u.nombre || "Sin nombre"}</p>
                          <p className="truncate text-[11px] text-muted">{u.email}</p>
                        </td>
                        <td className="py-2 pr-2">{PLAN_LABEL[u.plan] ?? u.plan}</td>
                        <td className={`py-2 pr-2 ${estado.clase}`}>{estado.texto}</td>
                        <td className="py-2 pr-2 text-muted">{fmtFecha(u.creadoEn)}</td>
                        <td className="py-2 text-right">{fmt(u.gastoIaCentavos / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
