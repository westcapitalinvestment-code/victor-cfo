"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { esPlanValido, esCicloValido, type PlanId, type Ciclo } from "@/lib/stripe";

const PRECIOS_REGISTRO = {
  mensual: { normal: "14.99", referido: "12.99", sufijo: "/mes" },
  anual: { normal: "164", referido: "142", sufijo: "/año" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function RegistroForm() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();

  const planQuery = searchParams.get("plan");
  const cicloQuery = searchParams.get("ciclo");
  const refQuery = searchParams.get("ref");
  const plan: PlanId = esPlanValido(planQuery) && planQuery === "core" ? planQuery : "core";
  const ciclo: Ciclo = esCicloValido(cicloQuery) ? cicloQuery : "mensual";
  const refId = refQuery && UUID_RE.test(refQuery) ? refQuery : null;
  const esReferido = !!refId;
  const precios = PRECIOS_REGISTRO[ciclo];
  const precioMostrar = esReferido ? precios.referido : precios.normal;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accionEnCurso, setAccionEnCurso] = useState<"pago" | "gratis" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);

  async function crearCuenta(esGratis: boolean) {
    if (!email || !password) {
      setError("Completa tu email y contraseña para continuar.");
      return;
    }
    if (!aceptaTerminos) {
      setError("Tienes que aceptar la Política de Privacidad y los Términos de Servicio para continuar.");
      return;
    }

    setLoading(true);
    setAccionEnCurso(esGratis ? "gratis" : "pago");
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          signup_gratis: esGratis ? "true" : "false",
          ...(refId ? { ref_id: refId } : {}),
        },
      },
    });

    if (error) {
      setLoading(false);
      setAccionEnCurso(null);
      setError(error.message);
      return;
    }

    if (data.session) {
      if (esGratis) {
        setLoading(false);
        router.push("/onboarding");
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, ciclo, returnTo: "/onboarding", cancelTo: "/registro/completar-pago" }),
      });
      const json = await res.json().catch(() => null);
      setLoading(false);

      if (res.ok && json?.url) {
        window.location.href = json.url;
      } else {
        router.push("/registro/completar-pago");
      }
    } else {
      setLoading(false);
      setRevisaCorreo(true);
    }
  }

  async function handleRegistro(e: React.FormEvent) {
    e.preventDefault();
    crearCuenta(false);
  }

  if (revisaCorreo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
              V
            </div>
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">Revisa tu correo</p>
            <p className="text-xs text-muted">
              Te mandamos un link de confirmación a {email}. Entra ahí para activar tu cuenta y empezar.
              {accionEnCurso === "gratis"
                ? " Tu plan gratis queda activo de una vez — no hace falta pagar nada."
                : " Luego de confirmar, te vamos a pedir que completes el pago para activar tu plan."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal text-sm font-medium text-white">
            V
          </div>
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={handleRegistro} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Comienza ahora</h1>

          {esReferido && (
            <p className="mb-1 text-xs font-medium text-teal">
              Te invitaron con un link especial — precio de referido aplicado.
            </p>
          )}

          <div className="mb-1 flex items-baseline gap-1">
            <span className="text-2xl font-semibold">${precioMostrar}</span>
            <span className="text-xs text-muted">{precios.sufijo}</span>
            {esReferido && (
              <span className="ml-1 text-xs text-muted line-through">${precios.normal}{precios.sufijo}</span>
            )}
          </div>
          <p className="mb-1 text-xs text-muted">Acceso completo: banco conectado + VICTOR. Cancela cuando quieras.</p>

          <input
            className="vc-input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="vc-input"
            type="password"
            placeholder="Contraseña (mínimo 6 caracteres)"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label className="flex items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>
              Acepto la{" "}
              <Link href="/privacidad" target="_blank" className="font-medium text-teal">
                Política de Privacidad
              </Link>{" "}
              y los{" "}
              <Link href="/terminos" target="_blank" className="font-medium text-teal">
                Términos de Servicio
              </Link>
              , incluyendo el uso de Plaid para conectar mi banco.
            </span>
          </label>

          {error && <p className="text-xs text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={loading || !aceptaTerminos}>
            {loading && accionEnCurso === "pago" ? "Creando cuenta..." : `Activar por $${precioMostrar}${precios.sufijo}`}
          </button>

          <div className="my-1 flex items-center gap-2 text-xs text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>o</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <button
            type="button"
            className="vc-btn-secondary"
            disabled={loading || !aceptaTerminos}
            onClick={() => crearCuenta(true)}
          >
            {loading && accionEnCurso === "gratis" ? "Creando cuenta..." : "Empezar gratis (limitada)"}
          </button>
          <p className="text-center text-[0.7rem] text-muted">
            Gratis: Bóveda, Metas, Citas y categorizar por CSV. Sin conectar banco ni chat con VICTOR.
          </p>

          <p className="mt-1 text-center text-xs text-muted">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-teal">
              Entra aquí
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function RegistroPage() {
  return (
    <Suspense fallback={null}>
      <RegistroForm />
    </Suspense>
  );
}
