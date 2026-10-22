import Link from "next/link";

// Landing pública para contables (22 oct 2026, pedido de Joel: pestaña
// "Contables" en el nav del landing, "que lleve al landing de registrarse el
// contable con su explicación ... que se vea bonito e incite a inscribirse").
// Vende lo que ya existe: cuenta gratis sin clientes (/registro/cpa), ficha en
// el directorio de contables que ven los usuarios de VICTOR sin contable
// (migración 0163), Portal Contable, invitar clientes y VICTOR Accountant
// ($60/mes por Business en vez de $99.99, precio de lanzamiento el primer año).
// Es una página estática (server component): no lee datos de nadie.
const NAVY = "#1B3A5C";

const PASOS = [
  {
    n: "1",
    titulo: "Abre tu cuenta (1 minuto)",
    texto: "Nombre, correo, contraseña y tu Registro de Comerciante. La licencia de CPA es opcional. Sin costo y sin tener clientes todavía.",
  },
  {
    n: "2",
    titulo: "Completa tu ficha",
    texto: "Tu pueblo, tus especialidades, los sectores que atiendes y una descripción corta de tu oficina. Tú decides qué se ve.",
  },
  {
    n: "3",
    titulo: "Te encuentran y te contactan",
    texto: "Los usuarios de VICTOR que no tienen contable buscan por pueblo y especialidad, ven tu ficha y te escriben o te llaman directo.",
  },
];

const BENEFICIOS = [
  {
    icono: "📍",
    titulo: "Clientes nuevos, sin anunciarte",
    texto: "Tu oficina aparece en el directorio de contables dentro de la app, justo cuando el dueño de negocio necesita uno.",
  },
  {
    icono: "📊",
    titulo: "Sus números al día, sin perseguirlos",
    texto: "Con el permiso de tu cliente ves facturación, pagos, retenciones, gastos y reportes de su negocio, y bajas todo en Excel o PDF.",
  },
  {
    icono: "🔔",
    titulo: "Alertas que se te iban a pasar",
    texto: "Documentos por vencer, retenciones, certificados y pendientes de tus clientes agrupados en un solo panel.",
  },
  {
    icono: "🗂️",
    titulo: "Bóveda compartida",
    texto: "Tu cliente te comparte documentos desde la app. Se acabó pedir el mismo papel cuatro veces por WhatsApp.",
  },
  {
    icono: "🤝",
    titulo: "Invita a tus clientes actuales",
    texto: "Mándales una invitación desde tu portal. Ellos mantienen el control y deciden qué compartes tú.",
  },
  {
    icono: "🎁",
    titulo: "VICTOR Accountant",
    texto: "Regálales o inclúyeles el plan Business en tu iguala. Pagas $60/mes por cliente en vez de $99.99 (precio de lanzamiento el primer año).",
  },
];

const PREGUNTAS = [
  {
    p: "¿Cuesta algo abrir la cuenta?",
    r: "No. La cuenta de contable y aparecer en el directorio son gratis. Solo pagas si decides incluir el plan Business de un cliente con VICTOR Accountant.",
  },
  {
    p: "¿Necesito tener clientes en VICTOR?",
    r: "No. Puedes abrir tu cuenta hoy, completar tu ficha y esperar a que te encuentren, o invitar a los tuyos cuando quieras.",
  },
  {
    p: "¿Qué datos de mis clientes veo?",
    r: "Solo los de quien te invita o te da acceso. VICTOR no manda los datos de nadie por su cuenta: cada cliente decide cuándo y qué compartir.",
  },
  {
    p: "¿Qué necesito para registrarme?",
    r: "Tu Registro de Comerciante. La licencia de CPA es opcional.",
  },
];

export default function ContablesPage() {
  return (
    <div className="min-h-screen bg-white text-text">
      {/* Barra superior */}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-8 w-8 rounded-full object-cover" />
          <span>VICTOR</span>
          <span className="rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">Contables</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/login" className="text-muted hover:text-teal">
            Ya tengo cuenta
          </Link>
          <Link href="/registro/cpa" className="rounded-full bg-teal px-4 py-2 font-medium text-white">
            Crear mi cuenta
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pb-14 pt-8 text-center" style={{ background: `linear-gradient(180deg, #ffffff 0%, #eef5f4 100%)` }}>
        <div className="mx-auto max-w-3xl">
          <span className="mb-4 inline-block rounded-full border border-border bg-white px-3 py-1 text-xs text-muted">
            Para contables y firmas de contabilidad de Puerto Rico
          </span>
          <h1 className="text-3xl font-semibold leading-tight sm:text-5xl" style={{ color: NAVY }}>
            Tus futuros clientes ya están
            <br />
            buscando contable. <span className="text-teal">Que te encuentren a ti.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-muted">
            VICTOR CFO es la app donde dueños de negocio organizan sus finanzas. Abre tu cuenta de contable gratis, aparece en
            nuestro directorio y trabaja con los números de tus clientes siempre al día.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/registro/cpa" className="rounded-full bg-teal px-7 py-3 text-sm font-medium text-white shadow-sm">
              Crear mi cuenta de contable, gratis
            </Link>
            <a href="#como-funciona" className="rounded-full border border-border bg-white px-7 py-3 text-sm font-medium text-muted">
              Ver cómo funciona
            </a>
          </div>
          <p className="mt-3 text-xs text-muted">Sin costo · sin clientes previos · te toma un minuto</p>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-center text-2xl font-semibold" style={{ color: NAVY }}>
          Tres pasos y ya apareces
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {PASOS.map((p) => (
            <div key={p.n} className="rounded-2xl border border-border bg-white p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-semibold text-white">{p.n}</div>
              <p className="text-sm font-medium">{p.titulo}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Así se ve tu ficha */}
      <section className="px-6 py-14" style={{ background: NAVY }}>
        <div className="mx-auto grid max-w-5xl items-center gap-10 sm:grid-cols-2">
          <div className="text-white">
            <h2 className="text-2xl font-semibold">Así te ven los usuarios de VICTOR</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/80">
              Dentro de la app hay un directorio de contables. El usuario filtra por pueblo y especialidad, lee tu descripción y te
              contacta directo por teléfono, correo, web o redes. Tú escribes lo que te hace diferente; nosotros ponemos al cliente
              frente a ti.
            </p>
            <Link href="/registro/cpa" className="mt-6 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-medium" style={{ color: NAVY }}>
              Quiero mi ficha
            </Link>
          </div>

          {/* Mockup de ficha (datos ficticios) */}
          <div className="rounded-2xl bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: NAVY }}>
                  Tu Oficina de Contabilidad
                </p>
                <p className="text-xs text-muted">📍 Tu pueblo · Atiende a distancia</p>
              </div>
              <span className="rounded-full border border-teal px-2 py-0.5 text-[10px] font-medium text-teal">En el directorio</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              “Llevamos la contabilidad de pequeños negocios y profesionales: planillas, IVU, 480.6SP y planificación contributiva.
              Atención personalizada y respuesta en el mismo día.”
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Pequeños negocios", "Profesionales de salud", "Planillas e IVU", "Retenciones"].map((t) => (
                <span key={t} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted">
                  {t}
                </span>
              ))}
            </div>
            <div className="mt-4 flex gap-2 text-xs">
              <span className="flex-1 rounded-lg bg-teal px-3 py-2 text-center font-medium text-white">Llamar</span>
              <span className="flex-1 rounded-lg border border-border px-3 py-2 text-center font-medium text-muted">Escribir</span>
            </div>
            <p className="mt-3 text-center text-[10px] text-muted">Ejemplo ilustrativo</p>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <h2 className="text-center text-2xl font-semibold" style={{ color: NAVY }}>
          Más que un directorio: tu portal de trabajo
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">
          Cuando un cliente te da acceso, trabajas con su información real y actualizada, no con fotos de recibos.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFICIOS.map((b) => (
            <div key={b.titulo} className="rounded-2xl border border-border bg-white p-5">
              <div className="mb-2 text-2xl" aria-hidden>
                {b.icono}
              </div>
              <p className="text-sm font-medium">{b.titulo}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{b.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Preguntas */}
      <section className="mx-auto max-w-3xl px-6 pb-14">
        <h2 className="text-center text-2xl font-semibold" style={{ color: NAVY }}>
          Preguntas rápidas
        </h2>
        <div className="mt-6 flex flex-col gap-3">
          {PREGUNTAS.map((q) => (
            <div key={q.p} className="rounded-2xl border border-border bg-white p-4">
              <p className="text-sm font-medium">{q.p}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{q.r}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="px-6 py-14 text-center" style={{ background: "#eef5f4" }}>
        <h2 className="text-2xl font-semibold" style={{ color: NAVY }}>
          Tu oficina, frente a quien ya busca contable
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">Abre tu cuenta hoy. Es gratis y toma un minuto.</p>
        <Link href="/registro/cpa" className="mt-6 inline-block rounded-full bg-teal px-8 py-3 text-sm font-medium text-white shadow-sm">
          Crear mi cuenta de contable
        </Link>
        <p className="mt-4 text-xs text-muted">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-teal underline">
            Entra aquí
          </Link>
        </p>
      </section>
    </div>
  );
}
