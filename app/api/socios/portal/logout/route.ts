import { NextResponse } from "next/server";
import { COOKIE_SESION_SOCIO } from "@/lib/socio-session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_SESION_SOCIO, "", { path: "/", maxAge: 0 });
  return res;
}
