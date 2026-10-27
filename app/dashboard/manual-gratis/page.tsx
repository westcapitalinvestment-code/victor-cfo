import ManualViewer from "../manual/manual-viewer";
import { GRUPOS_GRATIS, MODULOS_GRATIS } from "@/lib/manual-gratis";

export const metadata = { title: "Manual del plan Gratis · VICTOR CFO" };

// Manual del plan Gratis (26 oct 2026): contenido estático (lib/manual-gratis.ts).
export default function ManualGratisPage() {
  return (
    <ManualViewer
      modulos={MODULOS_GRATIS}
      grupos={GRUPOS_GRATIS}
      titulo="Manual del plan Gratis"
      subtitulo="Cómo usar VICTOR CFO paso a paso, tocando las tarjetas de tu inicio."
      fotos={false}
      volver={{ href: "/dashboard", label: "Volver al inicio" }}
      pie="¿Algo no te quedó claro? Escríbenos a soporte@victorcfo.com y te contestamos."
    />
  );
}
