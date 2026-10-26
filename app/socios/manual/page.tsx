import ManualViewer from "../../dashboard/manual/manual-viewer";
import { GRUPOS_VENDEDOR, MODULOS_VENDEDOR } from "@/lib/manual-vendedor";
import type { ModuloManual } from "@/lib/manual-usuario";

export const metadata = {
  title: "Manual del vendedor · VICTOR CFO",
  robots: { index: false, follow: false },
};

// Manual interno del vendedor/socio. Se abre desde el botón "Manual" del
// portal del vendedor (/socios/portal). No aparece en el Manual de Usuario.
export default function ManualVendedorPage() {
  return (
    <div className="min-h-screen bg-bg">
      <ManualViewer
        modulos={MODULOS_VENDEDOR as unknown as ModuloManual[]}
        grupos={GRUPOS_VENDEDOR as unknown as readonly string[]}
        titulo="Manual del vendedor"
        subtitulo="Uso interno: portal, prospectos, comisiones y programa de socios."
        fotos={false}
      />
    </div>
  );
}
