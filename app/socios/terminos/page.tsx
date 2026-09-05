// Borrador razonable para arrancar (mismo criterio que app/terminos/page.tsx)
// — NO sustituye revisión de un abogado. A diferencia del referido
// peer-to-peer (que es solo un cliente recomendando a un amigo, cubierto
// por el T&S general), el Programa de Socios es una relación comercial con
// terceros que no necesariamente son clientes, pagada en efectivo real —
// eso amerita su propio documento, más parecido a un contrato de afiliado
// que a un simple términos de uso. Antes de escalar el programa a volumen
// real, un abogado de PR/EE.UU. debe revisar esto, sobre todo la
// clasificación de contratista independiente y las cláusulas de fraude.
export default function TerminosSociosPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">Términos del Programa de Socios — VICTOR CFO</h1>
      <p className="mb-6 text-xs text-gray-500">Última actualización: 5 de septiembre de 2026</p>

      <p className="mb-4">
        Estos términos rigen tu participación como &quot;Socio&quot; en el Programa de Socios de VICTOR CFO,
        operado por West Capital Ventures LLC (&quot;WCV&quot;, &quot;nosotros&quot;). Aplican además de —no en
        lugar de— los{" "}
        <a href="/terminos" className="text-teal-700 underline">
          Términos de Servicio
        </a>{" "}
        generales, si además usas VICTOR CFO como cliente. Al enviar tu solicitud, aceptas estos términos.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">1. Qué es el Programa de Socios</h2>
      <p className="mb-4">
        Es un programa de referidos en efectivo para CPAs, contadores, influencers y cualquier persona en
        Puerto Rico que quiera recomendar VICTOR CFO. No requiere que seas cliente de VICTOR CFO. Al ser
        aprobado, recibes un código único para compartir; cuando alguien se registra con tu código y empieza
        a pagar de verdad, ganas una comisión.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">2. Eres un contratista independiente</h2>
      <p className="mb-4">
        Participar en este programa no te convierte en empleado, representante legal, ni socio de negocio de
        WCV. Eres un contratista independiente: decides cómo y cuándo promocionas VICTOR CFO, no recibes
        beneficios de empleado, y no tienes autoridad para actuar en nombre de WCV ni de VICTOR CFO frente a
        terceros.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">3. Aplicación y aprobación</h2>
      <p className="mb-4">
        Tu solicitud queda pendiente hasta que WCV la revise. Aprobar o rechazar una solicitud, y suspender a
        un Socio ya aprobado, queda a la entera discreción de WCV — no estamos obligados a aceptar ni a
        mantener a ningún Socio en el programa.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">4. Cómo se gana la comisión</h2>
      <p className="mb-4">
        Ganas una comisión fija en efectivo cuando alguien que se registró con tu código empieza a pagar de
        verdad su plan — el monto exacto varía según el plan al que entró esa persona, y te lo confirmamos
        directamente al aprobar tu solicitud. La comisión se gana UNA sola vez por cada cliente (no en
        renovaciones futuras de esa misma persona), y solo después de que esa persona haya pagado su primera
        factura real — no durante ningún período de prueba gratis. No hay límite de cuántos clientes puedes
        referir ni de cuánto puedes ganar en total.
      </p>
      <p className="mb-4">
        Referirte a ti mismo como tu propio primer cliente está permitido. Lo que no está permitido es crear
        cuentas falsas, duplicadas, o de terceros que no consintieron, con el propósito de generar comisiones
        que no corresponden a una recomendación real — eso se considera fraude (ver Sección 7).
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">5. Pago</h2>
      <p className="mb-4">
        El pago se hace por transferencia ACH a la cuenta bancaria que nos proporciones. No podemos procesar
        tu pago hasta que completes esa información de forma segura en el link que te enviamos al ser
        aprobado. Los pagos se procesan manualmente, en un plazo razonable después de que la comisión quede
        registrada — no operamos con una fecha de pago automática ni recurrente.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">6. Impuestos</h2>
      <p className="mb-4">
        Eres responsable de reportar y pagar cualquier impuesto que corresponda sobre las comisiones que
        recibas, independientemente de si WCV te emite o no un formulario informativo (como una 480.6 o un
        1099). Bajo la ley de Puerto Rico vigente (Sección 1062.03 del Código de Rentas Internas), los
        primeros $500 que te paguemos en un año calendario no están sujetos a retención ni a informativa; si
        tus comisiones acumuladas ese año superan los $500, WCV radica la informativa correspondiente y
        retiene el 10% sobre el exceso de esos primeros $500 — salvo que nos presentes un Certificado de
        Relevo de Retención vigente emitido por Hacienda. Podemos pedirte información contributiva adicional
        (como tu número de Seguro Social o EIN) para cumplir con esa obligación.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">7. Conducta prohibida</h2>
      <p className="mb-4">
        No puedes: presentarte como empleado, representante oficial, o socio de negocio de WCV o VICTOR CFO;
        hacer afirmaciones falsas o engañosas sobre el producto, sus precios, o sus resultados; usar spam,
        anuncios pagados que hagan bidding sobre la marca &quot;VICTOR CFO&quot; sin permiso escrito, o
        cualquier otra táctica engañosa para conseguir referidos; ni crear cuentas fraudulentas para generar
        comisiones falsas. Violar esta sección puede resultar en suspensión inmediata y la pérdida de
        comisiones pendientes relacionadas con la conducta fraudulenta.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">8. No exclusividad</h2>
      <p className="mb-4">
        Puedes promocionar otros productos o servicios, incluyendo de la competencia, mientras participas en
        este programa. No te pedimos exclusividad.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">9. Terminación</h2>
      <p className="mb-4">
        Puedes dejar de participar cuando quieras, avisándonos. WCV puede suspender o terminar tu
        participación en cualquier momento, con o sin causa. Si terminamos tu participación sin que haya
        fraude de por medio, honramos las comisiones ya ganadas por clientes reales que ya hayan pagado antes
        de la terminación.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">10. Cambios al programa</h2>
      <p className="mb-4">
        Podemos cambiar los montos de comisión, las reglas, o descontinuar el programa en cualquier momento,
        avisándote con anticipación razonable. Los cambios aplican hacia adelante — nunca reducen una
        comisión que ya ganaste antes del cambio.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">11. Sin garantía de ingresos</h2>
      <p className="mb-4">
        Este programa no garantiza ningún nivel de ingreso. Cuántos referidos traigas, y cuánto ganes,
        depende enteramente de tu propio esfuerzo — no hacemos promesas sobre resultados.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">12. Ley aplicable</h2>
      <p className="mb-4">Estos términos se rigen por las leyes del Estado Libre Asociado de Puerto Rico.</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">13. Contacto</h2>
      <p className="mb-4">
        West Capital Ventures LLC — Puerto Rico.{" "}
        <a href="mailto:dr.jvalentin@gmail.com" className="text-teal-700 underline">
          dr.jvalentin@gmail.com
        </a>
      </p>
    </div>
  );
}
