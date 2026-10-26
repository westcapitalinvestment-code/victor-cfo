import ManualViewer from "../../dashboard/manual/manual-viewer";
import { GRUPOS_CONTABLE, MODULOS_CONTABLE } from "@/lib/manual-contable";

export const metadata = {
  title: "Manual del contable · VICTOR CFO",
  robots: { index: false, follow: false },
};

// Manual del Portal del Contable. Se abre desde el botón "Manual" del portal.
export default function ManualContablePage() {
  return (
    <div className="min-h-screen bg-bg">
      <ManualViewer
        modulos={MODULOS_CONTABLE}
        grupos={GRUPOS_CONTABLE as unknown as readonly string[]}
        titulo="Manual del contable"
        subtitulo="Guía del portal: clientes, pestañas de cada entidad, tu equipo y tu perfil."
        fotos={false}
      />
    </div>
  );
}
