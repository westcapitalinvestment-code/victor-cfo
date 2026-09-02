import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hashPin } from "@/lib/pin";

// Fija/cambia el PIN de un técnico desde el dashboard del dueño. hashPin
// (lib/pin.ts) usa Node "crypto", así que no se puede llamar desde el
// cliente (equipo-portal.tsx) directamente — de ahí esta ruta chiquita.
// Usa el cliente normal (con la sesión del dueño, no Service Role), así que
// RLS (technicians_owner_admin_write) es quien de verdad decide si puede
// tocar ese técnico — esta ruta no repite esa validación por su cuenta.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const technicianId = typeof body?.technicianId === "string" ? body.technicianId : "";
  const pin = typeof body?.pin === "string" ? body.pin : "";

  if (!technicianId || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN inválido — debe ser de 4 dígitos." }, { status: 400 });
  }

  const { error } = await supabase.from("technicians").update({ pin_hash: hashPin(pin, technicianId) }).eq("id", technicianId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
