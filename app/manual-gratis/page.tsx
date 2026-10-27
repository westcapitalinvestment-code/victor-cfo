import ManualViewer from "../dashboard/manual/manual-viewer";
import { GRUPOS_GRATIS, MODULOS_GRATIS } from "@/lib/manual-gratis";

export const metadata = { title: "Manual del plan Gratis · VICTOR CFO" };

// Versión pública (sin login) del manual del plan Gratis, para mandar el link.
export default function ManualGratisPublicoPage() {
  return (
    <div className="min-h-screen bg-bg">
      <ManualViewer
        modulos={MODULOS_GRATIS}
        grupos={GRUPOS_GRATIS}
        titulo="Manual del plan Gratis"
        subtitulo="Cómo usar VICTOR CFO paso a paso, tocando las tarjetas de tu inicio."
        fotos={false}
        volver={{ href: "/", label: "Ir a VICTOR CFO" }}
        pie="¿Algo no te quedó claro? Escríbenos a soporte@victorcfo.com y te contestamos."
      />
    </div>
  );
}
