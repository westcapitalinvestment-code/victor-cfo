import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Sensitive } from "@/lib/privacy";
import { formatMoney, formatFecha } from "@/lib/format";
import DesmarcarBoton from "./desmarcar-boton";

// Revisión de "posibles duplicados" — el detector automático
// (lib/duplicados.ts, corre después de cada sincronización de Plaid)
// marca es_duplicada=true cuando una transacción recién llegada del banco
// coincide en monto/fecha/dirección con una que el usuario ya había
// metido a mano (típicamente: subió CSV en el plan Gratis y luego
// conectó el banco de verdad al pasar a Core). Estas filas quedan fuera
// de Gastos/Resumen/Inicio/CSV del contador, pero NUNCA se borran — esta
// pantalla existe justo para que el usuario pueda revisar y corregir si
// el detector se equivocó.
export default async function DuplicadosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: duplicadas } = await supabase
    .from("transactions")
    .select("id, description_raw, amount, fecha, tipo_flujo, duplicado_de_id")
    .eq("owner_id", user.id)
    .is("entity_id", null)
    .eq("es_duplicada", true)
    .order("fecha", { ascending: false })
    .limit(200);

  const idsOriginales = Array.from(new Set((duplicadas ?? []).map((d) => d.duplicado_de_id).filter((id): id is string => !!id)));
  const { data: originales } =
    idsOriginales.length > 0
      ? await supabase.from("transactions").select("id, description_raw, fecha").in("id", idsOriginales)
      : { data: [] as { id: string; description_raw: string | null; fecha: string }[] };
  const originalPorId = new Map((originales ?? []).map((o) => [o.id, o]));

  return (
    <div className="vc-shell">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/dashboard/gastos" className="text-xs text-muted hover:text-teal">
          ← Gastos
        </Link>
      </div>
      <h1 className="mb-1 text-lg font-medium">Posibles duplicados</h1>
      <p className="mb-4 text-xs text-muted">
        Transacciones que llegaron del banco y coinciden con una que ya habías metido a mano — se excluyen de tus totales para no
        duplicar el balance. Si alguna no es duplicado de verdad, desmárcala y vuelve a contar normal.
      </p>

      {(!duplicadas || duplicadas.length === 0) && (
        <div className="vc-card text-sm text-muted">No hay ninguna transacción marcada como duplicada en este momento.</div>
      )}

      {duplicadas && duplicadas.length > 0 && (
        <div className="flex flex-col gap-2">
          {duplicadas.map((t) => {
            const original = t.duplicado_de_id ? originalPorId.get(t.duplicado_de_id) : null;
            const esGasto = t.tipo_flujo === "gasto";
            return (
              <div key={t.id} className="vc-card flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.description_raw || "Sin descripción"}</p>
                  <p className="text-xs text-muted">
                    {formatFecha(t.fecha)} · del banco
                    {original && (
                      <>
                        {" "}
                        — ya la tenías como &quot;{original.description_raw || "sin descripción"}&quot; ({formatFecha(original.fecha)})
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <Sensitive>
                    <span className={`text-sm font-medium ${esGasto ? "text-red" : "text-teal"}`}>
                      {esGasto ? "-" : "+"}
                      {formatMoney(Math.abs(Number(t.amount)))}
                    </span>
                  </Sensitive>
                  <DesmarcarBoton transactionId={t.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
