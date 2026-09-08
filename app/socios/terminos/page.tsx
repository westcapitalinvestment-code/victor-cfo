// Borrador razonable para arrancar (mismo criterio que app/terminos/page.tsx)
// — NO sustituye revisión de un abogado. A diferencia del referido
// peer-to-peer (que es solo un cliente recomendando a un amigo, cubierto
// por el T&S general), el Programa de Socios es una relación comercial con
// terceros que no necesariamente son clientes, pagada en efectivo real —
// eso amerita su propio documento, más parecido a un contrato de afiliado
// que a un simple términos de uso. Antes de escalar el programa a volumen
// real, un abogado de PR/EE.UU. debe revisar esto, sobre todo la
// clasificación de contratista independiente y las cláusulas de fraude.
//
// 8 sept 2026 — ampliado de 13 a 17 secciones tras una segunda revisión
// (Joel pidió una opinión externa que devolvió gaps concretos, validados
// contra lo que ya habíamos señalado nosotros): se añadió disclosure
// obligatorio de relación comercial (regla FTC de endorsements — sin
// esto, un influencer podría promocionar sin decir que le pagan), reglas
// de atribución de referido (qué pasa si dos Socios reclaman al mismo
// cliente, cliente que ya existía, cancela y vuelve, etc.), lista
// explícita de canales prohibidos, sección de uso de marca, y restricción
// de claims financieros no autorizados. La Sección 7 (Impuestos) se
// suavizó a propósito — el 10%/$500 de la Sec. 1062.03 es el caso general
// de un individuo, pero la retención/informativa real varía según si el
// Socio es individuo, corporación, LLC, o residente/no residente; eso
// necesita validación de un CPA o abogado contributivo de PR antes de
// afirmarlo como regla fija para TODOS los tipos de Socio.
export default function TerminosSociosPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm leading-relaxed text-[#1a1a1a]">
      <h1 className="mb-1 text-xl font-semibold">Términos del Programa de Socios — VICTOR CFO</h1>
      <p className="mb-6 text-xs text-gray-500">Última actualización: 8 de septiembre de 2026</p>

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
        Es un programa de referidos con comisión real para CPAs, contadores, influencers y cualquier persona en
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
        que no corresponden a una recomendación real — eso se considera fraude (ver Sección 9).
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">5. Qué cuenta como un referido válido</h2>
      <p className="mb-4">
        Un referido es válido cuando el código o link del Socio queda asociado al registro de un cliente
        nuevo que no tenía cuenta previa en VICTOR CFO, y esa persona paga su primera factura real. Casos
        específicos:
      </p>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">
          Si la persona ya tenía una cuenta en VICTOR CFO (activa, cancelada, o en plan gratis) antes de usar
          el código, no genera comisión — no se puede &quot;referir&quot; a un cliente existente.
        </li>
        <li className="mb-1">
          <strong>Regla de primera atribución:</strong> si más de un Socio reclama al mismo cliente (mismo
          código usado dos veces, o dos códigos distintos asociados al mismo email, tarjeta, o cuenta), la
          comisión corresponde al PRIMER código válidamente asociado al registro de ese cliente, según los
          registros de WCV. WCV tiene la última palabra sobre a cuál Socio corresponde una comisión en caso
          de disputa.
        </li>
        <li className="mb-1">
          Si el cliente cancela su plan y vuelve a suscribirse más adelante, esa segunda suscripción no
          genera una comisión nueva para ningún Socio, salvo que WCV decida lo contrario a su discreción.
        </li>
        <li className="mb-1">
          Cuentas corporativas o de negocio con varios usuarios (por ejemplo, Admin/Secretaria o técnicos
          invitados a una cuenta) cuentan como UN solo cliente referido — el dueño de la cuenta que pagó, no
          cada persona invitada.
        </li>
        <li className="mb-1">
          WCV puede investigar cualquier registro que parezca fraudulento o manipulado (cuentas duplicadas,
          tarjetas repetidas, patrones anómalos) y negar o revertir la comisión correspondiente mientras dure
          esa investigación.
        </li>
      </ul>

      <h2 className="mb-2 mt-6 text-base font-semibold">6. Pago</h2>
      <p className="mb-4">
        El pago se hace por transferencia ACH a la cuenta bancaria que nos proporciones. No podemos procesar
        tu pago hasta que completes esa información de forma segura en el link que te enviamos al ser
        aprobado. Los pagos se procesan manualmente, en un plazo razonable después de que la comisión quede
        registrada — no operamos con una fecha de pago automática ni recurrente.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">7. Impuestos</h2>
      <p className="mb-4">
        Eres responsable de reportar y pagar cualquier impuesto que corresponda sobre las comisiones que
        recibas, independientemente de si WCV te emite o no un formulario informativo. Como referencia
        general para individuos residentes de Puerto Rico, la Sección 1062.03 del Código de Rentas Internas
        exime de retención e informativa los primeros $500 pagados en un año calendario, y prevé una
        retención del 10% sobre el exceso salvo que se presente un Certificado de Relevo de Retención vigente
        emitido por Hacienda.
      </p>
      <p className="mb-4">
        <strong>
          El tratamiento contributivo exacto depende de tu situación particular — si eres individuo,
          corporación, LLC, u otra entidad, y si eres residente o no residente de Puerto Rico — y puede
          variar del resumen general de arriba.
        </strong>{" "}
        WCV puede pedirte información contributiva adicional (como tu número de Seguro Social, EIN, o el
        formulario correspondiente a tu tipo de entidad) para determinar la retención e informativa que
        realmente aplica a tu caso antes de procesar tu primer pago. Este resumen es informativo, no consejo
        contributivo — confirma tu situación específica con tu CPA o asesor contributivo.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">8. Disclosure de relación comercial</h2>
      <p className="mb-4">
        Cuando promociones VICTOR CFO y tengas derecho a recibir una comisión por esa promoción, debes
        revelar de forma clara y visible tu relación comercial con WCV/VICTOR CFO, de conformidad con las
        leyes y guías aplicables sobre publicidad y endorsements (incluyendo las guías de la Federal Trade
        Commission sobre divulgación de relaciones materiales). No puedes ocultar, minimizar, ni presentar
        como una recomendación completamente independiente algo por lo cual recibes compensación. Esto aplica
        especialmente si promocionas VICTOR CFO en redes sociales, contenido pagado, o cualquier medio
        público.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">9. Conducta prohibida</h2>
      <p className="mb-4">No puedes:</p>
      <ul className="mb-4 list-disc pl-5">
        <li className="mb-1">
          Presentarte como empleado, representante oficial, o socio de negocio de WCV o VICTOR CFO.
        </li>
        <li className="mb-1">Hacer afirmaciones falsas o engañosas sobre el producto, sus precios, o sus resultados.</li>
        <li className="mb-1">
          Usar spam, correos masivos no solicitados, mensajes de texto (SMS) masivos, o llamadas
          automatizadas para promocionar VICTOR CFO.
        </li>
        <li className="mb-1">
          Comprar anuncios pagados (Google Ads, Meta/Facebook/Instagram Ads, TikTok Ads, Bing/Microsoft Ads,
          u otra plataforma) que hagan bidding sobre la marca &quot;VICTOR CFO&quot; o &quot;West Capital
          Ventures&quot; sin permiso escrito de WCV.
        </li>
        <li className="mb-1">
          Registrar o usar dominios, páginas web, perfiles de redes sociales, o cuentas que puedan crear
          confusión sobre si eres VICTOR CFO o WCV, o que imiten su apariencia oficial.
        </li>
        <li className="mb-1">Crear cuentas fraudulentas, duplicadas, o de terceros sin su consentimiento para generar comisiones falsas.</li>
        <li className="mb-1">Cualquier otra táctica engañosa para conseguir referidos.</li>
      </ul>
      <p className="mb-4">
        Violar esta sección puede resultar en suspensión inmediata y la pérdida de comisiones pendientes
        relacionadas con la conducta prohibida.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">10. Uso de marca</h2>
      <p className="mb-4">
        WCV puede darte logos, nombre, y materiales de mercadeo para promocionar el programa. Solo puedes
        usarlos exactamente como se te proporcionan, sin modificar el logo ni el nombre, y únicamente para
        promocionar VICTOR CFO — no para ningún otro propósito. WCV puede retirar este permiso en cualquier
        momento, y al retirarlo debes dejar de usar esos materiales.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">11. Afirmaciones sobre resultados financieros</h2>
      <p className="mb-4">
        Al promocionar VICTOR CFO, solo puedes usar los claims y materiales que WCV apruebe. No puedes
        prometer ni insinuar resultados financieros específicos que el producto no garantiza — por ejemplo,
        montos de ahorro garantizados, eliminación de deudas, aprobación garantizada de algún producto
        financiero, mejora garantizada de crédito, o reembolsos gubernamentales. VICTOR CFO es una
        herramienta de organización financiera con apoyo de inteligencia artificial — no es un asesor
        financiero, contable, ni legal licenciado (ver Términos de Servicio, Sección 1).
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">12. No exclusividad</h2>
      <p className="mb-4">
        Puedes promocionar otros productos o servicios, incluyendo de la competencia, mientras participas en
        este programa. No te pedimos exclusividad.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">13. Terminación</h2>
      <p className="mb-4">
        Puedes dejar de participar cuando quieras, avisándonos. WCV puede suspender o terminar tu
        participación en cualquier momento, con o sin causa. Si terminamos tu participación sin que haya
        fraude de por medio, honramos las comisiones ya ganadas por clientes reales que ya hayan pagado antes
        de la terminación.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">14. Cambios al programa</h2>
      <p className="mb-4">
        Podemos cambiar los montos de comisión, las reglas, o descontinuar el programa en cualquier momento,
        avisándote con anticipación razonable. Los cambios aplican hacia adelante — nunca reducen una
        comisión que ya ganaste antes del cambio.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">15. Sin garantía de ingresos</h2>
      <p className="mb-4">
        Este programa no garantiza ningún nivel de ingreso. Cuántos referidos traigas, y cuánto ganes,
        depende enteramente de tu propio esfuerzo — no hacemos promesas sobre resultados.
      </p>

      <h2 className="mb-2 mt-6 text-base font-semibold">16. Ley aplicable</h2>
      <p className="mb-4">Estos términos se rigen por las leyes del Estado Libre Asociado de Puerto Rico.</p>

      <h2 className="mb-2 mt-6 text-base font-semibold">17. Contacto</h2>
      <p className="mb-4">
        West Capital Ventures LLC — Puerto Rico.{" "}
        <a href="mailto:info@westcapitalventuresllc.com" className="text-teal-700 underline">
          info@westcapitalventuresllc.com
        </a>
      </p>
    </div>
  );
}
