import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { generarArchivoNacha, PagoACH } from "@/lib/nacha";
import { slugificar } from "@/lib/format";

// Genera el archivo .ach (NACHA) de una o varias retenciones de Pagos ya
// registradas (30 sept 2026) — Joel sube este archivo al portal ACH de su
// banco en vez de digitar o copiar/pegar cada pago. Requiere que TANTO la
// entidad (cuenta originadora) como cada contratista incluido tengan su
// cuenta bancaria archivada (/api/entidades/[id]/banca y
// /api/pagos/vendors/[id]/banca) — si a algún contratista le falta, se
// excluye del archivo y se avisa por cuáles faltó en vez de fallar todo.
export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("ids") || "";
  const entityId = searchParams.get("entityId");
  const ids = idsParam.split(",").filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: "No se seleccionó ningún pago." }, { status: 400 });
  }
  if (!entityId) {
    return NextResponse.json({ error: "Falta indicar de qué entidad sale el pago." }, { status: 400 });
  }

  const { data: entidad, error: entidadError } = await supabase
    .from("business_entities")
    .select("id, name, ein, ach_bank_name, ach_routing_number, ach_account_number_enc, ach_account_type, ach_company_id")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (entidadError || !entidad) {
    return NextResponse.json({ error: "Entidad no encontrada." }, { status: 404 });
  }
  if (!entidad.ach_routing_number || !entidad.ach_account_number_enc) {
    return NextResponse.json(
      { error: "Esta entidad no tiene cuenta bancaria originadora configurada — ve a Editar negocio → Facturas → Cuenta ACH." },
      { status: 400 }
    );
  }

  const { data: retenciones, error: retError } = await supabase
    .from("vendor_retenciones")
    .select(
      "id, vendor_id, net_paid, entity_id, vendors(name, tax_id, bank_routing_number, bank_account_number_enc, bank_account_type)"
    )
    .in("id", ids)
    .eq("owner_id", user.id);
  if (retError) return NextResponse.json({ error: retError.message }, { status: 500 });

  const filas = (retenciones ?? []) as any[];
  const deOtraEntidad = filas.filter((r) => r.entity_id !== entityId);
  const deEstaEntidad = filas.filter((r) => r.entity_id === entityId);

  if (deEstaEntidad.length === 0) {
    return NextResponse.json({ error: "Ninguno de los pagos seleccionados pertenece a esta entidad." }, { status: 400 });
  }

  let cuentaOrigenPlano: string;
  try {
    cuentaOrigenPlano = decryptSecret(entidad.ach_account_number_enc);
  } catch (err) {
    console.error("No se pudo descifrar la cuenta originadora:", err);
    return NextResponse.json({ error: "No se pudo leer la cuenta bancaria de la entidad. Vuelve a guardarla." }, { status: 500 });
  }

  const pagos: PagoACH[] = [];
  const faltantes: string[] = [];
  for (const r of deEstaEntidad) {
    const v = r.vendors;
    if (!v) {
      faltantes.push("Contratista eliminado");
      continue;
    }
    if (!v.bank_routing_number || !v.bank_account_number_enc) {
      faltantes.push(v.name);
      continue;
    }
    let cuentaPlano: string;
    try {
      cuentaPlano = decryptSecret(v.bank_account_number_enc);
    } catch {
      faltantes.push(`${v.name} (cuenta ilegible — vuelve a guardarla)`);
      continue;
    }
    pagos.push({
      nombre: v.name,
      routingNumber: v.bank_routing_number,
      accountNumber: cuentaPlano,
      accountType: (v.bank_account_type === "savings" ? "savings" : "checking") as "checking" | "savings",
      montoCentavos: Math.round(Number(r.net_paid) * 100),
      taxId: v.tax_id,
    });
  }

  if (pagos.length === 0) {
    return NextResponse.json(
      {
        error: "Ninguno de los contratistas seleccionados tiene cuenta bancaria archivada.",
        faltantes,
      },
      { status: 400 }
    );
  }

  const resultado = generarArchivoNacha(
    {
      nombreEmpresa: entidad.name,
      routingNumber: entidad.ach_routing_number,
      companyId: entidad.ach_company_id || "",
      ein: entidad.ein || "",
    },
    pagos
  );

  const fechaHoy = new Date().toISOString().slice(0, 10);
  const nombreArchivo = `${slugificar(entidad.name)}-ach_${fechaHoy}.ach`;

  // Avisos (no bloquean la descarga) van en headers custom — la UI los lee
  // para mostrar "excluidos: Fulano (sin banca), pagos de otra entidad: 2".
  const avisos: string[] = [];
  if (faltantes.length > 0) avisos.push(`Sin cuenta bancaria, excluidos del archivo: ${faltantes.join(", ")}`);
  if (deOtraEntidad.length > 0) avisos.push(`${deOtraEntidad.length} pago(s) seleccionados pertenecen a otra entidad y se excluyeron.`);

  return new NextResponse(resultado.contenido, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nombreArchivo}"`,
      "X-Nacha-Total-Centavos": String(resultado.totalCentavos),
      "X-Nacha-Cantidad-Pagos": String(resultado.cantidadPagos),
      "X-Nacha-Avisos": encodeURIComponent(avisos.join(" · ")),
    },
  });
}
