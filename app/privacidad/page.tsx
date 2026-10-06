// Borrador ampliado (6 oct 2026) — NO sustituye revisión de un abogado. Antes
// de publicarlo como versión final, un abogado de PR/EE.UU. debe revisarlo
// (ver docs/ en la carpeta del proyecto: lista de puntos para el abogado).
// Si cambia algo del producto que toque datos (proveedores nuevos, accesos de
// terceros, retención), esta página se actualiza en el mismo commit.
export default function PoliticaPrivacidadPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">Política de Privacidad de VICTOR CFO</h1>
      <p className="mb-6 text-xs text-gray-500">Última actualización: 6 de octubre de 2026</p>

      <p className="mb-4">
        VICTOR CFO es un producto de West Capital Ventures LLC (&quot;WCV&quot;, &quot;nosotros&quot;). Esta
        política explica qué información recopilamos cuando usas victorcfo.com y la aplicación VICTOR
        CFO (el &quot;Servicio&quot;), cómo la usamos, con quién se comparte, y qué control tienes sobre ella.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">1. Información que recopilamos</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">
          <strong>Información de cuenta:</strong> nombre, correo electrónico, teléfono (si lo das), y las
          respuestas que nos des durante el registro u onboarding (por ejemplo, tu situación financiera
          general).
        </li>
        <li className="mb-1">
          <strong>Información financiera:</strong> cuando conectas voluntariamente una cuenta bancaria a
          través de Plaid, recibimos datos de esa cuenta (balances, transacciones, nombre de la
          institución) directamente de Plaid Inc. Nunca vemos ni almacenamos tu usuario o contraseña del
          banco. También recibimos la información que subes tú: estados de cuenta (CSV, Excel o PDF),
          transacciones manuales, facturas, cotizaciones, clientes y servicios.
        </li>
        <li className="mb-1">
          <strong>Documentos y archivos:</strong> los documentos, fotos, certificados y adjuntos que subes
          (por ejemplo, la Bóveda, evidencia de pagos, certificados de relevo o de registro de comerciante,
          logos).
        </li>
        <li className="mb-1">
          <strong>Información de terceros que tú ingresas:</strong> si usas el módulo de Pagos o Equipo,
          puedes registrar datos de contratistas, técnicos o empleados (por ejemplo, nombre, dirección,
          número de seguro social o EIN, y datos bancarios para pagos). Eres responsable de contar con
          derecho a ingresar esa información.
        </li>
        <li className="mb-1">
          <strong>Conversaciones con VICTOR:</strong> los mensajes e imágenes que le envías a VICTOR
          (nuestro asistente con inteligencia artificial), para darte continuidad entre sesiones.
        </li>
        <li className="mb-1">
          <strong>Información de pago:</strong> los pagos de suscripción los procesa Stripe. Nosotros no
          almacenamos el número completo de tu tarjeta.
        </li>
        <li className="mb-1">
          <strong>Datos técnicos y de mercadeo:</strong> dirección IP, tipo de dispositivo y navegador, y
          cookies o identificadores (incluidas cookies de Meta, ver sección 4).
        </li>
        <li className="mb-1">
          <strong>Comunicaciones:</strong> los correos que nos escribes a soporte.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">2. Cómo usamos tu información</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">Para operar el Servicio: mostrarte tus gastos, metas, alertas, facturas y reportes.</li>
        <li className="mb-1">Para que VICTOR te dé recomendaciones y respuestas relevantes a tu situación.</li>
        <li className="mb-1">Para categorizar transacciones y generar reportes financieros.</li>
        <li className="mb-1">Para cobrar tu suscripción y gestionar tu plan.</li>
        <li className="mb-1">
          Para enviarte correos sobre tu cuenta (avisos de servicio, facturación, vencimientos de tu plan)
          y, si te registraste en el plan gratis, correos con guías y consejos sobre el producto. Puedes
          darte de baja de los correos de mercadeo con el enlace al pie de cada uno.
        </li>
        <li className="mb-1">Para medir y mejorar nuestra publicidad (ver sección 4).</li>
        <li className="mb-1">Para prevenir fraude, abuso y garantizar la seguridad del Servicio.</li>
      </ul>
      <p className="mb-4">
        <strong>No vendemos tu información personal ni financiera.</strong> No compartimos tus datos
        financieros (transacciones, balances, facturas, documentos) con redes de publicidad.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">3. Con quién compartimos información</h2>
      <p className="mb-2">
        Usamos proveedores para operar el Servicio, cada uno con acceso limitado a lo que necesita:
      </p>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1"><strong>Plaid Inc.</strong> — conexión segura con tu banco.</li>
        <li className="mb-1"><strong>Supabase</strong> — base de datos y autenticación.</li>
        <li className="mb-1"><strong>Cloudflare (R2)</strong> — almacenamiento de documentos, estados de cuenta y logos.</li>
        <li className="mb-1">
          <strong>Anthropic</strong> — modelo de inteligencia artificial detrás de VICTOR. Cuando le
          escribes a VICTOR, o subes un estado de cuenta en PDF para extraer sus movimientos, el contenido
          necesario se envía a Anthropic para generar la respuesta.
        </li>
        <li className="mb-1"><strong>Stripe</strong> — procesamiento de pagos y suscripciones.</li>
        <li className="mb-1"><strong>Resend</strong> — envío y recepción de correos (incluido soporte).</li>
        <li className="mb-1"><strong>Vercel</strong> — hospedaje de la aplicación.</li>
        <li className="mb-1"><strong>Meta Platforms</strong> — medición de publicidad (ver sección 4).</li>
      </ul>
      <p className="mb-4">
        Solo compartimos lo mínimo necesario con cada uno, y están sujetos a sus propias obligaciones de
        seguridad y confidencialidad. También podemos divulgar información si una ley u orden legal nos lo
        exige, o para proteger nuestros derechos y la seguridad de los usuarios.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">4. Publicidad y cookies (Meta)</h2>
      <p className="mb-4">
        Usamos el Píxel de Meta en nuestro sitio y en la página de registro, y enviamos a Meta algunos
        eventos de conversión (por ejemplo, cuando alguien se registra o inicia una suscripción) para medir
        el rendimiento de nuestros anuncios. Para esto podemos enviar a Meta tu correo electrónico y
        teléfono en formato cifrado (hash), tu dirección IP, el tipo de navegador y los identificadores de
        las cookies de Meta. <strong>No enviamos a Meta tus transacciones, balances, facturas ni documentos.</strong>{" "}
        Puedes controlar esto desde la configuración de anuncios de tu cuenta de Meta, bloqueando las
        cookies en tu navegador, o escribiéndonos para que dejemos de enviar eventos asociados a tu correo.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">5. Quién más puede ver tus datos dentro del Servicio</h2>
      <p className="mb-2">
        Tú controlas quién tiene acceso a tu cuenta. Estas son las personas que puedes autorizar:
      </p>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">
          <strong>Tu contable:</strong> si invitas a un contable (CPA o no), podrá ver la información de tu
          negocio que el Portal Contable le muestra (facturación, pagos, reportes, documentos de
          contratistas, alertas fiscales, entre otros). Si ese contable invitó a otros colegas a su equipo,
          estos también podrán verla. Puedes revocar el acceso en cualquier momento.
        </li>
        <li className="mb-1">
          <strong>Firma de contadores (programa Firma Accountant):</strong> si te registras mediante la
          invitación de una firma, esa firma paga tu plan Business y es tu contable en el Servicio. La firma
          puede ver la información que su portal le muestre y gestionar si tu plan sigue incluido bajo su
          cuenta. Si la firma te libera, conservas tu cuenta y tus datos y tienes un periodo de 30 días para
          continuar con tu propio plan; pasado ese periodo sin plan, tu cuenta pasa al plan gratis. Tus
          datos no se borran.
        </li>
        <li className="mb-1">
          <strong>Administrador o secretaria:</strong> las personas que invites con esos roles ven y
          operan lo que el permiso que les des permita.
        </li>
        <li className="mb-1">
          <strong>Técnicos:</strong> acceden con un PIN a las visitas, facturas y cotizaciones que les
          asignes.
        </li>
      </ul>
      <p className="mb-4">
        Cada persona que invitas actúa bajo tu autorización. Eres responsable de decidir a quién das
        acceso. El comunicarte con tu contable por correo electrónico fuera del Servicio queda fuera de
        nuestro control: esos mensajes viajan por el proveedor de correo de cada uno, no por VICTOR.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">6. Cómo protegemos tu información</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">La conexión entre tu navegador y nuestros servidores va cifrada (HTTPS).</li>
        <li className="mb-1">
          El token de acceso de tu banco (lo que nos permite pedirle datos a Plaid en tu nombre) y los datos
          bancarios de contratistas que ingreses para pagos se guardan cifrados.
        </li>
        <li className="mb-1">
          Cada usuario solo puede ver sus propios datos, aplicado a nivel de base de datos (Row Level
          Security), no solo en la aplicación. El acceso de contables y equipos está limitado por reglas
          específicas.
        </li>
        <li className="mb-1">
          Ofrecemos verificación en dos pasos (MFA), un PIN de bloqueo y cierre de sesión por inactividad.
        </li>
        <li className="mb-1">
          Tenemos un plan interno de respuesta a incidentes de seguridad (ver sección 9).
        </li>
      </ul>
      <p className="mb-4">
        Ningún sistema es 100% seguro. Te recomendamos usar una contraseña única, activar la verificación en
        dos pasos y revisar periódicamente quién tiene acceso a tu cuenta.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">7. Tus derechos y cómo ejercerlos</h2>
      <p className="mb-4">
        Puedes desconectar cualquier cuenta bancaria desde &quot;Cuentas&quot;, revocar el acceso de tu contable
        o de cualquier persona que hayas invitado, y eliminar tu cuenta desde Configuración. También puedes
        pedirnos acceso, corrección, copia o eliminación de tu información escribiendo a{" "}
        <a href="mailto:info@westcapitalventuresllc.com" className="text-teal-700 underline">
          info@westcapitalventuresllc.com
        </a>
        . Respondemos a estas solicitudes dentro de un plazo razonable, normalmente en 30 días.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">8. Retención y eliminación</h2>
      <p className="mb-4">
        Conservamos tu información mientras tu cuenta esté activa. Cuando eliminas tu cuenta, queda
        programada para eliminación definitiva a los 30 días (tiempo en el que puedes arrepentirte y
        recuperarla). Pasado ese plazo borramos tu información personal y financiera de nuestros sistemas.
        Es posible que copias de seguridad de nuestros proveedores conserven datos por un periodo limitado
        hasta que se sobrescriban, y que debamos conservar cierta información que la ley nos exija
        (por ejemplo, registros de facturación y pagos de tu suscripción). Si una firma de contadores te
        libera de su plan, tu cuenta y tus datos no se eliminan.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">9. Incidentes de seguridad</h2>
      <p className="mb-4">
        Si ocurre un incidente que comprometa tu información personal, investigaremos de inmediato,
        tomaremos medidas para contenerlo y te lo notificaremos sin demora injustificada, y a las autoridades
        cuando la ley lo requiera, indicando qué ocurrió, qué datos se vieron afectados y qué puedes hacer.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">10. Menores de edad</h2>
      <p className="mb-4">
        El Servicio es para personas de 18 años o más. No recopilamos a sabiendas información de menores.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">11. Transferencia y ubicación de los datos</h2>
      <p className="mb-4">
        Nuestros proveedores pueden procesar y almacenar datos en servidores ubicados en Estados Unidos u
        otros países. Al usar el Servicio, aceptas ese tratamiento bajo las protecciones descritas aquí.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">12. Cambios a esta política</h2>
      <p className="mb-4">
        Si hacemos cambios importantes, te lo notificaremos por correo o dentro de la aplicación antes de
        que entren en vigor, y actualizaremos la fecha al inicio de esta página.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">13. Contacto</h2>
      <p className="mb-4">
        West Capital Ventures LLC — Puerto Rico.{" "}
        <a href="mailto:info@westcapitalventuresllc.com" className="text-teal-700 underline">
          info@westcapitalventuresllc.com
        </a>
      </p>
    </div>
  );
}
