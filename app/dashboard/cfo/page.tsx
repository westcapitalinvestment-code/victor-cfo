import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { esFounder } from "@/lib/founder";
import { saludoPorHora, fechaHoraLegiblePR, fechaHoyPR } from "@/lib/hora-pr";
import { PRECIOS } from "@/lib/costo-ia";
import { PLAN_LABEL } from "@/lib/plan-label";
import Colapsable from "./colapsable";
import UsuariosPanel from "./usuarios-panel";
import SociosPanel from "./socios-panel";

// Dashboard de Operaciones — vivía en /dashboard/admin, pero esa ruta la
// necesitaba el módulo real de Admin/Secretaria (2 sept 2026, pedido de
// Joel: "el módulo de Adm/asistente que me metiste en mi dashboard ahí
// pero en realidad es un módulo aparte"). Se mudó aquí, a su propio ícono
// "CFO" en el nav (ver bottom-nav.tsx, solo visible si esFounder(email)).
// Basado en el mockup estático que Joel ya había diseñado
// ("VICTOR — Dashboard de Operaciones.html"), pero conectado de verdad a
// Supabase en vez de números puestos a mano. Solo visible para el founder
// (ver lib/founder.ts) — contiene datos de TODOS los usuarios (nombre,
// plan, gasto de IA), así que nunca debe verlo un cliente normal, ni
// siquiera uno Pro/Pro+.
//
// Usa createAdminClient() (service_role) porque las tablas `users` y
// `uso_ia_mensual` tienen RLS que solo deja a cada quien ver SU propia
// fila — el founder necesita ver todas, y solo esta página lo permite.
//
// Lo que SÍ es dato real y en vivo: usuarios, planes, fechas, y el gasto
// de IA (uso_ia_mensual, costo real de Anthropic calculado en
// lib/costo-ia.ts). Lo que sigue siendo ESTIMADO (comentado abajo, fácil
// de ajustar): Plaid y las fees de Stripe por usuario (no se guardan en
// Supabase, se calculan con la misma fórmula usada para el margen en
// app/api/victor/route.ts), y los costos fijos de plataforma (Supabase,
// Vercel, Cloudflare R2, Make.com) que no son por-usuario.
export default async function CfoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!esFounder(user.email)) redirect("/dashboard");

  const admin = createAdminClient();

  // ---- Ventana de "este mes" en hora de Puerto Rico ----
  // PR no tiene horario de verano (siempre AST, UTC-4 todo el año), así
  // que este offset fijo es seguro sin librería de zonas horarias.
  const hoyPR = fechaHoyPR();
  const [anioPR, mesPR] = hoyPR.split("-");
  const inicioMesPR = new Date(`${anioPR}-${mesPR}-01T00:00:00-04:00`);

  const [
    { data: usuarios, error: errorUsuarios },
    { data: usoIa, error: errorUso },
    { data: logIa, error: errorLog },
    { data: creditosCompras },
    { data: socios },
    { data: comisionesSocios },
  ] = await Promise.all([
    admin
      .from("users")
      .select("id, full_name, email, plan, plan_status, created_at, cancelled_at, cancellation_reason, cancellation_comment")
      .order("created_at", { ascending: false }),
    admin.from("uso_ia_mensual").select("owner_id, costo_centavos"),
    admin
      .from("uso_ia_log")
      .select("input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens")
      .gte("creado_en", inicioMesPR.toISOString()),
    // Créditos de IA vendidos (migración 0064, 3 sept 2026, pedido de Joel:
    // "me sirve a ver cuanto estan gastando en IA") — filtrado por fecha de
    // COMPRA (created_at), no por ciclo_clave, para que la tarjeta refleje
    // ventas de ESTE MES calendario tal como el resto del dashboard.
    admin
      .from("creditos_ia_compras")
      .select("precio_pagado_centavos, credito_centavos")
      .gte("created_at", inicioMesPR.toISOString()),
    // Programa de Socios (migración 0070, 5 sept 2026) — se traen TODOS
    // (pendientes/aprobados/suspendidos y todas las comisiones), el panel
    // del cliente (socios-panel.tsx) decide cómo agruparlos.
    admin
      .from("socios")
      .select(
        "id, tipo, nombre, email, telefono, como_promociona, codigo, estado, created_at, payment_token, datos_pago_completados_at, bank_name, account_last4"
      )
      .order("created_at", { ascending: false }),
    admin
      .from("socios_comisiones")
      .select("id, socio_id, plan, comision_centavos, estado, created_at"),
  ]);

  const todos = usuarios ?? [];
  const activos = todos.filter((u) => u.plan_status === "active");
  const nuevosEsteMes = todos.filter((u) => u.created_at && new Date(u.created_at) >= inicioMesPR);
  const canceladosEsteMes = todos.filter((u) => u.cancelled_at && new Date(u.cancelled_at) >= inicioMesPR);
  const churnRate =
    activos.length + canceladosEsteMes.length > 0
      ? (canceladosEsteMes.length / (activos.length + canceladosEsteMes.length)) * 100
      : 0;

  // ---- Gasto de IA real, por usuario y por plan ----
  const costoIaPorUsuarioCentavos = new Map<string, number>();
  for (const fila of usoIa ?? []) {
    costoIaPorUsuarioCentavos.set(
      fila.owner_id,
      (costoIaPorUsuarioCentavos.get(fila.owner_id) ?? 0) + Number(fila.costo_centavos)
    );
  }

  const costoIaPorPlanCentavos = new Map<string, number>();
  const activosPorPlan = new Map<string, number>();
  for (const u of todos) {
    const plan = u.plan ?? "core";
    const costo = costoIaPorUsuarioCentavos.get(u.id) ?? 0;
    costoIaPorPlanCentavos.set(plan, (costoIaPorPlanCentavos.get(plan) ?? 0) + costo);
    if (u.plan_status === "active") activosPorPlan.set(plan, (activosPorPlan.get(plan) ?? 0) + 1);
  }
  const costoIaTotal = Array.from(costoIaPorUsuarioCentavos.values()).reduce((a, b) => a + b, 0) / 100;

  // ---- Créditos de IA vendidos este mes (migración 0064, 3 sept 2026) ----
  // ingresoCreditosIA = lo que de verdad pagaron los clientes (precio real
  // de Stripe). creditoOtorgadoCentavos = lo que les dimos de presupuesto
  // de IA a cambio (con margen, ver CREDITO_IA_CENTAVOS_POR_COMPRA en
  // lib/stripe.ts — $10 pagados = $7.00 de crédito, así que la diferencia
  // de $3 es margen bruto de esta línea específica).
  const ingresoCreditosIA = (creditosCompras ?? []).reduce((sum, c) => sum + Number(c.precio_pagado_centavos), 0) / 100;
  const creditoOtorgadoCentavos = (creditosCompras ?? []).reduce((sum, c) => sum + Number(c.credito_centavos), 0);
  const margenCreditosIA = ingresoCreditosIA - creditoOtorgadoCentavos / 100;

  // ---- Desglose real de tokens/costo, este mes (uso_ia_log) ----
  // Esto es para responder la duda de Joel sobre el Anthropic Console: ahí
  // se ve "tokens in" ~80x más grande que "tokens out" y parece carísimo,
  // pero la mayoría de ese "in" es cache_read (system prompt reciclado de
  // una llamada a otra), que Anthropic cobra a $0.10/millón — 10x más
  // barato que input normal y 50x más barato que output. Aquí se traduce
  // cada categoría a dólares reales para que se vea la proporción de COSTO,
  // no de cantidad de tokens. Todo el chat usa un solo modelo
  // (claude-haiku-4-5, ver app/api/victor/route.ts) y cachea siempre con
  // TTL de 1 hora, así que cache_creation_tokens usa esa tarifa.
  const preciosHaiku = PRECIOS["claude-haiku-4-5"];
  const tokensLog = (logIa ?? []).reduce(
    (acc, fila) => ({
      input: acc.input + (fila.input_tokens ?? 0),
      output: acc.output + (fila.output_tokens ?? 0),
      cacheRead: acc.cacheRead + (fila.cache_read_tokens ?? 0),
      cacheWrite: acc.cacheWrite + (fila.cache_creation_tokens ?? 0),
    }),
    { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  );
  const costoDesglose = {
    input: (tokensLog.input * preciosHaiku.inputCentavosPorMillon) / 1_000_000 / 100,
    output: (tokensLog.output * preciosHaiku.outputCentavosPorMillon) / 1_000_000 / 100,
    cacheRead: (tokensLog.cacheRead * preciosHaiku.cacheReadCentavosPorMillon) / 1_000_000 / 100,
    cacheWrite: (tokensLog.cacheWrite * preciosHaiku.cacheWrite1hCentavosPorMillon) / 1_000_000 / 100,
  };
  const costoDesgloseTotal = costoDesglose.input + costoDesglose.output + costoDesglose.cacheRead + costoDesglose.cacheWrite;
  const tokensLogTotalIn = tokensLog.input + tokensLog.cacheRead + tokensLog.cacheWrite;

  // ---- MRR (estimado — ver nota sobre Pro/Pro+ y mensual vs anual) ----
  // Solo Core es vendible hoy (Pro/Pro+ muestran "Próximamente"), así que
  // su precio real ($14.99/mes, bajado de $19.99 el 30 de agosto 2026) es
  // lo único confiable. No se distingue aquí si un usuario pagó mensual o
  // anual ($164/año ≈ $13.67/mes) — la tabla `users` no guarda el ciclo
  // elegido, así que esto sobreestima levemente el MRR de los que pagan
  // anual. Cuando Pro/Pro+ se activen, hay que poner sus precios reales aquí.
  const PRECIO_MENSUAL_ESTIMADO: Record<string, number> = { core: 14.99, pro: 0, proplus: 0 };
  const mrr = activos.reduce((sum, u) => sum + (PRECIO_MENSUAL_ESTIMADO[u.plan ?? "core"] ?? 0), 0);

  // ---- Costos estimados por usuario ----
  // Plaid: contrato real Order Form Q-56682 (verificado contra el PDF del
  // contrato, 3 sept 2026 — corrige el estimado anterior de "200 usuarios"
  // que Joel tenía de memoria). Son DOS compromisos fijos que suman
  // $1,000/mes durante los primeros 12 meses (8/15/2026–8/14/2027):
  // "API Services Commitment" $500 (un PISO comparado contra el uso real a
  // $2.00/usuario/mes — por eso cubre hasta 250 usuarios, no 200: $500 ÷
  // $2.00 = 250) + "Platform Support Commitment" $500 (siempre se cobra,
  // no se compensa con uso). Pasados los 250 usuarios, cada uno adicional
  // cuesta $2/mes aparte. NO es un costo plano de $2/usuario desde el
  // usuario #1 — con pocos usuarios, Plaid es carísimo por usuario (ej. a
  // 50 activos son $20/usuario, casi todo el precio de Core) y se abarata
  // según creces, hasta que pasas los 250 y ahí cada usuario nuevo sí es
  // marginal barato.
  // OJO: app/api/victor/route.ts todavía usa el viejo estimado de $2 plano
  // en su comentario de margen para el tope de gasto de IA — no es el mismo
  // cálculo (ese tope es solo sobre costo de IA, no sobre Plaid), pero si
  // se revisa ese número también hay que actualizar la nota ahí.
  const PLAID_BASE_MENSUAL = 1000;
  const PLAID_USUARIOS_INCLUIDOS = 250;
  const PLAID_POR_USUARIO_ADICIONAL = 2.0;
  const plaidEstimado =
    PLAID_BASE_MENSUAL + Math.max(0, activos.length - PLAID_USUARIOS_INCLUIDOS) * PLAID_POR_USUARIO_ADICIONAL;

  const STRIPE_FEE_POR_USUARIO = 0.73; // 2.9% + $0.30 sobre $14.99 — esto sí es genuinamente por-usuario (fee de Stripe por transacción)
  const stripeFeesEstimado = activos.length * STRIPE_FEE_POR_USUARIO;

  // Costos fijos de plataforma — NO son por usuario, ajústalos a mano si
  // cambian (no hay forma de leerlos automático desde Supabase).
  const COSTOS_FIJOS_MENSUALES = {
    "Supabase Pro": 25.0,
    "Vercel Pro": 20.0,
    "Cloudflare R2": 0.0, // dentro del tier gratis (10GB) por ahora
    "Make.com Core": 9.0,
  };
  const totalFijos = Object.values(COSTOS_FIJOS_MENSUALES).reduce((a, b) => a + b, 0);

  const costoTotalEstimado = costoIaTotal + plaidEstimado + stripeFeesEstimado + totalFijos;
  const margenBruto = mrr > 0 ? ((mrr - costoTotalEstimado) / mrr) * 100 : null;

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtFecha = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-PR", { timeZone: "America/Puerto_Rico", day: "numeric", month: "short", year: "numeric" }) : "—";

  // ---- Usuarios por plan (3 sept 2026, pedido de Joel: "no tengo ninguna
  // card por plan para saber cuantos hay en cada plan") — cuenta TODOS los
  // usuarios (no solo activos), incluyendo el plan "gratis" del sistema de
  // referidos (migración 0031).
  const conteoPorPlan = new Map<string, number>();
  for (const u of todos) {
    const plan = u.plan ?? "core";
    conteoPorPlan.set(plan, (conteoPorPlan.get(plan) ?? 0) + 1);
  }

  // Traducción de las categorías fijas que usa el Cancellation Flow de
  // Stripe (subscription.cancellation_details.reason) — si el usuario
  // canceló por otra vía (ej. lo cancelamos nosotros desde el Dashboard de
  // Stripe) este campo viene null y simplemente no se muestra razón.
  const RAZON_CANCELACION_LABEL: Record<string, string> = {
    too_expensive: "Muy caro",
    unused: "No lo usaba",
    missing_features: "Le faltaban funciones",
    switched_service: "Se cambió a otro servicio",
    too_complex: "Muy complicado",
    customer_service: "Mal servicio al cliente",
    low_quality: "Baja calidad",
    other: "Otra razón",
  };

  // ---- Cancelados recientes (últimos 30 días) — para poder escribirles ----
  const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const canceladosRecientes = todos
    .filter((u) => u.cancelled_at && new Date(u.cancelled_at) >= hace30dias)
    .sort((a, b) => new Date(b.cancelled_at!).getTime() - new Date(a.cancelled_at!).getTime());

  return (
    <div className="vc-shell">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-lg font-medium">{saludoPorHora()}, Joel</h1>
        <span className="rounded-pill border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">Ops</span>
      </div>
      <p className="mb-4 text-xs text-muted">{fechaHoraLegiblePR()}</p>

      {(errorUsuarios || errorUso || errorLog) && (
        <div className="vc-card mb-3 border-red">
          <p className="text-xs text-red">
            {errorUsuarios?.message ?? errorUso?.message ?? errorLog?.message ?? "Error leyendo datos."}
          </p>
        </div>
      )}

      {/* Hero: MRR / usuarios activos / nuevos este mes */}
      <div className="vc-bal mb-3 grid grid-cols-3 gap-4">
        <div>
          <p className="vc-bal-lbl">MRR (estimado)</p>
          <p className="vc-bal-amt !text-2xl">{fmt(mrr)}</p>
        </div>
        <div>
          <p className="vc-bal-lbl">Usuarios activos</p>
          <p className="vc-bal-amt !text-2xl">{activos.length}</p>
        </div>
        <div>
          <p className="vc-bal-lbl">Nuevos este mes</p>
          <p className="vc-bal-amt !text-2xl">{nuevosEsteMes.length}</p>
        </div>
      </div>

      {/* 5 métricas */}
      <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Cancelados este mes</p>
          <p className="text-xl font-medium">{canceladosEsteMes.length}</p>
        </div>
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Churn rate</p>
          <p className="text-xl font-medium">{churnRate.toFixed(1)}%</p>
        </div>
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Gasto IA total</p>
          <p className="text-xl font-medium">{fmt(costoIaTotal)}</p>
        </div>
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Margen bruto</p>
          <p className={`text-xl font-medium ${margenBruto === null ? "text-muted" : margenBruto >= 0 ? "text-grn" : "text-red"}`}>
            {margenBruto === null ? "—" : `${margenBruto.toFixed(0)}%`}
          </p>
        </div>
        {/* Créditos de IA vendidos este mes (migración 0064, 3 sept 2026,
            pedido de Joel: "me sirve a ver cuanto estan gastando en IA") —
            ingreso real de Stripe, no el crédito otorgado (que es más bajo
            por el margen). */}
        <div className="vc-card">
          <p className="text-[10px] uppercase tracking-wide text-muted">Créditos IA vendidos</p>
          <p className="text-xl font-medium">{fmt(ingresoCreditosIA)}</p>
          {ingresoCreditosIA > 0 && (
            <p className="mt-0.5 text-[11px] text-muted">margen {fmt(margenCreditosIA)}</p>
          )}
        </div>
      </div>

      {/* Usuarios por plan (3 sept 2026, pedido de Joel) — quick-glance, no
          colapsable. Tailwind necesita clases LITERALES en el código (su
          JIT no evalúa template strings en tiempo de ejecución) — de ahí
          este mapa en vez de armar "md:grid-cols-N" con el número real. */}
      <div
        className={`mb-3 grid grid-cols-2 gap-2 ${
          { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[
            Math.min(Math.max(conteoPorPlan.size, 1), 4)
          ]
        }`}
      >
        {Array.from(conteoPorPlan.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([plan, cantidad]) => (
            <div key={plan} className="vc-card">
              <p className="text-[10px] uppercase tracking-wide text-muted">{PLAN_LABEL[plan] ?? plan}</p>
              <p className="text-xl font-medium">{cantidad}</p>
            </div>
          ))}
        {conteoPorPlan.size === 0 && (
          <div className="vc-card">
            <p className="text-[10px] uppercase tracking-wide text-muted">Usuarios por plan</p>
            <p className="py-2 text-center text-sm text-muted">Sin datos todavía.</p>
          </div>
        )}
      </div>

      {/* Usuarios — colapsable, con búsqueda por nombre/email */}
      <UsuariosPanel
        usuarios={todos.map((u) => ({
          id: u.id,
          nombre: u.full_name ?? "",
          email: u.email,
          plan: u.plan ?? "core",
          planStatus: u.plan_status,
          creadoEn: u.created_at,
          gastoIaCentavos: costoIaPorUsuarioCentavos.get(u.id) ?? 0,
        }))}
      />

      {/* Programa de Socios (CPAs/influencers, migración 0070) — aprobar
          solicitudes y marcar comisiones en efectivo como pagadas */}
      <SociosPanel
        socios={(socios ?? []).map((s) => ({
          id: s.id,
          tipo: s.tipo,
          nombre: s.nombre,
          email: s.email,
          telefono: s.telefono,
          comoPromociona: s.como_promociona,
          codigo: s.codigo,
          estado: s.estado as "pendiente" | "aprobado" | "suspendido",
          createdAt: s.created_at,
          paymentToken: s.payment_token,
          datosPagoCompletados: !!s.datos_pago_completados_at,
          bankName: s.bank_name,
          accountLast4: s.account_last4,
        }))}
        comisiones={(comisionesSocios ?? []).map((c) => ({
          id: c.id,
          socioId: c.socio_id,
          plan: c.plan,
          comisionCentavos: Number(c.comision_centavos),
          estado: c.estado as "pendiente" | "pagada",
          createdAt: c.created_at,
        }))}
      />

      {/* Cancelados recientes — con razón (si Stripe la capturó) y botón de email */}
      {canceladosRecientes.length > 0 && (
        <Colapsable titulo="Cancelados recientes (últimos 30 días)" contador={canceladosRecientes.length}>
          <div className="flex flex-col gap-2">
            {canceladosRecientes.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-0">
                <div className="min-w-0">
                  <p className="truncate">{u.full_name || "Sin nombre"} <span className="text-[11px] text-muted">· {fmtFecha(u.cancelled_at)}</span></p>
                  <p className="truncate text-[11px] text-muted">{u.email}</p>
                  {(u.cancellation_reason || u.cancellation_comment) && (
                    <p className="mt-0.5 text-[11px] text-amb">
                      {u.cancellation_reason ? RAZON_CANCELACION_LABEL[u.cancellation_reason] ?? u.cancellation_reason : null}
                      {u.cancellation_reason && u.cancellation_comment ? " — " : null}
                      {u.cancellation_comment ? `"${u.cancellation_comment}"` : null}
                    </p>
                  )}
                  {!u.cancellation_reason && !u.cancellation_comment && (
                    <p className="mt-0.5 text-[11px] text-muted">Sin razón capturada (canceló fuera del portal de Stripe).</p>
                  )}
                </div>
                <a
                  href={`mailto:${u.email}?subject=${encodeURIComponent("¿Qué te hizo cancelar VICTOR CFO?")}`}
                  className="shrink-0 rounded-pill border border-teal px-3 py-1.5 text-[11px] font-medium text-teal"
                >
                  Email
                </a>
              </div>
            ))}
          </div>
        </Colapsable>
      )}

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        {/* Gasto de IA por plan */}
        <Colapsable titulo="Gasto de IA por plan">
          <div className="flex flex-col gap-1">
            {Array.from(costoIaPorPlanCentavos.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([plan, centavos]) => {
                const nActivos = activosPorPlan.get(plan) ?? 0;
                const promedio = nActivos > 0 ? centavos / 100 / nActivos : 0;
                return (
                  <div key={plan} className="flex items-center justify-between border-b border-border py-2 text-sm last:border-0">
                    <div>
                      <p>{PLAN_LABEL[plan] ?? plan}</p>
                      <p className="text-[11px] text-muted">{nActivos} activos · {fmt(promedio)}/usuario</p>
                    </div>
                    <p className="font-medium">{fmt(centavos / 100)}</p>
                  </div>
                );
              })}
            {costoIaPorPlanCentavos.size === 0 && <p className="py-2 text-center text-sm text-muted">Sin datos todavía.</p>}
          </div>
        </Colapsable>

        {/* Infraestructura */}
        <Colapsable titulo="Infraestructura — costo mensual estimado">
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between border-b border-border py-1.5">
              <span className="text-muted">Claude API (real, todos los ciclos)</span>
              <span className="font-medium">{fmt(costoIaTotal)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border py-1.5">
              <span className="text-muted">
                Plaid (${PLAID_BASE_MENSUAL} fijo hasta {PLAID_USUARIOS_INCLUIDOS} usuarios
                {activos.length > PLAID_USUARIOS_INCLUIDOS
                  ? ` + $${PLAID_POR_USUARIO_ADICIONAL.toFixed(2)} x ${activos.length - PLAID_USUARIOS_INCLUIDOS} extra`
                  : ""}
                )
              </span>
              <span className="font-medium text-amb">{fmt(plaidEstimado)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-border py-1.5">
              <span className="text-muted">Stripe fees (est. ${STRIPE_FEE_POR_USUARIO.toFixed(2)}/usuario)</span>
              <span className="font-medium text-amb">{fmt(stripeFeesEstimado)}</span>
            </div>
            {Object.entries(COSTOS_FIJOS_MENSUALES).map(([nombre, costo]) => (
              <div key={nombre} className="flex items-center justify-between border-b border-border py-1.5">
                <span className="text-muted">{nombre}</span>
                <span className="font-medium">{fmt(costo)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 text-sm font-medium">
              <span>Total estimado</span>
              <span>{fmt(costoTotalEstimado)}</span>
            </div>
          </div>
        </Colapsable>
      </div>

      {/* Desglose de tokens/costo real — de dónde sale el $ de Claude */}
      <Colapsable titulo="Desglose de costo de Claude — este mes">
        <p className="mb-3 text-[11px] text-muted">
          {tokensLogTotalIn.toLocaleString("en-US")} tokens de entrada vs. {tokensLog.output.toLocaleString("en-US")} de salida —
          se ve desproporcionado en tokens, pero la mayoría de la entrada es caché reciclado (10x-50x más barato). Aquí está el $ real por categoría.
        </p>
        <div className="flex flex-col gap-1 text-sm">
          <div className="flex items-center justify-between border-b border-border py-1.5">
            <span className="text-muted">Input normal ({tokensLog.input.toLocaleString("en-US")} tok)</span>
            <span className="font-medium">{fmt(costoDesglose.input)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border py-1.5">
            <span className="text-muted">Escritura de caché, 1h ({tokensLog.cacheWrite.toLocaleString("en-US")} tok)</span>
            <span className="font-medium">{fmt(costoDesglose.cacheWrite)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border py-1.5">
            <span className="text-muted">Lectura de caché ({tokensLog.cacheRead.toLocaleString("en-US")} tok)</span>
            <span className="font-medium">{fmt(costoDesglose.cacheRead)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border py-1.5">
            <span className="text-muted">Output ({tokensLog.output.toLocaleString("en-US")} tok)</span>
            <span className="font-medium">{fmt(costoDesglose.output)}</span>
          </div>
          <div className="flex items-center justify-between pt-2 text-sm font-medium">
            <span>Total (debe ≈ Gasto IA total de arriba)</span>
            <span>{fmt(costoDesgloseTotal)}</span>
          </div>
        </div>
      </Colapsable>
    </div>
  );
}
