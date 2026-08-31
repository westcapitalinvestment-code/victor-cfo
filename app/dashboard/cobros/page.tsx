import { redirect } from "next/navigation";

// Cobros dejó de ser un ícono propio del nav (30-31 agosto 2026) — ahora
// vive como pestaña dentro del portal de Facturación, calcado del mockup
// real (VICTOR Pro — Producto Completo_FINAL.html). Esta ruta se deja
// como redirect por si algún link viejo (o el historial del navegador de
// Joel) todavía apunta aquí.
export default function CobrosPage() {
  redirect("/dashboard/facturacion?tab=cobros");
}
