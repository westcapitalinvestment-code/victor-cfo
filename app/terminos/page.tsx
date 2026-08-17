// Borrador razonable para arrancar (necesario para el cuestionario de
// producción de Plaid) — NO sustituye revisión de un abogado. Antes de
// manejar dinero real de clientes reales a gran escala, un abogado de
// PR/EE.UU. debe revisar esto.
export default function TerminosServicioPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">Términos de Servicio de VICTOR CFO</h1>
      <p className="mb-6 text-xs text-gray-500">Última actualización: 18 de agosto de 2026</p>

      <p className="mb-4">
        Estos términos rigen el uso de victorcfo.com y la aplicación VICTOR CFO (el
        &quot;Servicio&quot;), operado por West Capital Ventures LLC (&quot;WCV&quot;, &quot;nosotros&quot;).
        Al crear una cuenta, aceptas estos términos.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">1. Qué es VICTOR CFO</h2>
      <p className="mb-4">
        VICTOR CFO es una herramienta de organización financiera personal y de negocio: conecta tus
        cuentas bancarias, organiza y categoriza tus gastos, te ayuda a fijar metas de ahorro, y te da
        reportes y recomendaciones a través de VICTOR, un asistente con inteligencia artificial.
      </p>
      <p className="mb-4">
        <strong>
          VICTOR CFO no es un asesor financiero, contable, ni legal licenciado. Las recomendaciones,
          categorías fiscales, y reportes que genera son de apoyo informativo — no sustituyen el consejo
          de un CPA, abogado, o asesor financiero con licencia.
        </strong>{" "}
        Antes de tomar decisiones financieras importantes o radicar planillas de impuestos, confirma la
        información con un profesional.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">2. Elegibilidad</h2>
      <p className="mb-4">
        Debes tener al menos 18 años y capacidad legal para aceptar estos términos para usar el Servicio.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">3. Tu cuenta</h2>
      <p className="mb-4">
        Eres responsable de mantener segura tu contraseña y de toda actividad que ocurra en tu cuenta.
        Avísanos de inmediato si sospechas un acceso no autorizado.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">4. Conexión bancaria (Plaid)</h2>
      <p className="mb-4">
        Cuando conectas una cuenta bancaria, autorizas a Plaid Inc. a compartir con nosotros la
        información de esa cuenta necesaria para operar el Servicio (balances, transacciones). Puedes
        revocar esa conexión en cualquier momento desde la sección &quot;Cuentas&quot;. Nosotros no
        tenemos acceso a tu usuario ni contraseña bancaria.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">5. Planes y pagos</h2>
      <p className="mb-4">
        Ofrecemos varios planes (Core, Pro, Pro+, y próximamente Enterprise), con precio mensual o anual
        según elijas. Los nuevos usuarios reciben un período de prueba según se indique al momento del
        registro. Puedes cancelar tu suscripción en cualquier momento desde Configuración — la
        cancelación aplica al final del período ya pagado, sin reembolsos parciales salvo que la ley
        aplicable lo requiera.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">6. Uso aceptable</h2>
      <p className="mb-4">
        No debes usar el Servicio para actividades ilegales, para intentar acceder a cuentas de otros
        usuarios, ni para interferir con el funcionamiento normal de la plataforma.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">7. Propiedad intelectual</h2>
      <p className="mb-4">
        El Servicio, su diseño, marca, y código son propiedad de West Capital Ventures LLC. Tu
        información financiera y personal sigue siendo tuya — nosotros solo la procesamos para darte el
        Servicio.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">8. Limitación de responsabilidad</h2>
      <p className="mb-4">
        El Servicio se ofrece &quot;tal cual&quot;. Hacemos lo posible por mantenerlo preciso y
        disponible, pero no garantizamos que esté libre de errores en todo momento. En la máxima medida
        permitida por ley, WCV no será responsable por decisiones financieras que tomes basándote en la
        información del Servicio.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">9. Terminación</h2>
      <p className="mb-4">
        Puedes cerrar tu cuenta cuando quieras. Podemos suspender o cerrar cuentas que violen estos
        términos.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">10. Ley aplicable</h2>
      <p className="mb-4">Estos términos se rigen por las leyes del Estado Libre Asociado de Puerto Rico.</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">11. Cambios a estos términos</h2>
      <p className="mb-4">
        Si hacemos cambios importantes, te avisaremos por correo o dentro de la aplicación antes de que
        entren en vigor.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">12. Contacto</h2>
      <p className="mb-4">
        West Capital Ventures LLC — Puerto Rico.{" "}
        <a href="mailto:dr.jvalentin@gmail.com" className="text-teal-700 underline">
          dr.jvalentin@gmail.com
        </a>
      </p>
    </div>
  );
}
