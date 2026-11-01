import { Resend } from "resend";
import { createHmac, timingSafeEqual } from "crypto";

// Correos automáticos a contactos (contables y negocios) que un vendedor
// visitó y que DIERON PERMISO en la visita (checkbox en el portal del vendedor).
// Secuencia corta de 3 correos. Cada correo trae: quién lo envía, la dirección
// física, por qué lo recibe y un enlace de baja de un clic (también en la
// cabecera List-Unsubscribe). Quien se da de baja no vuelve a recibir nada.
//
// Sale del mismo remitente de mercadeo (CONTACTOS_FROM_EMAIL, o MKT_FROM_EMAIL
// si no hay uno propio) para no tocar la reputación del dominio principal.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const SITE_URL = "https://www.victorcfo.com";

export const PASOS_TOTAL = 3;
// Días mínimos desde el permiso (paso 1) / desde el correo anterior (pasos 2 y 3).
export const ESPERA_DIAS = { 1: 0, 2: 3, 3: 5 } as const;

function firmar(id: string): string {
  return createHmac("sha256", process.env.CRON_SECRET || "").update(`cc:${id}`).digest("hex").slice(0, 32);
}
export function urlBajaContacto(id: string): string {
  return `${SITE_URL}/api/email/baja-contacto?c=${encodeURIComponent(id)}&t=${firmar(id)}`;
}
export function tokenBajaContactoValido(id: string, token: string): boolean {
  if (!process.env.CRON_SECRET) return false;
  const a = Buffer.from(firmar(id));
  const b = Buffer.from(token || "");
  return a.length === b.length && timingSafeEqual(a, b);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Tipo = "contable" | "negocio";

export function armarCorreo(
  paso: 1 | 2 | 3,
  tipo: Tipo,
  v: { nombre?: string | null; vendedor?: string | null; codigo?: string | null }
): { asunto: string; lineas: string[]; boton: { texto: string; url: string } } {
  const nombre = (v.nombre || "").trim().split(/\s+/)[0];
  const hola = nombre ? `Hola ${nombre},` : "Hola,";
  const vend = (v.vendedor || "").trim();
  const quien = vend ? `${vend}, de nuestro equipo,` : "una persona de nuestro equipo";
  const registro = `${SITE_URL}/registro${v.codigo ? `?socio=${encodeURIComponent(v.codigo)}` : ""}`;

  if (tipo === "contable") {
    if (paso === 1)
      return {
        asunto: "Gracias por la visita — VICTOR CFO para su oficina",
        lineas: [
          hola,
          `Gracias por recibir a ${quien} y por permitirnos escribirle.`,
          "VICTOR CFO es una app hecha en Puerto Rico para que sus clientes lleven sus números al día (facturas, gastos, retenciones, nómina) y usted los vea todos desde un portal del contable, sin perseguir recibos ni pedir estados por WhatsApp.",
          "Para el contable el portal no tiene costo. Puede crear su acceso en un minuto y ver cómo se ve.",
        ],
        boton: { texto: "Crear mi acceso de contable", url: registro },
      };
    if (paso === 2)
      return {
        asunto: "Lo que cambia en su oficina cuando el cliente lleva sus números en VICTOR",
        lineas: [
          hola,
          "Un adelanto de lo que verá en el portal: facturas y gastos del cliente categorizados, las retenciones del 480.6SP calculadas mes a mes, alertas cuando falta un Certificado de Relevo y reportes listos para descargar en Excel o PDF.",
          "La idea es que usted reciba la información ordenada y dedique el tiempo a asesorar, no a digitar.",
          "Si quiere verlo en una demostración corta, responda este correo y coordinamos.",
        ],
        boton: { texto: "Ver VICTOR CFO", url: SITE_URL },
      };
    return {
      asunto: "Último mensaje: ¿le hacemos una demostración?",
      lineas: [
        hola,
        "Este es el último correo de esta serie. Si le interesa que le mostremos el portal del contable con datos de ejemplo (unos 15 minutos), solo responda este mensaje.",
        "Si no es el momento, no hay problema: no le escribiremos más sobre esto.",
      ],
      boton: { texto: "Crear mi acceso de contable", url: registro },
    };
  }

  // negocio
  if (paso === 1)
    return {
      asunto: "Gracias por la visita — VICTOR CFO",
      lineas: [
        hola,
        `Gracias por atender a ${quien} y por permitirnos escribirle.`,
        "VICTOR CFO es una app hecha en Puerto Rico para llevar las cuentas de su negocio sin complicarse: facturas y cotizaciones, cobro con tarjeta o ATH Móvil, gastos categorizados y un asistente al que le puede preguntar cómo va el mes.",
        "Puede empezar gratis, en un minuto, con su correo o con Google.",
      ],
      boton: { texto: "Empezar gratis", url: registro },
    };
  if (paso === 2)
    return {
      asunto: "Cobrar más rápido y saber cuánto le queda de verdad",
      lineas: [
        hola,
        "Lo que más nos dicen los dueños de negocio: «al final del mes no sé cuánto gané de verdad». VICTOR lo responde con sus propios números: cuánto facturó, cuánto cobró, cuánto gastó y cuánto es suyo.",
        "Además, desde el celular puede mandar la factura por WhatsApp o correo y recibir el pago con tarjeta o ATH Móvil.",
      ],
      boton: { texto: "Probar VICTOR gratis", url: registro },
    };
  return {
    asunto: "Último mensaje de nuestra parte",
    lineas: [
      hola,
      "Este es el último correo de esta serie. Si quiere probar VICTOR CFO, su cuenta gratis está lista cuando usted la necesite.",
      "Si no es el momento, no hay problema: no le escribiremos más sobre esto.",
    ],
    boton: { texto: "Crear mi cuenta gratis", url: registro },
  };
}

export async function enviarCorreoContacto(p: {
  to: string;
  contactoId: string;
  asunto: string;
  lineas: string[];
  boton: { texto: string; url: string };
  direccionFisica: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY no está configurada." };
  const from = process.env.CONTACTOS_FROM_EMAIL || process.env.MKT_FROM_EMAIL;
  if (!from) return { sent: false, reason: "Falta CONTACTOS_FROM_EMAIL (o MKT_FROM_EMAIL)." };
  if (!p.direccionFisica.trim()) return { sent: false, reason: "Falta la dirección física (obligatoria por ley en correos comerciales)." };

  const baja = urlBajaContacto(p.contactoId);
  const motivo =
    "Recibes este mensaje porque nos diste tu correo y tu permiso durante una visita de un representante de VICTOR CFO. " +
    "Es un mensaje comercial de VICTOR CFO, un producto de West Capital Ventures LLC.";
  const texto = [...p.lineas, `${p.boton.texto}: ${p.boton.url}`].join("\n\n");

  const html = `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;max-width:520px;color:#1a1a1a;line-height:1.55;font-size:15px">
  ${p.lineas.map((l) => `<p style="margin:0 0 12px">${esc(l)}</p>`).join("")}
  <p style="margin:18px 0"><a href="${esc(p.boton.url)}" style="background:#0b6b4f;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;display:inline-block;font-weight:600">${esc(p.boton.texto)}</a></p>
  <hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0 12px" />
  <p style="font-size:11px;color:#888;margin:0">${esc(motivo)}<br/>${esc(p.direccionFisica.trim())}<br/><a href="${baja}" style="color:#888">No quiero recibir más correos</a></p>
</div>`.trim();

  try {
    const { error } = await resend.emails.send({
      from,
      to: p.to,
      replyTo: process.env.MKT_REPLY_TO || undefined,
      subject: p.asunto,
      text: `${texto}\n\n--\n${motivo}\n${p.direccionFisica.trim()}\nNo quiero recibir más correos: ${baja}`,
      html,
      headers: {
        "List-Unsubscribe": `<${baja}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Error enviando." };
  }
}

// Registrar/actualizar el permiso desde las APIs del portal del vendedor.
// - permiso=true: crea la fila (o la reactiva SOLO si nunca hubo baja del propio
//   contacto: una baja por enlace es definitiva y el vendedor no puede revertirla).
// - permiso=false: el vendedor retira el permiso => se marca baja_at.
export async function registrarPermisoCorreo(
  admin: { from: (t: string) => any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  p: {
    permiso: boolean;
    email: string | null | undefined;
    nombre: string | null | undefined;
    tipo: Tipo;
    socioId: string;
    origen: "oficina" | "prospecto";
    refId: string | null;
  }
): Promise<void> {
  const email = (p.email || "").trim().toLowerCase();
  if (!email) return;
  const { data: ex } = await admin.from("socios_contactos_correo").select("id, baja_at, detenido_razon").eq("email", email).maybeSingle();

  if (!p.permiso) {
    if (ex && !ex.baja_at) {
      await admin.from("socios_contactos_correo").update({ baja_at: new Date().toISOString(), detenido_razon: ex.detenido_razon ?? "permiso_retirado" }).eq("id", ex.id);
    }
    return;
  }
  if (ex) {
    // Solo se reactiva si fue el propio vendedor quien retiró el permiso por
    // error. Una baja pedida por el contacto (enlace) o por reglas (ya es
    // usuario, etc.) nunca se revierte desde el portal.
    if (ex.baja_at && ex.detenido_razon === "permiso_retirado") {
      await admin.from("socios_contactos_correo").update({ baja_at: null, detenido_razon: null, permiso_at: new Date().toISOString() }).eq("id", ex.id);
    }
    return;
  }
  await admin.from("socios_contactos_correo").insert({
    email,
    nombre: (p.nombre || "").trim() || null,
    tipo: p.tipo,
    socio_id: p.socioId,
    origen: p.origen,
    ref_id: p.refId,
  });
}
