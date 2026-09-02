"use client";

import Link from "next/link";

// Nav de secciones del portal Administrador ($20/mes, migración 0056) — solo
// se monta en las páginas /admin/[entityId]/... cuando el admin/secretaria
// es nivel Administrador (Secretaria solo tiene Facturación, no necesita
// tabs). Duplicado a propósito del patrón de tabs del resto del código, sin
// depender de FacturacionPortal/PagosPortal que ya traen su propio header.
const SECCIONES = [
  { id: "facturacion", label: "Facturación", icon: "ti-file-invoice" },
  { id: "pagos", label: "Pagos", icon: "ti-cash" },
  { id: "metas", label: "Metas", icon: "ti-target" },
  { id: "boveda", label: "Bóveda", icon: "ti-folder" },
  { id: "cuentas", label: "Cuentas", icon: "ti-building-bank" },
] as const;

export default function AdminNav({
  entityId,
  activo,
}: {
  entityId: string;
  activo: (typeof SECCIONES)[number]["id"];
}) {
  function hrefDe(id: string) {
    return id === "facturacion" ? `/admin/${entityId}` : `/admin/${entityId}/${id}`;
  }

  return (
    <div className="vc-shell !pb-0">
      <div className="mb-3 flex gap-1.5 overflow-x-auto">
        {SECCIONES.map((s) => (
          <Link
            key={s.id}
            href={hrefDe(s.id)}
            className="flex flex-shrink-0 items-center gap-1 rounded-pill px-3 py-1.5 text-xs font-medium"
            style={
              activo === s.id
                ? { background: "#1D9E75", color: "#fff" }
                : { background: "var(--card)", color: "var(--muted)", border: "1px solid var(--border)" }
            }
          >
            <i className={`ti ${s.icon}`} style={{ fontSize: 13 }} />
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
