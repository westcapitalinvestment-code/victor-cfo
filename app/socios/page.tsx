"use client";

import { useState } from "react";
import Link from "next/link";

// Página pública de aplicación al Programa de Socios (CPAs/influencers,
// migración 0070, 5 sept 2026) — sin sesión, cualquiera en PR la puede
// llenar. Nace en estado='pendiente' vía POST /api/socios; Joel aprueba a
// mano desde el Dashboard de Operaciones, y solo AHÍ se genera el código
// corto que el socio va a compartir (ver app/api/socios/[id]/route.ts) —
// nadie puede compartir un link de una solicitud todavía sin revisar.
export default function SociosPage() {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<"cpa" | "influencer" | "otro">("otro");
  const [comoPromociona, setComoPromociona] = useState("");
  const [aceptaTerminos, setAceptaTerminos] = useState(false);
  const [resume, setResume] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      setError("Completa tu nombre y email para continuar.");
      return;
    }
    if (!telefono.trim()) {
      setError("Pon tu número de WhatsApp — por ahí te avisamos si eres aprobado.");
      return;
    }
    if (!resume) {
      setError("Sube tu currículum (PDF o Word) para continuar.");
      return;
    }
    if (resume.size > 4 * 1024 * 1024) {
      setError("El currículum pesa más de 4 MB — usa un archivo más liviano.");
      return;
    }
    if (!aceptaTerminos) {
      setError("Tienes que aceptar los Términos del Programa de Socios para continuar.");
      return;
    }

    setLoading(true);
    setError(null);

    // multipart/form-data para poder adjuntar el currículum (13 oct 2026).
    const datos = new FormData();
    datos.append("nombre", nombre.trim());
    datos.append("email", email.trim());
    datos.append("telefono", telefono.trim());
    datos.append("tipo", tipo);
    datos.append("comoPromociona", comoPromociona.trim());
    datos.append("aceptaTerminos", String(aceptaTerminos));
    datos.append("resume", resume);
    const res = await fetch("/api/socios", { method: "POST", body: datos });
    const json = await res.json().catch(() => null);
    setLoading(false);

    if (res.ok) {
      setEnviado(true);
    } else {
      setError(json?.error || "No se pudo enviar tu solicitud. Intenta de nuevo.");
    }
  }

  if (enviado) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-sm text-center">
          <div className="mb-8 flex items-center justify-center gap-2">
            <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
            <span className="text-lg font-medium">VICTOR</span>
          </div>
          <div className="vc-card">
            <p className="mb-2 text-base font-medium">¡Solicitud enviada!</p>
            <p className="text-sm text-muted">
              Recibimos tu información y tu currículum. Te mandamos un correo con los próximos pasos (revisa también
              tu carpeta de spam).
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-left text-sm text-muted">
              <li>El equipo de VICTOR CFO revisa tu solicitud.</li>
              <li>Si eres aprobado, te avisamos por correo y por WhatsApp.</li>
              <li>Completas tus documentos (contrato y datos de pago) desde un link privado.</li>
              <li>Recibes tu código, tu QR y el acceso a tu portal.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <img src="/victor-avatar.png" alt="VICTOR" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" style={{ background: "#fff" }} />
          <span className="text-lg font-medium">VICTOR</span>
        </div>

        <form onSubmit={enviar} className="vc-card flex flex-col gap-3">
          <h1 className="mb-1 text-base font-medium">Únete al equipo de VICTOR CFO</h1>
          <p className="mb-1 text-sm text-muted">
            {/* h1 cambiado de "Sé Embajador o Afiliado" a algo neutral (3 oct
                2026) — ahora el tráfico principal a este form llega desde el
                CTA "Quiero ser Vendedor" de la landing (ver
                app/landing-page.tsx, sección #vendedores), no desde
                Embajadores (desactivado el mismo día). Copy sin promesa de
                comisión en dólares — el programa de comisión para
                embajador/CPA/influencer está pausado mientras lanza el
                equipo de ventas. Este formulario sigue siendo la puerta de
                entrada tanto para embajadores como para el equipo de ventas
                (Joel reclasifica a "vendedor" al aprobar — tipo no es
                auto-seleccionable, ver app/api/socios/route.ts). */}
            Seas CPA, contador, influencer, o simplemente alguien con la red y las ganas de promocionar
            VICTOR CFO activamente en Puerto Rico: completa el formulario y te contactamos directamente
            para explicarte cómo puedes colaborar con nosotros.
          </p>

          <div className="mb-1 flex gap-2 text-sm">
            <button
              type="button"
              onClick={() => setTipo("cpa")}
              className={`flex-1 rounded-lg border p-2 font-medium ${tipo === "cpa" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              CPA / Contador
            </button>
            <button
              type="button"
              onClick={() => setTipo("influencer")}
              className={`flex-1 rounded-lg border p-2 font-medium ${tipo === "influencer" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Influencer
            </button>
            <button
              type="button"
              onClick={() => setTipo("otro")}
              className={`flex-1 rounded-lg border p-2 font-medium ${tipo === "otro" ? "border-teal text-teal" : "border-border text-muted"}`}
            >
              Otro
            </button>
          </div>

          <input
            className="vc-input"
            type="text"
            placeholder="Nombre completo"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
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
            type="tel"
            placeholder="Teléfono / WhatsApp"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            required
          />
          <textarea
            className="vc-input"
            placeholder="¿Cómo planeas promocionarlo? Sé específico: por qué canal (clientes de tu práctica, tus redes, tu círculo de negocios), a cuántas personas aproximadamente puedes alcanzar, y con qué frecuencia."
            rows={3}
            value={comoPromociona}
            onChange={(e) => setComoPromociona(e.target.value)}
            required
          />

          <div>
            <label className="mb-1 block text-sm font-medium text-muted">Currículum (PDF o Word, máx. 4 MB)</label>
            <input
              className="vc-input !py-2 text-sm"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => setResume(e.target.files?.[0] ?? null)}
              required
            />
            {resume && <p className="mt-1 truncate text-xs text-teal">{resume.name}</p>}
          </div>

          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={aceptaTerminos}
              onChange={(e) => setAceptaTerminos(e.target.checked)}
              className="mt-0.5"
              required
            />
            <span>
              Acepto los{" "}
              <Link href="/socios/terminos" target="_blank" className="font-medium text-teal">
                Términos del Programa de Socios
              </Link>
              .
            </span>
          </label>

          {error && <p className="text-sm text-red">{error}</p>}

          <button type="submit" className="vc-btn-primary mt-2" disabled={loading || !aceptaTerminos}>
            {loading ? "Enviando..." : "Enviar solicitud"}
          </button>

          <p className="mt-1 text-center text-sm text-muted">
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
