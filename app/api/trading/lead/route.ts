import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { armarPlan, type RespuestasPlan, type Experiencia, type Estilo, type Problema } from "@/lib/trading-plan-sugerido";
import { lineasPlan } from "@/lib/trading-plan-texto";

// Plan gratis sin registro (24 nov 2026): quien arma su plan en /trading/plan y
// deja su email lo recibe por correo, y a Joel le llega un aviso con su
// WhatsApp para escribirle. Público a propósito: valida todo y recalcula el
// plan aquí (no confía en lo que mande el navegador).
export const dynamic = "force-dynamic";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EXP: Experiencia[] = ["nuevo", "menos1", "mas1"];
const EST: Estilo[] = ["scalping", "intradia", "swing"];
const PROB: Problema[] = ["revancha", "sobreoperar", "sin_stop", "mover_stop"];
const SITIO = "https://www.victorcfo.com";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const email = String(b?.email ?? "").trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Escribe un email válido." }, { status: 400 });
  const tel = String(b?.telefono ?? "").replace(/[^\d+]/g, "").slice(0, 20);

  const r = b?.respuestas ?? {};
  const capital = Math.min(10_000_000, Math.max(0, Number(r.capital) || 0));
  if (!capital) return NextResponse.json({ error: "Falta el capital." }, { status: 400 });
  const respuestas: RespuestasPlan = {
    capital,
    experiencia: EXP.includes(r.experiencia) ? r.experiencia : "menos1",
    estilo: EST.includes(r.estilo) ? r.estilo : "intradia",
    problemas: Array.isArray(r.problemas) ? (r.problemas as Problema[]).filter((x) => PROB.includes(x)) : [],
    objetivo: "crecer",
    edad: "30a45",
    sesiones: [],
  };
  const plan = armarPlan(respuestas);

  const utm: Record<string, string> = {};
  if (b?.utm && typeof b.utm === "object") {
    for (const [k, v] of Object.entries(b.utm).slice(0, 6)) if (k.startsWith("utm_") && typeof v === "string") utm[k.slice(0, 20)] = v.slice(0, 100);
  }

  const admin = createAdminClient();
  // Freno simple: el mismo email no más de 3 veces por hora.
  const { count } = await admin
    .from("trading_leads")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gt("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 3) return NextResponse.json({ ok: true });

  await admin.from("trading_leads").insert({ email, telefono: tel || null, respuestas, plan, utm });

  if (resend) {
    const lineas = lineasPlan(plan);
    const registro = `${SITIO}/registro?plan=core&ciclo=mensual&trading=1&utm_source=email&utm_campaign=plan_gratis`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1B3A5C">
<h2 style="margin:0 0 8px">Tu plan de trading de VICTOR</h2>
<p>Para una cuenta de <b>$${capital.toLocaleString("en-US")}</b>. Son límites para proteger tu capital, como los de una prop firm. Los puedes ajustar.</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0">${lineas
      .map((l) => `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#666">${esc(l.k)}</td><td style="padding:8px;border-bottom:1px solid #eee"><b>${esc(l.v)}</b></td></tr>`)
      .join("")}</table>
<p><b>Por qué:</b></p><ul>${plan.razones.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
<p><b>Antes de cada trade:</b></p><ul>${plan.checklist.map((x) => `<li>☐ ${esc(x)}</li>`).join("")}</ul>
<p style="margin-top:20px">Escribir las reglas es fácil; cumplirlas en un mal día no. El guardián de VICTOR las pone solas en tu MT5: calcula tu lote, pone tu stop y te cierra el día cuando llegas a tu límite.</p>
<p><a href="${registro}" style="display:inline-block;background:#19E68C;color:#07090D;padding:12px 22px;border-radius:999px;font-weight:bold;text-decoration:none">Activar mi guardián 7 días gratis</a></p>
<p style="font-size:12px;color:#888">Sin tarjeta. VICTOR no da señales ni asesoría financiera; el trading con apalancamiento conlleva alto riesgo. Recibiste este email porque pediste tu plan en victorcfo.com.</p>
</div>`;
    await resend.emails
      .send({ from: "VICTOR CFO <soporte@victorcfo.com>", to: email, subject: "Tu plan de trading (VICTOR)", html })
      .catch(() => {});

    const t = tel.replace(/\D/g, "");
    const wa = t ? `https://wa.me/${t.length === 10 ? "1" + t : t}` : null;
    await resend.emails
      .send({
        from: "VICTOR CFO <soporte@victorcfo.com>",
        to: "info@victorcfo.com",
        subject: `Nuevo contacto (plan gratis): ${email}${t ? " · con WhatsApp" : ""}`,
        text: [
          "Alguien armó su plan gratis en /trading/plan.",
          `Email: ${email}`,
          `WhatsApp: ${t || "no lo dejó"}`,
          wa ? `Escribirle: ${wa}` : "",
          `Capital: $${capital} · experiencia: ${respuestas.experiencia} · estilo: ${respuestas.estilo} · le cuesta: ${respuestas.problemas.join(", ") || "—"}`,
          `Anuncio: ${utm.utm_content ?? utm.utm_source ?? "—"}`,
          "Idea: escríbele hoy, pregúntale cómo le fue con su plan y ofrécele conectarle el guardián.",
        ]
          .filter(Boolean)
          .join("\n"),
      })
      .catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
