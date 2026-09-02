import { NextResponse } from "next/server";
import { COOKIE_SESION_TECNICO } from "@/lib/tecnico-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION_TECNICO, "", { path: "/", maxAge: 0 });
  return res;
}
