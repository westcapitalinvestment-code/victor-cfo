// Página pública "Seguridad y privacidad" (2 nov 2026, pedido de Joel: una
// esposa de un Dr. dijo "hay que tener cuidado con eso de la AI, que te roban
// tus datos"). Cada afirmación de aquí está respaldada por el código o por la
// Política de Privacidad (app/privacidad/page.tsx). Si algo del producto que
// toque datos cambia (proveedores, accesos, retención), actualizar ESTA página,
// la política y los dos prompts de VICTOR (lib/victor/system-prompt.txt y
// lib/victor/landing-system-prompt.ts) en el mismo commit.
// A propósito NO se afirma: certificaciones (SOC 2, etc.), "100% seguro", ni
// lo que hacen los proveedores con los datos más allá de lo que dice la política.
import Link from "next/link";

export const metadata = {
  title: "Seguridad y privacidad — VICTOR CFO",
  description: "Cómo VICTOR CFO protege tu información, qué ve la inteligencia artificial y qué control tienes tú.",
};

export default function SeguridadPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">Seguridad y privacidad</h1>
      <p className="mb-6 text-xs text-gray-500">Última actualización: 2 de noviembre de 2026</p>

      <p className="mb-4">
        Es normal preguntarse qué pasa con tus datos cuando una app usa inteligencia artificial. Aquí te
        explicamos, sin tecnicismos, qué hacemos y qué no hacemos con tu información financiera.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Lo esencial</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">
          <strong>No vendemos tu información</strong> personal ni financiera, y no la compartimos con redes de
          publicidad.
        </li>
        <li className="mb-1">
          <strong>Nunca vemos la contraseña de tu banco.</strong> La conexión la hace Plaid directamente con tu
          banco.
        </li>
        <li className="mb-1">
          <strong>Tú decides quién ve tus datos</strong> y puedes retirar ese acceso o borrar tu cuenta cuando
          quieras.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">Tu banco</h2>
      <p className="mb-4">
        Cuando conectas una cuenta, lo haces en la ventana de Plaid, el mismo servicio que usan muchas apps
        financieras en Estados Unidos. Tu usuario y contraseña del banco los recibe Plaid, no VICTOR. Nosotros
        solo recibimos los datos de la cuenta (balances y transacciones). El permiso que nos da acceso a esos
        datos se guarda cifrado en nuestra base de datos, con una llave que no vive en la base de datos. Puedes
        desconectar cualquier cuenta cuando quieras desde &quot;Cuentas&quot;.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">La inteligencia artificial</h2>
      <p className="mb-4">
        VICTOR funciona con un modelo de inteligencia artificial de Anthropic. Cuando le escribes a VICTOR, o subes
        un estado de cuenta en PDF para extraer sus movimientos, enviamos solo el contenido necesario para generar
        la respuesta. No usamos tus datos para anuncios ni los vendemos. Si no quieres que un documento pase por
        la inteligencia artificial, no lo subas como PDF: puedes llevar tus movimientos con un archivo CSV o Excel,
        o escribirlos tú mismo.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Cómo protegemos tu cuenta</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">La conexión entre tu navegador y nuestros servidores va cifrada (HTTPS).</li>
        <li className="mb-1">
          Cada usuario solo puede ver sus propios datos. Esto se aplica en la base de datos misma, no solo en la
          pantalla.
        </li>
        <li className="mb-1">
          Puedes activar verificación en dos pasos, usar un PIN de bloqueo y la sesión se cierra por inactividad.
        </li>
        <li className="mb-1">
          Los datos bancarios de contratistas que ingreses para pagos se guardan cifrados.
        </li>
        <li className="mb-1">
          Los pagos de suscripción los procesa Stripe. Nosotros no guardamos el número de tu tarjeta.
        </li>
        <li className="mb-1">
          No instalamos píxeles de seguimiento de publicidad en el sitio ni en la aplicación.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">Quién más puede ver tus datos</h2>
      <p className="mb-4">
        Solo las personas que tú invites: tu contable, un administrador o secretaria, o los técnicos de tu equipo,
        cada uno con el acceso que tú le des. Puedes revocarlo en cualquier momento. Cuando una firma de
        contadores paga tu plan, esa firma es tu contable en el servicio. Todo esto está explicado en la{" "}
        <Link href="/privacidad" className="text-teal-700 underline">
          Política de Privacidad
        </Link>
        .
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Tu control</h2>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">Desconectar tus bancos y revocar el acceso de cualquier persona que hayas invitado.</li>
        <li className="mb-1">
          Eliminar tu cuenta desde Configuración. Queda programada para eliminación definitiva a los 30 días y en
          ese tiempo puedes recuperarla.
        </li>
        <li className="mb-1">Pedirnos acceso, corrección, copia o eliminación de tu información por correo.</li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">Lo que sí te pedimos a ti</h2>
      <p className="mb-4">
        Ningún sistema es 100% seguro. Usa una contraseña única, activa la verificación en dos pasos y revisa de
        vez en cuando quién tiene acceso a tu cuenta. Si ocurriera un incidente que afecte tu información, te lo
        notificaremos sin demora injustificada.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">Preguntas</h2>
      <p className="mb-4">
        Escríbenos a{" "}
        <a href="mailto:soporte@victorcfo.com" className="text-teal-700 underline">
          soporte@victorcfo.com
        </a>
        . Para solicitudes sobre tus datos:{" "}
        <a href="mailto:info@westcapitalventuresllc.com" className="text-teal-700 underline">
          info@westcapitalventuresllc.com
        </a>
        .
      </p>

      <p className="mt-8 text-xs text-gray-500">
        VICTOR CFO es un producto de West Capital Ventures LLC — Puerto Rico.{" "}
        <Link href="/terminos" className="underline">
          Términos de Servicio
        </Link>
      </p>
    </div>
  );
}
