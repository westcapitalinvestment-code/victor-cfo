import Link from "next/link";

// Recordatorio para usuarios con hijos (4 nov 2026, pedido de Joel: "que si la
// persona tiene hijos registrados en Victor le pueda recordar la planilla o los
// beneficios que hay para sus hijos"). Cero IA: se muestra si el usuario dijo
// que tiene hijos en el onboarding y no marcó residencia en EE.UU. en
// "Impuestos estimados". Es orientación, no asesoría: nunca promete montos ni
// elegibilidad; siempre remite al contable.
export default function FamiliaPlanillaCard({ mes, detalle }: { mes: number; detalle: string | null }) {
  // mes: 1-12 (hora de PR)
  const temporada = mes >= 1 && mes <= 6 ? "planilla" : mes >= 11 ? "cierre" : "general";
  const titulo =
    temporada === "planilla"
      ? "Es temporada de planillas — y tienes hijos"
      : temporada === "cierre"
        ? "Antes de que cierre el año: tus hijos y la planilla"
        : "Beneficios para tus hijos";
  const cuerpo =
    temporada === "planilla"
      ? "Pregúntale a tu contable por los créditos y deducciones por hijos o dependientes. Las familias de Puerto Rico con hijos menores de 17 pueden tener derecho a un crédito federal reembolsable (el ACTC, mediante el Formulario 1040-SS)."
      : temporada === "cierre"
        ? "Ve reuniendo ahora lo que tu contable te va a pedir: el número de Seguro Social de cada hijo, sus fechas de nacimiento y tus ingresos del año. Así la planilla no te agarra corriendo."
        : "Las familias con hijos pueden tener créditos y deducciones en la planilla (incluido un crédito federal reembolsable por hijos menores de 17). Tenlo presente y confírmalo con tu contable.";

  return (
    <div className="vc-card mb-3 !p-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden style={{ fontSize: 14 }}>👨‍👩‍👧</span>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{titulo}</p>
      </div>
      <div className="p-4">
        <p className="text-xs text-text">{cuerpo}</p>
        {detalle && <p className="mt-1.5 text-[11px] text-muted">Hijos registrados: {detalle}</p>}
        <p className="mt-2 text-[11px] text-muted">
          Es orientación general, no asesoría: tu contable confirma si te aplica. Si eres trabajador por cuenta propia, baja tu hoja de{" "}
          <Link href="/dashboard/negocio/estado-resultados" className="font-medium text-teal">Self-employment</Link> y compártesela.
        </p>
      </div>
    </div>
  );
}
