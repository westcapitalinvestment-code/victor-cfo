import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

// Aviso a Joel de cada registro NUEVO (23 nov 2026): email, plan, si vino por
// Trading y su WhatsApp (si lo dejó), con enlace directo para escribirle.
// Solo cuentas creadas hace menos de 15 minutos; best-effort.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export async function avisarNuevoRegistro(userId: string, trading: boolean): Promise<void> {
  if (!resend) return;
  const { data: u } = await createAdminClient()
    .from("users")
    .select("email, full_name, plan, telefono_registro, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!u?.email || !u.created_at) return;
  if (Date.now() - new Date(u.created_at).getTime() > 15 * 60 * 1000) return;

  const tel = String(u.telefono_registro ?? "").replace(/\D/g, "");
  const wa = tel ? `https://wa.me/${tel.length === 10 ? "1" + tel : tel}` : null;
  const lineas = [
    `Nuevo registro en VICTOR${trading ? " (Trading)" : ""}.`,
    `Nombre: ${u.full_name ?? "—"}`,
    `Email: ${u.email}`,
    `Plan: ${u.plan ?? "—"}`,
    `WhatsApp: ${tel || "no lo dejó"}`,
    wa ? `Escribirle: ${wa}` : "",
    trading ? "Idea: ofrécele ayuda para instalar el guardián en MT5 hoy mismo." : "",
  ].filter(Boolean);
  await resend.emails
    .send({
      from: "VICTOR CFO <soporte@victorcfo.com>",
      to: "info@victorcfo.com",
      subject: `Nuevo registro${trading ? " Trading" : ""}: ${u.email}${tel ? " · con WhatsApp" : ""}`,
      text: lineas.join("\n"),
    })
    .catch(() => {});
}
