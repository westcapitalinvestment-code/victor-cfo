import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión de Supabase en cada request y protege /dashboard.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const protectedPath =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/onboarding");

  if (!user && protectedPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Gate de pago (23 agosto 2026): un usuario autenticado pero que todavía
  // no completó el checkout de Stripe tiene plan_status = 'incomplete'
  // (default desde la migración 0025). Antes de esto, cualquiera que se
  // registrara entraba gratis al dashboard para siempre, porque nada
  // revisaba el pago. Solo se aplica a /dashboard — /onboarding se deja
  // pasar porque el flujo de registro puede necesitar terminarlo antes de
  // mandar al usuario a pagar.
  if (user && request.nextUrl.pathname.startsWith("/dashboard")) {
    const { data: perfil } = await supabase
      .from("users")
      .select("plan_status")
      .eq("id", user.id)
      .maybeSingle();

    if (perfil?.plan_status === "incomplete" || perfil?.plan_status === "cancelled") {
      const url = request.nextUrl.clone();
      url.pathname = "/registro/completar-pago";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*"],
};
