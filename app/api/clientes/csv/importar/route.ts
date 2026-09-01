import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseCsv } from "@/lib/csv";

// Importar clientes desde un CSV (ej. exportado de FreshBooks) — mismo
// patrón de 2 pasos que ya existe para estados de cuenta bancarios: el
// preview (/api/cuentas-manuales/csv/preview, reusado tal cual, es
// genérico) le enseña las columnas al usuario/frontend, y aquí, con el
// mapeo ya confirmado, se procesa el archivo completo.
//
// A diferencia de las transacciones, la dirección casi nunca viene en una
// sola columna (FreshBooks la separa en Street/Street 2/City/Province/
// Postal Code/Country) — por eso columnasDireccion es una LISTA de índices
// que se concatenan con ", " en vez de un solo índice.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const csv: string | undefined = body?.csv;
  const columnaNombre: number | undefined = body?.columnaNombre;
  const columnaEmail: number | null = body?.columnaEmail ?? null;
  const columnaTelefono: number | null = body?.columnaTelefono ?? null;
  const columnaTaxId: number | null = body?.columnaTaxId ?? null;
  const columnasDireccion: number[] = Array.isArray(body?.columnasDireccion) ? body.columnasDireccion : [];

  if (!entityId || !csv) {
    return NextResponse.json({ error: "Falta la entidad o el archivo." }, { status: 400 });
  }
  if (columnaNombre === undefined) {
    return NextResponse.json({ error: "Falta indicar cuál columna es el nombre del cliente." }, { status: 400 });
  }

  // La entidad tiene que ser del usuario que llama — mismo guardarraíl que
  // ya se usa en /api/transacciones/exportar para entityId.
  const { data: entidad } = await supabase
    .from("business_entities")
    .select("id")
    .eq("id", entityId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!entidad) return NextResponse.json({ error: "No se encontró esa entidad." }, { status: 404 });

  const filas = parseCsv(csv);
  const filasDatos = filas.slice(1); // fila 0 = encabezados, ya confirmados en el preview

  // Dedup: contra los clientes que ya existen en esta entidad — por email
  // si el CSV trae uno (más confiable), si no por nombre exacto. Así se
  // puede volver a subir el mismo export sin duplicar todo.
  const { data: existentes } = await supabase.from("clients").select("name, email").eq("entity_id", entityId);
  const emailsExistentes = new Set((existentes ?? []).map((c) => (c.email || "").trim().toLowerCase()).filter(Boolean));
  const nombresExistentes = new Set((existentes ?? []).map((c) => c.name.trim().toLowerCase()));

  let errores = 0;
  let duplicados = 0;
  const vistosEnLote = new Set<string>();
  const filasParaInsertar: {
    owner_id: string;
    entity_id: string;
    name: string;
    email: string | null;
    telefono: string | null;
    tax_id: string | null;
    address: string | null;
    es_negocio: boolean;
    retention_pct: number;
  }[] = [];

  for (const fila of filasDatos) {
    const nombre = (fila[columnaNombre] ?? "").trim();
    if (!nombre) {
      errores++;
      continue;
    }

    const email = columnaEmail !== null ? (fila[columnaEmail] ?? "").trim() : "";
    const emailLower = email.toLowerCase();
    const nombreLower = nombre.toLowerCase();

    const claveDedup = emailLower || nombreLower;
    const yaExiste = (emailLower && emailsExistentes.has(emailLower)) || (!emailLower && nombresExistentes.has(nombreLower));
    if (yaExiste || vistosEnLote.has(claveDedup)) {
      duplicados++;
      continue;
    }
    vistosEnLote.add(claveDedup);

    const telefono = columnaTelefono !== null ? (fila[columnaTelefono] ?? "").trim() : "";
    const taxId = columnaTaxId !== null ? (fila[columnaTaxId] ?? "").trim() : "";
    const direccion = columnasDireccion
      .map((i) => (fila[i] ?? "").trim())
      .filter(Boolean)
      .join(", ");

    filasParaInsertar.push({
      owner_id: user.id,
      entity_id: entityId,
      name: nombre,
      email: email || null,
      telefono: telefono || null,
      tax_id: taxId || null,
      address: direccion || null,
      // FreshBooks no trae retención de Hacienda PR — se importa como
      // individual (0%) y el usuario activa el toggle "¿Es un negocio?"
      // a mano en los que sí apliquen, igual que si lo creara manual.
      es_negocio: false,
      retention_pct: 0,
    });
  }

  if (filasParaInsertar.length === 0) {
    return NextResponse.json({ importados: 0, duplicados, errores });
  }

  const { data: insertados, error } = await supabase.from("clients").insert(filasParaInsertar).select("id");

  if (error) return NextResponse.json({ error: `No se pudo importar: ${error.message}` }, { status: 500 });

  return NextResponse.json({
    importados: insertados?.length ?? 0,
    duplicados,
    errores,
  });
}
