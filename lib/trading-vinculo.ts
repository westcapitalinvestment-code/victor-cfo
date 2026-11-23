import { randomBytes, randomInt } from "crypto";

// Vincular el guardián con un código de 6 dígitos (23 nov 2026). Lo usan
// /api/trading/sync (el guardián pide su código o recoge su token) y
// /api/trading/vincular (la persona escribe el código en la web).

type Admin = ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>;

const MIN_VIGENCIA = 30;

export function nuevoTokenSync(): string {
  return randomBytes(24).toString("hex");
}

// Guardián sin token: devuelve su código (o su token, si ya lo confirmaron en la web).
export async function pedirVinculo(
  admin: Admin,
  datos: { install: string; login: string; servidor: string },
): Promise<{ codigo?: string; token?: string; error?: string }> {
  const { install, login, servidor } = datos;
  if (!/^[A-Za-z0-9]{16,64}$/.test(install) || !/^\d{1,20}$/.test(login)) return { error: "Datos inválidos." };
  const ahora = new Date();
  const { data: filas } = await admin
    .from("trading_vinculos")
    .select("id, codigo, token, expires_at")
    .eq("install", install)
    .eq("login", login)
    .order("created_at", { ascending: false })
    .limit(1);
  const v = filas?.[0];
  if (v?.token) {
    // Se entrega una sola vez: el guardián lo guarda en su archivo.
    await admin.from("trading_vinculos").delete().eq("id", v.id);
    return { token: v.token };
  }
  if (v && new Date(v.expires_at) > ahora) return { codigo: v.codigo };

  for (let i = 0; i < 8; i++) {
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { data: usado } = await admin
      .from("trading_vinculos")
      .select("id")
      .eq("codigo", codigo)
      .is("token", null)
      .gt("expires_at", ahora.toISOString())
      .limit(1);
    if (usado?.length) continue;
    const { error } = await admin.from("trading_vinculos").insert({
      install,
      login,
      servidor: servidor.slice(0, 80),
      codigo,
      expires_at: new Date(ahora.getTime() + MIN_VIGENCIA * 60_000).toISOString(),
    });
    if (error) return { error: "No se pudo crear el código." };
    return { codigo };
  }
  return { error: "No se pudo crear el código." };
}
