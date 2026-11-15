import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaHoyPR } from "@/lib/hora-pr";
import { evaluarIncentivos, type Evaluacion, type Incentivo, type PerfilIncentivos } from "@/lib/incentivos";

// Lado servidor de los incentivos (15 nov 2026): arma el perfil del negocio
// con datos reales de VICTOR (entidad, transacciones de 12 meses, Nómina,
// edad del dueño) y lo evalúa contra el catálogo incentivos_pr. Nunca lanza:
// si falta la migración o algo falla, devuelve null y no se muestra nada.

export type ResultadoIncentivos = {
  entidad: { id: string; nombre: string };
  perfil: PerfilIncentivos;
  evaluaciones: Evaluacion[];
  descartados: string[];
};

export async function evaluarIncentivosEntidad(
  supabase: SupabaseClient,
  ownerId: string,
  entityId: string
): Promise<ResultadoIncentivos | null> {
  try {
    const { data: ent, error: eEnt } = await supabase
      .from("business_entities")
      .select("id, name, industria, fecha_inicio_operaciones, clientes_fuera_pr, tax_regime")
      .eq("id", entityId)
      .eq("owner_id", ownerId)
      .maybeSingle();
    if (eEnt || !ent) return null;

    const hoy = fechaHoyPR();
    const hace12m = new Date(`${hoy}T12:00:00`);
    hace12m.setFullYear(hace12m.getFullYear() - 1);
    const desde = hace12m.toISOString().slice(0, 10);

    const [{ data: catalogo }, { data: prof }, { data: ajustes }, { count: empleados }, { data: unaVenta }, { data: desc }] = await Promise.all([
      supabase.from("incentivos_pr").select("*").eq("activo", true).order("orden"),
      supabase.from("user_profiles").select("edad").eq("id", ownerId).maybeSingle(),
      supabase.from("tax_estimate_settings").select("residencia").eq("owner_id", ownerId).is("entity_id", null).maybeSingle(),
      supabase.from("payroll_employees").select("id", { count: "exact", head: true }).eq("entity_id", entityId).eq("activo", true),
      supabase.from("transactions").select("id").eq("entity_id", entityId).eq("tipo_flujo", "ingreso").eq("es_duplicada", false).limit(1),
      supabase.from("incentivos_descartados").select("incentivo_id").eq("entity_id", entityId),
    ]);
    if (!catalogo) return null;

    // Ingresos y gastos de 12 meses (paginado: Supabase corta en 1000 filas).
    let ventas = 0;
    let gastos = 0;
    for (let i = 0; i < 30; i++) {
      const { data, error } = await supabase
        .from("transactions")
        .select("amount, tipo_flujo")
        .eq("entity_id", entityId)
        .eq("es_duplicada", false)
        .gte("fecha", desde)
        .lte("fecha", hoy)
        .in("tipo_flujo", ["ingreso", "gasto"])
        .order("fecha")
        .range(i * 1000, i * 1000 + 999);
      if (error || !data) break;
      for (const t of data as { amount: number | string; tipo_flujo: string }[]) {
        const v = Math.abs(Number(t.amount) || 0);
        if (t.tipo_flujo === "ingreso") ventas += v;
        else gastos += v;
      }
      if (data.length < 1000) break;
    }

    const regimen = String(ent.tax_regime ?? "ordinaria");
    const perfil: PerfilIncentivos = {
      industria: (ent.industria as string | null) ?? null,
      fechaInicio: (ent.fecha_inicio_operaciones as string | null) ?? null,
      clientesFueraPR: (ent.clientes_fuera_pr as boolean | null) ?? null,
      tieneVentas: (unaVenta ?? []).length > 0,
      ventas12m: Math.round(ventas * 100) / 100,
      ganancia12m: Math.round((ventas - gastos) * 100) / 100,
      empleados: empleados ?? 0,
      edadDueno: typeof prof?.edad === "number" ? prof.edad : null,
      residentePR: (ajustes?.residencia ?? "pr") !== "us",
      tieneDecreto: regimen !== "ordinaria" && regimen !== "",
    };

    return {
      entidad: { id: ent.id as string, nombre: ent.name as string },
      perfil,
      evaluaciones: evaluarIncentivos(catalogo as unknown as Incentivo[], perfil),
      descartados: (desc ?? []).map((d) => d.incentivo_id as string),
    };
  } catch (err) {
    console.error("evaluarIncentivosEntidad falló:", err);
    return null;
  }
}
