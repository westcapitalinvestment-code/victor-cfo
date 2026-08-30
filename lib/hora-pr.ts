// Hora y fecha real de Puerto Rico — fuente única para el saludo del Home
// ("Buenos días/tardes/noches" ya no puede ser un texto fijo) y para el
// contexto que se le manda a VICTOR (para que sepa qué hora es y qué
// significan "hoy", "ayer", "anoche" cuando el usuario los usa). El
// servidor de Vercel corre en UTC, así que todo esto se calcula con
// Intl.DateTimeFormat contra la zona "America/Puerto_Rico" en vez de
// usar getHours()/getDay() directo, que darían la hora de UTC.

export function saludoPorHora(fecha: Date = new Date()): "Buenos días" | "Buenas tardes" | "Buenas noches" {
  const horaPR = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Puerto_Rico",
      hour: "numeric",
      hour12: false,
    }).format(fecha)
  );
  if (horaPR >= 5 && horaPR < 12) return "Buenos días";
  if (horaPR >= 12 && horaPR < 19) return "Buenas tardes";
  return "Buenas noches";
}

// Fecha/hora completa y legible en español, para inyectar en el contexto
// dinámico de VICTOR — así puede saber qué día es, qué hora es, y anclar
// correctamente referencias relativas del usuario ("anoche te dije...").
export function fechaHoraLegiblePR(fecha: Date = new Date()): string {
  const fmtFecha = new Intl.DateTimeFormat("es-PR", {
    timeZone: "America/Puerto_Rico",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const fmtHora = new Intl.DateTimeFormat("es-PR", {
    timeZone: "America/Puerto_Rico",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${fmtFecha.format(fecha)}, ${fmtHora.format(fecha)} (hora de Puerto Rico)`;
}

// Fecha de HOY en Puerto Rico como YYYY-MM-DD — para comparar contra
// columnas `date` en Supabase (ej. user_profiles.ultimo_saludo_en) sin
// que un usuario conectado pasada la medianoche UTC pero todavía de tarde
// en PR reciba "mañana" de forma incorrecta.
export function fechaHoyPR(fecha: Date = new Date()): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Puerto_Rico",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(fecha); // en-CA da directo el formato YYYY-MM-DD
}

// Diferencia en DÍAS DE CALENDARIO (nunca de tiempo real) entre HOY en
// Puerto Rico y una fecha guardada (columna `date` de Supabase, formato
// "YYYY-MM-DD" — ej. fecha_vencimiento de un documento o la fecha de una
// cita). Bug real (30 agosto 2026, reportado por Joel): tanto
// revisar_documentos_por_vencer como revisar_citas_proximas (y los
// cálculos gemelos en /dashboard) comparaban `new Date()` (un INSTANTE
// real, la hora exacta ahora mismo) contra `new Date(fecha + "T00:00:00")`
// (medianoche interpretada en la zona del SERVIDOR, que en Vercel es UTC)
// — el servidor corre en UTC (4 horas adelante de PR), así que pasada
// cierta hora de la tarde/noche en PR la medianoche UTC del día
// SIGUIENTE ya había llegado aunque en Puerto Rico siguiera siendo hoy.
// Resultado real: un domingo en la noche, VICTOR le dijo a Joel "tu
// marbete vence HOY" y "tienes una cita hoy a las 12pm" cuando ambas
// cosas eran en realidad para el día siguiente (lunes) — un caso clásico
// de comparar un instante de tiempo contra una fecha de calendario. Esta
// función solo compara FECHAS DE CALENDARIO (ambas ancladas a medianoche
// UTC de forma consistente, nunca a un instante real), así que no le
// importa la hora del día ni la zona horaria del servidor en que corra.
export function diasHastaPR(fechaISO: string, ahora: Date = new Date()): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const hoyUTC = new Date(`${fechaHoyPR(ahora)}T00:00:00Z`).getTime();
  const fechaUTC = new Date(`${fechaISO}T00:00:00Z`).getTime();
  return Math.round((fechaUTC - hoyUTC) / MS_POR_DIA);
}
