import TecnicoApp from "./tecnico-app";

// Ruta PÚBLICA a nivel raíz (fuera de /dashboard a propósito) — el técnico
// entra por victorcfo.com/tecnico?t=<access_token>, nunca inicia sesión con
// Supabase (ver migración 0003 y lib/tecnico-session.ts). Por eso esta
// página no pasa por app/dashboard/layout.tsx (que asume un usuario
// autenticado) ni por PinGate/Topbar/BottomNav.
export default function TecnicoPage({ searchParams }: { searchParams: { t?: string } }) {
  return <TecnicoApp token={searchParams.t ?? ""} />;
}
