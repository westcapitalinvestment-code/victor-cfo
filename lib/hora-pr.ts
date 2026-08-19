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
