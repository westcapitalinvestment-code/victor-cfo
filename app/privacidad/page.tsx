// Borrador razonable para arrancar (necesario para el cuestionario de
// producción de Plaid, que pide un link público a esta página) — NO
// sustituye revisión de un abogado. Antes de manejar dinero real de
// clientes reales a gran escala, un abogado de PR/EE.UU. debe revisar esto.
export default function PoliticaPrivacidadPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">Política de Privacidad de VICTOR CFO</h1>
      <p className="mb-6 text-xs text-gray-500">Última actualización: 18 de agosto de 2026</p>

      <p className="mb-4">
        VICTOR CFO es un producto de West Capital Ventures LLC (&quot;WCV&quot;, &quot;nosotros&quot;). Esta
        política explica qué información recopilamos cuando usas victorcfo.com y la aplicación VICTOR
        CFO (el &quot;Servicio&quot;), cómo la usamos, y qué control tienes sobre ella.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">1. Información que recopilamos</h2>
      <p className="mb-2">Recopilamos tres tipos de información:</p>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">
          <strong>Información de cuenta:</strong> nombre, correo electrónico, y las respuestas que nos
          des durante el registro u onboarding (por ejemplo, tu situación financiera general).
        </li>
        <li className="mb-1">
          <strong>Información financiera:</strong> cuando conectas voluntariamente una cuenta bancaria a
          través de Plaid, recibimos datos de esa cuenta (balances, movimientos/transacciones, nombre de
          la institución) directamente de Plaid Inc., nuestro proveedor de conexión bancaria. Nunca vemos
          ni almacenamos tu usuario o contraseña del banco — eso queda entre tú y Plaid/tu banco.
        </li>
        <li className="mb-1">
          <strong>Conversaciones con VICTOR:</strong> los mensajes que le escribes a VICTOR (nuestro
          asistente financiero con inteligencia artificial), para poder darte continuidad entre sesiones.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">2. Cómo usamos tu información</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">Para operar el Servicio: mostrarte tus gastos, metas, alertas y reportes.</li>
        <li className="mb-1">Para que VICTOR pueda darte recomendaciones y respuestas relevantes a tu situación.</li>
        <li className="mb-1">Para categorizar tus transacciones y generar reportes financieros.</li>
        <li className="mb-1">Para comunicarnos contigo sobre tu cuenta (avisos de servicio, no mercadeo sin tu permiso).</li>
      </ul>
      <p className="mb-4">
        <strong>No vendemos tu información personal ni financiera a terceros.</strong> No la compartimos
        con fines publicitarios.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">3. Con quién compartimos información</h2>
      <p className="mb-2">Usamos los siguientes proveedores para operar el Servicio, cada uno con acceso limitado a lo que necesita para su función:</p>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1"><strong>Plaid Inc.</strong> — conexión segura con tu banco.</li>
        <li className="mb-1"><strong>Supabase</strong> — almacenamiento de la base de datos.</li>
        <li className="mb-1"><strong>Anthropic</strong> — el modelo de inteligencia artificial detrás de VICTOR.</li>
        <li className="mb-1"><strong>Resend</strong> — envío de correos transaccionales (ej. invitaciones).</li>
        <li className="mb-1"><strong>Vercel</strong> — hospedaje de la aplicación.</li>
      </ul>
      <p className="mb-4">
        Solo compartimos lo mínimo necesario con cada uno, y todos están sujetos a sus propias
        obligaciones de seguridad y confidencialidad.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">4. Cómo protegemos tu información</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">Toda la conexión entre tu navegador y nuestros servidores va cifrada (HTTPS).</li>
        <li className="mb-1">
          El token de acceso de tu banco (lo que nos permite pedirle datos a Plaid en tu nombre) se
          guarda cifrado con AES-256 en nuestra base de datos — no en texto plano.
        </li>
        <li className="mb-1">
          Cada usuario solo puede ver sus propios datos, aplicado a nivel de base de datos (Row Level
          Security), no solo en la aplicación.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">5. Tus derechos</h2>
      <p className="mb-4">
        Puedes desconectar cualquier cuenta bancaria conectada en cualquier momento desde la sección
        &quot;Cuentas&quot; de la app. Puedes pedirnos acceso, corrección, o eliminación completa de tu
        información escribiendo a{" "}
        <a href="mailto:info@westcapitalventuresllc.com" className="text-teal-700 underline">
          info@westcapitalventuresllc.com
        </a>
        . Al eliminar tu cuenta, eliminamos tu información personal y financiera de nuestros sistemas,
        salvo lo que estemos legalmente obligados a conservar.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">6. Retención de datos</h2>
      <p className="mb-4">
        Conservamos tu información mientras tu cuenta esté activa. Si cancelas o eliminas tu cuenta, la
        borramos dentro de un plazo razonable, salvo la que debamos conservar por obligación legal o
        contable.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">7. Cambios a esta política</h2>
      <p className="mb-4">
        Si hacemos cambios importantes a esta política, te lo notificaremos por correo o dentro de la
        aplicación antes de que entren en vigor.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">8. Contacto</h2>
      <p className="mb-4">
        West Capital Ventures LLC — Puerto Rico.{" "}
        <a href="mailto:info@westcapitalventuresllc.com" className="text-teal-700 underline">
          info@westcapitalventuresllc.com
        </a>
      </p>
    </div>
  );
}
