"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Registro público para contables SIN invitación (15 oct 2026, pedido de
// Joel: visitar contables y, si les interesa, abrirles cuenta aunque no
// tengan clientes todavía — para que incluyan VICTOR en su iguala).
//
// Flujo: crea la cuenta (Supabase Auth, email + contraseña) → activa
// VICTOR Accountant con /api/firma/activar (instantáneo, sin aprobación;
// Registro de Comerciante obligatorio, licencia CPA opcional) → entra a
// /cpa. Si la cuenta requiere confirmar el correo, los datos del formulario
// se guardan en sessionStorage y se activan al volver por el link.
const CLAVE_PENDIENTE = "vc_cpa_pendiente";
// Código del vendedor que le pasó el link (?v=CÓDIGO), guardado para después del registro.
const CLAVE_VENDEDOR = "vc_cpa_vendedor";

export default function RegistroCpaPage() {
  const router = useRouter();
  const supabase = createClient();

  const [modo, setModo] = useState<"crear" | "entrar">("crear");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registroComerciante, setRegistroComerciante] = useState("");
  const [licenciaCpa, setLicenciaCpa] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revisaCorreo, setRevisaCorreo] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [resetEnviado, setResetEnviado] = useState(false);

  const intento = useRef(false);
  const yaProcesado = useRef(false);

  function leerPendiente(): { registroComerciante?: string; licenciaCpa?: string } | null {
    try {
      const raw = sessionStorage.getItem(CLAVE_PENDIENTE);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function finalizar() {
    if (yaProcesado.current) return;
    yaProcesado.current = true;
    setConectando(true);
    setError(null);

    const pendiente = leerPendiente();
    if (pendiente?.registroComerciante) {
      const res = await fetch("/api/firma/activar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registroComerciante: pendiente.registroComerciante,
          licenciaCpa: pendiente.licenciaCpa || "",
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        yaProcesado.current = false;
        setConectando(false);
        setError(json?.error || "No se pudo activar tu cuenta. Intenta de nuevo.");
        return;
      }
    }
    // Si llegó por el link de un vendedor (?v=CÓDIGO), deja su ficha a nombre
    // del vendedor para que cuente el bono. Si falla, no bloquea el registro.
    try {
      const cod = sessionStorage.getItem(CLAVE_VENDEDOR);
      if (cod) {
        await fetch("/api/cpa/oficina/vincular", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: cod }),
        }).catch(() => {});
        sessionStorage.removeItem(CLAVE_VENDEDOR);
      }
    } catch {}
    try {
      sessionStorage.removeItem(CLAVE_PENDIENTE);
    } catch {}
    router.push("/cpa");
    router.refresh();
  }

  useEffect(() => {
    try {
      const v = new URLSearchParams(window.location.search).get("v");
      if (v) sessionStorage.setItem(CLAVE_VENDEDOR, v.trim().toUpperCase().slice(0, 40));
    } catch {}
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Solo reaccionamos si este formulario inició el proceso, o si vuelve
      // del link de confirmación de correo (quedó un pendiente guardado).
      if (event === "SIGNED_IN" && session && (intento.current || leerPendiente())) {
        finalizar();
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!registroComerciante.trim()) return setError("El Registro de Comerciante es obligatorio.");

    setEnviando(true);
    intento.current = true;
    try {
      sessionStorage.setItem(
        CLAVE_PENDIENTE,
        JSON.stringify({ registroComerciante: registroComerciante.trim(), licenciaCpa: licenciaCpa.trim() })
      );
    } catch {}

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/registro/cpa` : undefined,
        // cuenta_tipo='contable' hace que /login lo mande a /cpa aunque aún
        // no tenga clientes invitados (ver app/login/page.tsx).
        data: { full_name: nombre.trim(), cuenta_tipo: "contable" },
      },
    });
    setEnviando(false);

    if (error) {
      intento.current = false;
      if (error.message.toLowerCase().includes("already registered")) {
        setModo("entrar");
        setError("Ya tienes una cuenta de VICTOR con este correo — entra con tu contraseña.");
      } else {
        setError(error.message);
      }
      return;
    }

    if (data.session) return; // onAuthStateChange termina el proceso
    setRevisaCorreo(true);
  }

  async function handleEntrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    intento.current = true;

    // Si ya tenía cuenta y llenó el Registro de Comerciante, lo activamos
    // también; si no, /cpa le muestra el formulario de activación.
    if (registroComerciante.trim()) {
      try {
        sessionStorage.setItem(
          CLAVE_PENDIENTE,
          JSON.stringify({ registroComerciante: registroComerciante.trim(), licenciaCpa: licenciaCpa.trim() })
        );
      } catch {}
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setEnviando(false);
    if (error) {
      intento.current = false;
      setError(error.message);
    }
  }

  async function handleOlvido() {
    setError(null);
    if (!email.trim()) return setError("Escribe tu correo arriba primero.");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/restablecer-contrasena`,
    });
    if (error) return setError(error.message);
    setResetEnviado(true);
  }

  const encabezado = (
    <div className="mb-8 flex items-center justify-center gap-2">
      <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
      <span className="text-lg font-medium">VICTOR</span>
      <span className="ml-1 rounded-full border border-teal px-2 py-0.5 text-xs font-medium text-teal">Portal Contable</span>
    </div>
  );

  if (revisaCorreo) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          {encabezado}
          <div className="vc-card">
            <p className="mb-2 text-sm font-medium">Revisa tu correo</p>
            <p className="text-sm text-muted">
              Te mandamos un link de confirmación a {email}. Entra ahí y volverás aquí con tu cuenta lista — no hace
              falta hacer nada más.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        {encabezado}

        <div className="vc-card flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">Abre tu cuenta de contable</p>
            <p className="mt-1 text-sm text-muted">Sin costo. Te toma un minuto y no necesitas tener clientes todavía.</p>
          </div>

          <div className="flex gap-1 rounded-lg border border-border p-1">
            <button
              type="button"
              onClick={() => setModo("crear")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${modo === "crear" ? "bg-teal text-white" : "text-muted"}`}
            >
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => setModo("entrar")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium ${modo === "entrar" ? "bg-teal text-white" : "text-muted"}`}
            >
              Ya tengo cuenta
            </button>
          </div>

          <form onSubmit={modo === "crear" ? handleCrear : handleEntrar} className="flex flex-col gap-3">
            {modo === "crear" && (
              <input
                className="vc-input"
                placeholder="Tu nombre completo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            )}
            <input
              className="vc-input"
              type="email"
              placeholder="Correo"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="vc-input"
              type="password"
              placeholder={modo === "crear" ? "Crea una contraseña (mínimo 6 caracteres)" : "Tu contraseña"}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <input
              className="vc-input"
              placeholder={modo === "crear" ? "Registro de Comerciante" : "Registro de Comerciante (si aún no lo activaste)"}
              value={registroComerciante}
              onChange={(e) => setRegistroComerciante(e.target.value)}
              required={modo === "crear"}
            />
            <input
              className="vc-input"
              placeholder="Licencia de CPA (opcional)"
              value={licenciaCpa}
              onChange={(e) => setLicenciaCpa(e.target.value)}
            />

            {error && <p className="text-sm text-red">{error}</p>}

            <button type="submit" className="vc-btn-primary mt-1" disabled={enviando || conectando}>
              {conectando ? "Preparando tu portal..." : enviando ? "Un momento..." : modo === "crear" ? "Crear cuenta y entrar" : "Entrar"}
            </button>
          </form>

          {modo === "entrar" &&
            (resetEnviado ? (
              <p className="text-center text-sm text-muted">Te mandamos un link a {email} para crear una contraseña nueva.</p>
            ) : (
              <button type="button" className="text-center text-sm text-muted hover:text-teal" onClick={handleOlvido}>
                ¿Olvidaste tu contraseña?
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
