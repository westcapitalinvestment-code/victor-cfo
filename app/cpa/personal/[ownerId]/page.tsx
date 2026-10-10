import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { formatMoney, formatFecha } from "@/lib/format";
import { fechaHoyPR } from "@/lib/hora-pr";
import { obtenerEstimadoImpuestos } from "@/lib/impuestos-estimados-server";
import CalendarioEstimadas from "@/app/dashboard/calendario-estimadas";
import CpaAccountMenu from "../../cpa-account-menu";

// Portal CPA — sección PERSONAL de un cliente (10 oct 2026, pedido de Joel:
// "dividir personal de entidades, cada una con sus tabs y reportes").
// Solo lectura. El acceso lo decide el cliente con "Compartir mis finanzas
// personales" (account_members.share_personal, migración 0146) y lo hace
// cumplir la RLS: sin el permiso, transactions/documents/goals/tax settings
// personales vuelven vacíos para el contable. Aquí además se comprueba la
// fila de account_members para mandar a notFound() en vez de mostrar una
// pantalla vacía engañosa.
type Tab = "resumen" | "categorias" | "impuestos" | "boveda" | "reportes";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "resumen", label: "Resumen", icon: "ti-chart-bar" },
  { id: "categorias", label: "Por categoría", icon: "ti-category" },
  { id: "impuestos", label: "Impuestos", icon: "ti-receipt-tax" },
  { id: "boveda", label: "Bóveda", icon: "ti-folder" },
  { id: "reportes", label: "Reportes", icon: "ti-download" },
];

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type FilaTx = {
  id: string;
  fecha: string;
  description_raw: string;
  amount: number | string;
  tipo_flujo: string | null;
  hacienda_category_id: number | null;
};

export default async function CpaPersonalPage({
  params,
  searchParams,
}: {
  params: { ownerId: string };
  searchParams: { tab?: string; anio?: string; cat?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ownerId = params.ownerId;

  const { data: acceso } = await supabase
    .from("account_members")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("member_email", user.email ?? "")
    .eq("role", "cpa")
    .eq("active", true)
    .eq("share_personal", true)
    .limit(1)
    .maybeSingle();
  if (!acceso) notFound();

  const { data: dueno } = await supabase.from("users").select("full_name, email").eq("id", ownerId).maybeSingle();
  const nombreDueno = dueno?.full_name || dueno?.email || "Cliente";

  const hoy = new Date();
  const hoyStr = fechaHoyPR(hoy);
  const anioActual = Number(hoyStr.slice(0, 4));
  const anio = Number(searchParams?.anio) || anioActual;
  const tab: Tab = (TABS.find((t) => t.id === searchParams?.tab)?.id ?? "resumen") as Tab;

  const base = `/cpa/personal/${ownerId}`;
  const href = (t: Tab, extra = "") => `${base}?tab=${t}&anio=${anio}${extra}`;

  // Transacciones personales del año (paginadas: Supabase corta en 1000).
  const txs: FilaTx[] = [];
  if (tab === "resumen" || tab === "categorias") {
    const PAGINA = 1000;
    for (let i = 0; i < 20; i++) {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, fecha, description_raw, amount, tipo_flujo, hacienda_category_id")
        .eq("owner_id", ownerId)
        .is("entity_id", null)
        .eq("es_duplicada", false)
        .gte("fecha", `${anio}-01-01`)
        .lte("fecha", `${anio}-12-31`)
        .order("fecha", { ascending: false })
        .range(i * PAGINA, i * PAGINA + PAGINA - 1);
      if (error || !data) break;
      txs.push(...(data as FilaTx[]));
      if (data.length < PAGINA) break;
    }
  }

  const { data: categoriasRaw } =
    tab === "categorias"
      ? await supabase.from("hacienda_categories").select("id, nombre")
      : { data: [] as { id: number; nombre: string }[] };
  const nombreCategoria = new Map((categoriasRaw ?? []).map((c) => [c.id, c.nombre]));

  // ---- Resumen por mes
  const porMes = Array.from({ length: 12 }, () => ({ ingresos: 0, gastos: 0 }));
  let totalIngresos = 0;
  let totalGastos = 0;
  for (const t of txs) {
    const m = Number(t.fecha.slice(5, 7)) - 1;
    const v = Math.abs(Number(t.amount));
    if (t.tipo_flujo === "ingreso") {
      porMes[m].ingresos += v;
      totalIngresos += v;
    } else if (t.tipo_flujo === "gasto") {
      porMes[m].gastos += v;
      totalGastos += v;
    }
  }

  // ---- Por categoría
  type FilaCat = { id: number | null; nombre: string; ingresos: number; gastos: number; n: number };
  const catMap = new Map<string, FilaCat>();
  for (const t of txs) {
    if (t.tipo_flujo !== "ingreso" && t.tipo_flujo !== "gasto") continue;
    const key = String(t.hacienda_category_id ?? "none");
    const fila =
      catMap.get(key) ??
      ({
        id: t.hacienda_category_id,
        nombre: t.hacienda_category_id ? (nombreCategoria.get(t.hacienda_category_id) ?? "Categoría") : "Sin categorizar",
        ingresos: 0,
        gastos: 0,
        n: 0,
      } as FilaCat);
    const v = Math.abs(Number(t.amount));
    if (t.tipo_flujo === "ingreso") fila.ingresos += v;
    else fila.gastos += v;
    fila.n += 1;
    catMap.set(key, fila);
  }
  const categorias = Array.from(catMap.entries())
    .map(([key, f]) => ({ key, ...f }))
    .sort((a, b) => b.gastos + b.ingresos - (a.gastos + a.ingresos));
  const catSel = searchParams?.cat ?? null;
  const txsCat = catSel ? txs.filter((t) => String(t.hacienda_category_id ?? "none") === catSel).slice(0, 300) : [];

  // ---- Impuestos
  const estimado = tab === "impuestos" ? await obtenerEstimadoImpuestos(supabase, ownerId, null, hoyStr) : null;

  // ---- Bóveda (documentos personales)
  type Doc = { id: string; nombre: string; tipo: string | null; fecha_vencimiento: string | null; estado: string | null };
  let docs: Doc[] = [];
  const archivosPorDoc = new Map<string, { id: string; etiqueta: string | null }[]>();
  if (tab === "boveda") {
    const { data } = await supabase
      .from("documents")
      .select("id, nombre, tipo, fecha_vencimiento, estado")
      .eq("owner_id", ownerId)
      .is("entity_id", null)
      .order("nombre", { ascending: true });
    docs = (data ?? []) as Doc[];
    const ids = docs.map((d) => d.id);
    if (ids.length) {
      const { data: files } = await supabase
        .from("document_files")
        .select("id, document_id, etiqueta, orden")
        .in("document_id", ids)
        .order("orden", { ascending: true });
      for (const f of files ?? []) {
        const arr = archivosPorDoc.get(f.document_id) ?? [];
        arr.push({ id: f.id, etiqueta: f.etiqueta });
        archivosPorDoc.set(f.document_id, arr);
      }
    }
  }

  const aniosOpciones = [anioActual, anioActual - 1, anioActual - 2];

  return (
    <div className="vc-shell">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/cpa" className="text-sm text-muted hover:opacity-80">
            <i className="ti ti-arrow-left" /> Clientes
          </Link>
          <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">
            Personal
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
            <i className="ti ti-lock" /> Solo lectura
          </span>
          <CpaAccountMenu email={user.email ?? null} />
        </div>
      </div>

      <p className="text-lg font-medium">{nombreDueno}</p>
      <p className="mb-3 text-xs text-muted">
        Finanzas personales · compartidas por el cliente (puede quitar este acceso cuando quiera)
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border p-0.5">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-teal text-white" : "text-muted hover:text-text"
              }`}
            >
              <i className={`ti ${t.icon} mr-1`} style={{ fontSize: 12 }} />
              {t.label}
            </Link>
          ))}
        </div>
        {(tab === "resumen" || tab === "categorias") && (
          <div className="flex gap-1">
            {aniosOpciones.map((a) => (
              <Link
                key={a}
                href={`${base}?tab=${tab}&anio=${a}`}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${
                  a === anio ? "border-teal text-teal" : "border-border text-muted"
                }`}
              >
                {a}
              </Link>
            ))}
          </div>
        )}
      </div>

      {tab === "resumen" && (
        <div className="vc-card">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] uppercase text-muted">Ingresos {anio}</p>
              <p className="text-base font-medium text-grn">{formatMoney(totalIngresos)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted">Gastos {anio}</p>
              <p className="text-base font-medium text-red">{formatMoney(totalGastos)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase text-muted">Neto</p>
              <p className="text-base font-medium">{formatMoney(totalIngresos - totalGastos)}</p>
            </div>
          </div>
          <div className="divide-y divide-border text-sm">
            <div className="grid grid-cols-4 gap-2 py-1.5 text-[10px] uppercase tracking-wide text-muted">
              <span>Mes</span>
              <span className="text-right">Ingresos</span>
              <span className="text-right">Gastos</span>
              <span className="text-right">Neto</span>
            </div>
            {porMes.map((m, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 py-1.5">
                <span>{MESES[i]}</span>
                <span className="text-right">{formatMoney(m.ingresos)}</span>
                <span className="text-right">{formatMoney(m.gastos)}</span>
                <span className="text-right">{formatMoney(m.ingresos - m.gastos)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted">
            Excluye transferencias entre cuentas y transacciones marcadas como duplicadas.
          </p>
        </div>
      )}

      {tab === "categorias" && (
        <div className="vc-card">
          {categorias.length === 0 ? (
            <p className="text-xs text-muted">Sin transacciones personales en {anio}.</p>
          ) : (
            <div className="divide-y divide-border text-sm">
              <div className="grid grid-cols-4 gap-2 py-1.5 text-[10px] uppercase tracking-wide text-muted">
                <span>Categoría</span>
                <span className="text-right">Ingresos</span>
                <span className="text-right">Gastos</span>
                <span className="text-right">#</span>
              </div>
              {categorias.map((c) => (
                <Link
                  key={c.key}
                  href={href("categorias", c.key === catSel ? "" : `&cat=${c.key}`)}
                  className={`grid grid-cols-4 gap-2 py-1.5 hover:opacity-80 ${c.key === catSel ? "font-medium" : ""}`}
                >
                  <span className="truncate">{c.nombre}</span>
                  <span className="text-right">{c.ingresos ? formatMoney(c.ingresos) : "—"}</span>
                  <span className="text-right">{c.gastos ? formatMoney(c.gastos) : "—"}</span>
                  <span className="text-right text-muted">{c.n}</span>
                </Link>
              ))}
            </div>
          )}

          {catSel && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">
                Transacciones de la categoría {txsCat.length >= 300 ? "(primeras 300)" : ""}
              </p>
              <div className="divide-y divide-border text-sm">
                {txsCat.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="min-w-0">
                      <p className="truncate">{t.description_raw}</p>
                      <p className="text-[11px] text-muted">{formatFecha(t.fecha)}</p>
                    </div>
                    <span className={t.tipo_flujo === "ingreso" ? "text-grn" : ""}>
                      {formatMoney(Math.abs(Number(t.amount)))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "impuestos" && (
        <div className="vc-card">
          {!estimado ? (
            <p className="text-xs text-muted">No se pudo calcular el estimado de impuestos de este cliente.</p>
          ) : estimado.perfil.tipo === "empleado" ? (
            <p className="text-xs text-muted">
              Este cliente indicó que trabaja por sueldo (nómina): sus impuestos se retienen del cheque, así que no hay
              calendario de estimadas.
            </p>
          ) : (
            <>
              <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                Impuestos estimados {estimado.resultado.anio} · {estimado.perfil.residencia === "pr" ? "Puerto Rico" : "EE. UU."} ·{" "}
                {estimado.perfil.tipo === "corporacion" ? "corporación" : "cuenta propia"}
              </p>
              <div className="mb-3 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase text-muted">Ingreso proyectado</p>
                  <p className="text-sm font-medium">{formatMoney(estimado.resultado.ingresoBrutoProyectado)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted">Impuesto total</p>
                  <p className="text-sm font-medium">{formatMoney(estimado.resultado.totalImpuesto)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-muted">Pagado/retenido</p>
                  <p className="text-sm font-medium">{formatMoney(estimado.resultado.pagadoYTD)}</p>
                </div>
              </div>
              <CalendarioEstimadas resultado={estimado.resultado} ocultable={false} />
              <ul className="mt-3 list-disc pl-4 text-[11px] text-muted">
                {estimado.resultado.supuestos.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted">
                Estimado informativo calculado por VICTOR a partir de las transacciones del cliente; confirma fechas y
                montos con tu criterio profesional.
              </p>
            </>
          )}
        </div>
      )}

      {tab === "boveda" && (
        <div className="vc-card">
          {docs.length === 0 ? (
            <p className="text-xs text-muted">El cliente no tiene documentos personales en su Bóveda.</p>
          ) : (
            <div className="divide-y divide-border">
              {docs.map((d) => {
                const archivos = archivosPorDoc.get(d.id) ?? [];
                return (
                  <div key={d.id} className="py-3">
                    <p className="text-sm font-medium">{d.nombre}</p>
                    <p className="text-xs text-muted">
                      {d.tipo ?? "Documento"}
                      {d.fecha_vencimiento ? ` · vence ${formatFecha(d.fecha_vencimiento)}` : ""}
                    </p>
                    {archivos.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {archivos.map((a, i) => (
                          <a
                            key={a.id}
                            href={`/api/documentos/archivo/${a.id}/ver`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-full border border-teal px-2.5 py-1 text-[11px] font-medium text-teal"
                          >
                            <i className="ti ti-file mr-1" />
                            {a.etiqueta || `Archivo ${i + 1}`}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "reportes" && (
        <div className="vc-card">
          <p className="mb-3 text-xs text-muted">
            Reporte de ingresos y gastos personales de {nombreDueno}, con la categoría y la línea contable de cada
            transacción.
          </p>
          <div className="flex flex-wrap gap-2">
            {aniosOpciones.map((a) => (
              <div key={a} className="flex items-center gap-1 rounded-lg border border-border p-1.5">
                <span className="px-1 text-xs font-medium">{a}</span>
                <a
                  className="rounded-md bg-teal px-2.5 py-1 text-[11px] font-medium text-white"
                  href={`/api/transacciones/exportar/excel?ownerId=${ownerId}&desde=${a}-01-01&hasta=${a}-12-31`}
                >
                  Excel
                </a>
                <a
                  className="rounded-md border border-teal px-2.5 py-1 text-[11px] font-medium text-teal"
                  href={`/api/transacciones/exportar/pdf?ownerId=${ownerId}&desde=${a}-01-01&hasta=${a}-12-31`}
                >
                  PDF
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
