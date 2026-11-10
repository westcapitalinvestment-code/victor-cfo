import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoyPR } from "@/lib/hora-pr";
import { proximaFechaPago } from "@/lib/dias-laborables";

// Pagos de la quincena a socios/vendedores (10 nov 2026). Joel paga por
// Mercury con ACH (gratis): VICTOR arma un "bill" en PDF por socio con lo
// pendiente (bruto, retención 1062.03 y neto) y los datos de banco, Joel lo
// sube a Mercury → "Upload a bill", Mercury lo lee y pre-llena el pago, Joel
// aprueba. Después marca pagadas EXACTAMENTE las comisiones de ese PDF.

const TIPO_LABEL: Record<string, string> = {
  unica: "Comisión de venta",
  setenta: "Comisión de venta (70%)",
  treinta: "Comisión de venta (30%)",
  upgrade_unica: "Comisión por cambio de plan",
  upgrade_setenta: "Comisión por cambio de plan (70%)",
  upgrade_treinta: "Comisión por cambio de plan (30%)",
  regalia: "Regalía mensual",
};
export const etiquetaComision = (t: string | null) => (t && TIPO_LABEL[t]) || "Comisión";

export type ItemPago = {
  id: string;
  tipo: string | null;
  plan: string | null;
  creada: string | null;
  brutoCentavos: number;
  retencionCentavos: number;
  netoCentavos: number;
};

export type PagoSocio = {
  socioId: string;
  nombre: string;
  email: string;
  tipo: string;
  direccion: string | null;
  datosPagoCompletados: boolean;
  bankName: string | null;
  accountLast4: string | null;
  fechaPago: string; // yyyy-mm-dd
  items: ItemPago[];
  brutoCentavos: number;
  retencionCentavos: number;
  netoCentavos: number;
};

type Admin = ReturnType<typeof createAdminClient>;

export async function pagosPendientes(admin: Admin, soloSocioId?: string): Promise<PagoSocio[]> {
  let q = admin
    .from("socios_comisiones")
    .select("id, socio_id, tipo_comision, plan, comision_centavos, created_at")
    .eq("estado", "pendiente")
    .order("created_at", { ascending: true });
  if (soloSocioId) q = q.eq("socio_id", soloSocioId);
  const { data: comisiones, error } = await q;
  if (error) throw error;
  if (!comisiones?.length) return [];

  const socioIds = Array.from(new Set(comisiones.map((c) => c.socio_id as string)));
  const ids = comisiones.map((c) => c.id as string);
  const [{ data: socios }, { data: retenciones }] = await Promise.all([
    admin
      .from("socios")
      .select("id, nombre, email, tipo, estado, direccion, bank_name, account_last4, account_number_encrypted, proxima_fecha_pago")
      .in("id", socioIds),
    admin.from("socios_vendedor_retenciones").select("comision_id, retention_centavos").in("comision_id", ids),
  ]);
  const retPorComision = new Map((retenciones ?? []).map((r) => [r.comision_id as string, Number(r.retention_centavos)]));
  const hoy = fechaHoyPR();

  const salida: PagoSocio[] = [];
  for (const s of socios ?? []) {
    if (s.estado === "suspendido") continue;
    const items: ItemPago[] = comisiones
      .filter((c) => c.socio_id === s.id)
      .map((c) => {
        const bruto = Number(c.comision_centavos);
        const ret = retPorComision.get(c.id as string) ?? 0;
        return {
          id: c.id as string,
          tipo: (c.tipo_comision as string | null) ?? null,
          plan: (c.plan as string | null) ?? null,
          creada: (c.created_at as string | null) ?? null,
          brutoCentavos: bruto,
          retencionCentavos: ret,
          netoCentavos: bruto - ret,
        };
      });
    const manual = (s.proxima_fecha_pago as string | null) ?? null;
    const bruto = items.reduce((a, i) => a + i.brutoCentavos, 0);
    const ret = items.reduce((a, i) => a + i.retencionCentavos, 0);
    if (bruto - ret <= 0) continue;
    salida.push({
      socioId: s.id as string,
      nombre: s.nombre as string,
      email: s.email as string,
      tipo: s.tipo as string,
      direccion: (s.direccion as string | null) ?? null,
      datosPagoCompletados: !!s.account_number_encrypted,
      bankName: (s.bank_name as string | null) ?? null,
      accountLast4: (s.account_last4 as string | null) ?? null,
      fechaPago: manual && manual >= hoy ? manual : proximaFechaPago(hoy),
      items,
      brutoCentavos: bruto,
      retencionCentavos: ret,
      netoCentavos: bruto - ret,
    });
  }
  return salida.sort((a, b) => b.netoCentavos - a.netoCentavos);
}

const usd = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mdY = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
};

export const numeroFactura = (p: PagoSocio) => `VCFO-${p.fechaPago.replace(/-/g, "")}-${p.socioId.slice(0, 6).toUpperCase()}`;

// PDF tipo "bill" en inglés (Mercury lo lee mejor así): emisor = el socio
// (quien cobra), cliente = West Capital Ventures, total neto, fecha de
// vencimiento y los datos ACH para que Mercury cree/llene el destinatario.
export async function pdfPagoSocio(p: PagoSocio, banco: { bankName: string | null; routing: string | null; account: string | null }) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const gris = rgb(0.4, 0.42, 0.45);
  let y = 740;
  const txt = (t: string, x: number, size = 10, font = f, color = rgb(0.1, 0.12, 0.14)) =>
    page.drawText(t.replace(/[^\x20-\x7E -ÿ]/g, ""), { x, y, size, font, color });

  txt("INVOICE", 50, 22, b);
  txt(`Invoice #: ${numeroFactura(p)}`, 360, 10, b);
  y -= 16;
  txt(`Invoice date: ${mdY(fechaHoyPR())}`, 360);
  y -= 14;
  txt(`Due date: ${mdY(p.fechaPago)}`, 360, 10, b);

  y = 690;
  txt("FROM (payee)", 50, 8, b, gris);
  txt("BILL TO", 330, 8, b, gris);
  y -= 14;
  txt(p.nombre, 50, 11, b);
  txt("West Capital Ventures LLC", 330, 11, b);
  y -= 13;
  txt(p.email, 50);
  txt("VICTOR CFO", 330);
  if (p.direccion) {
    for (const linea of p.direccion.split(/\n|,\s*/).slice(0, 3)) {
      y -= 13;
      txt(linea, 50);
    }
  }

  y -= 34;
  page.drawRectangle({ x: 50, y: y - 4, width: 512, height: 18, color: rgb(0.93, 0.95, 0.94) });
  txt("Description", 56, 9, b);
  txt("Date", 330, 9, b);
  txt("Amount", 500, 9, b);
  for (const i of p.items.slice(0, 28)) {
    y -= 18;
    txt(`${etiquetaComision(i.tipo)}${i.plan ? ` - plan ${i.plan}` : ""}`, 56, 9);
    txt(i.creada ? mdY(i.creada) : "", 330, 9);
    txt(usd(i.brutoCentavos), 500, 9);
  }
  if (p.items.length > 28) {
    y -= 18;
    txt(`+ ${p.items.length - 28} more items`, 56, 9, f, gris);
  }

  y -= 28;
  txt("Subtotal", 380, 10);
  txt(usd(p.brutoCentavos), 500, 10);
  if (p.retencionCentavos > 0) {
    y -= 15;
    txt("PR tax withholding (Sec. 1062.03)", 300, 10);
    txt(`-${usd(p.retencionCentavos)}`, 500, 10);
  }
  y -= 20;
  page.drawLine({ start: { x: 300, y: y + 14 }, end: { x: 562, y: y + 14 }, thickness: 0.8, color: gris });
  txt("TOTAL DUE", 380, 12, b);
  txt(usd(p.netoCentavos), 500, 12, b);

  y -= 46;
  txt("PAYMENT INSTRUCTIONS (ACH)", 50, 8, b, gris);
  y -= 15;
  txt(`Account holder: ${p.nombre}`, 50);
  y -= 13;
  txt(`Bank: ${banco.bankName ?? "-"}`, 50);
  y -= 13;
  txt(`Routing number: ${banco.routing ?? "-"}`, 50);
  y -= 13;
  txt(`Account number: ${banco.account ?? "-"}`, 50);

  y = 60;
  txt("Commissions and royalties for VICTOR CFO sales. Independent contractor - not payroll.", 50, 8, f, gris);
  return doc.save();
}
