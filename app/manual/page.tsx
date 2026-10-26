import ManualViewer from "../dashboard/manual/manual-viewer";

export const metadata = { title: "Manual de Usuario · VICTOR CFO" };

// Versión pública del Manual de Usuario (sin login): es la de los usuarios (el manual de vendedores es aparte: /socios/manual)
// vendedores y socios (que entran al portal con código + PIN, no con cuenta de
// VICTOR) y cualquiera a quien se le mande el link. El contenido es el mismo
// de /dashboard/manual y es estático (lib/manual-usuario.ts), sin datos del
// usuario.
export default function ManualPublicoPage() {
  return (
    <div className="min-h-screen bg-bg">
      <ManualViewer />
    </div>
  );
}
