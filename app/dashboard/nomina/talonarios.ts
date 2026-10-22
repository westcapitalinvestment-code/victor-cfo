// Talonarios (recibos de pago) imprimibles / PDF y envío por correo — 21 oct 2026.
// Un talonario por página; "Guardar como PDF" desde el diálogo de impresión.
import { htmlVentanaTalonarios, fechaMDY, type DatosTalonarios } from "@/lib/nomina-talonario-html";

export type DatosCorrida = DatosTalonarios & { error?: string; ultimoEnvio?: { en: string; por: string | null; enviados: number } | null; estado?: string };

export async function cargarTalonarios(corridaId: string, employeeId?: string): Promise<{ datos?: DatosCorrida; error?: string }> {
  const qs = new URLSearchParams({ corridaId });
  if (employeeId) qs.set("employeeId", employeeId);
  const r = await fetch(`/api/nomina/talonarios?${qs}`);
  const d = (await r.json().catch(() => null)) as DatosCorrida | null;
  if (!r.ok || !d) return { error: d?.error ?? "No se pudieron cargar los talonarios." };
  if (d.talonarios.length === 0) return { error: "Esta corrida no tiene empleados." };
  return { datos: d };
}

export async function abrirTalonarios(corridaId: string, employeeId?: string): Promise<string | null> {
  const { datos, error } = await cargarTalonarios(corridaId, employeeId);
  if (!datos) return error ?? "No se pudieron cargar los talonarios.";
  const w = window.open("", "_blank");
  if (!w) return "Tu navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.";
  w.document.write(htmlVentanaTalonarios(datos));
  w.document.close();
  return null;
}

// Pide confirmación (mostrando quién recibe y a quién le falta el email) y envía.
export async function enviarTalonariosPorEmail(corridaId: string, employeeId?: string): Promise<string> {
  const { datos, error } = await cargarTalonarios(corridaId, employeeId);
  if (!datos) return error ?? "No se pudieron cargar los talonarios.";
  const con = datos.talonarios.filter((t) => t.email);
  const sin = datos.talonarios.filter((t) => !t.email);
  if (con.length === 0) return "Ningún empleado de esta corrida tiene email. Agrégalo en la pestaña Empleados.";
  const previo = datos.ultimoEnvio ? `\n\nOJO: ya se enviaron el ${fechaMDY(datos.ultimoEnvio.en)} (${datos.ultimoEnvio.enviados} correos). Si corregiste la corrida, este reenvío manda el talonario actualizado.` : "";
  const ok = window.confirm(
    `Se enviará el talonario del ${fechaMDY(datos.corrida.periodo_inicio)} al ${fechaMDY(datos.corrida.periodo_fin)} a:\n\n` +
      con.map((t) => `• ${t.nombre} — ${t.email}`).join("\n") +
      (sin.length ? `\n\nSin email (no recibirán): ${sin.map((t) => t.nombre).join(", ")}` : "") +
      previo +
      "\n\nEl correo trae sueldo y deducciones. ¿Enviar?"
  );
  if (!ok) return "";
  const r = await fetch("/api/nomina/talonarios/enviar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ corridaId, employeeId }),
  });
  const j = (await r.json().catch(() => null)) as { error?: string; simulado?: boolean; enviados?: number; fallidos?: { nombre: string; motivo: string }[]; sinEmail?: string[] } | null;
  if (!r.ok || !j) return j?.error ?? "No se pudo enviar.";
  const falla = j.fallidos?.length ? ` No se pudo enviar a: ${j.fallidos.map((f) => `${f.nombre} (${f.motivo})`).join("; ")}.` : "";
  if (j.simulado) return `Cuenta demo: se simuló el envío a ${j.enviados ?? 0} empleado(s). No se mandó ningún correo real.`;
  return `Enviados: ${j.enviados ?? 0}.${falla}`;
}
