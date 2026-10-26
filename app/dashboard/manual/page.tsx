import ManualViewer from "./manual-viewer";

export const metadata = { title: "Manual de Usuario · VICTOR CFO" };

// Manual de Usuario (26 oct 2026): guías por módulo para usuarios y
// vendedores. Es contenido estático (lib/manual-usuario.ts); no lee datos del
// usuario. El layout del dashboard ya exige sesión.
export default function ManualPage() {
  return <ManualViewer />;
}
