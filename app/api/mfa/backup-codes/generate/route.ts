import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generarCodigosDeRespaldo, hashCodigoRespaldo } from "@/lib/mfa-backup-codes";

// Genera un set nuevo de 10 códigos de respaldo — se llama justo después de
// verificar el primer código TOTP al activar MFA (ver mfa-config.tsx), y
// nunca más se le vuelven a mostrar en claro al usuario después de este
// momento (solo quedan los hashes guardados). Si el usuario ya tenía
// códigos de una activación anterior, se reemplazan todos — no tiene
// sentido mezclar códigos viejos que el usuario ya no tiene apuntados con
// los nuevos.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

  const codigos = generarCodigosDeRespaldo(10);
  const filas = codigos.map((codigo) => ({ user_id: user.id, code_hash: hashCodigoRespaldo(codigo) }));

  // Fuera con los viejos antes de meter los nuevos (RLS ya limita esto a
  // las filas del propio usuario).
  await supabase.from("mfa_backup_codes").delete().eq("user_id", user.id);

  const { error } = await supabase.from("mfa_backup_codes").insert(filas);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ codigos });
}
