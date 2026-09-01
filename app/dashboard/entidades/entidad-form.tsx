"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Formulario completo de entidad de negocio — calcado campo por campo de
// "VICTOR — Dashboard Pro.html" (sección Configuración: Perfil/Fiscal/
// Facturas). Se usa tanto para crear la primera entidad (incluida en Pro)
// como para editar entidades adicionales ($24.99/mes c/u) — un solo
// componente, con `modo` decidiendo si inserta o actualiza.
//
// Regla de Joel (1 sept 2026): nada de placeholders con datos de ejemplo o
// personales en los campos — todo empieza en blanco de verdad, sin texto
// gris simulando una respuesta.
//
// La tabla "Preview" del mockup se deja fuera a propósito: ya existe un PDF
// real (pdf-lib) que muestra exactamente cómo queda la factura, así que un
// preview simulado en JS aparte sería redundante.

export type EntidadCompleta = {
  id: string;
  name: string;
  ein: string | null;
  entity_type: string | null;
  phone: string | null;
  address: string | null;
  municipio: string | null;
  zip: string | null;
  email: string | null;
  website: string | null;
  tax_regime: string | null;
  ivu_applies: boolean | null;
  ivu_rate_estatal: number | null;
  ivu_rate_municipal: number | null;
  client_retention_situation: string | null;
  relevo_certificate_expiry: string | null;
  relevo_certificate_r2_key: string | null;
  invoice_prefix: string | null;
  invoice_start_number: number | null;
  default_payment_terms: string | null;
  default_late_fee: string | null;
  payment_methods: string[] | null;
  invoice_footer: string | null;
  logo_r2_key: string | null;
};

const TIPOS_CONTRIBUYENTE = ["Individuo", "LLC de un miembro", "Corporación", "Profesional independiente (Licencia / Colegio)"];

const REGIMENES = [
  { valor: "ordinaria", etiqueta: "Tasa ordinaria PR (hasta 37.5%)" },
  { valor: "decreto_14_2017", etiqueta: "Decreto Ley 14-2017 (médicos, 4%)" },
  { valor: "act60_cap3", etiqueta: "Act 60 Capítulo 3 (exportación servicios, 4%)" },
  { valor: "act60_cap2", etiqueta: "Act 60 Capítulo 2 (residentes bona fide, 0%)" },
];

const TERMINOS_PAGO = ["Al recibir", "Net 15", "Net 30", "Net 45", "Net 60"];
const LATE_FEES = ["Sin recargo", "10% después de 15 días", "5% después de 30 días"];
const METODOS_COBRO = ["Stripe", "ATH Móvil", "Transferencia / ACH", "Cheque"];

const RETENCIONES: { valor: string; titulo: string; detalle: string; etiqueta: string }[] = [
  { valor: "no", titulo: "No me retienen nada", detalle: "Cobro el 100%. Mecánico, plomero, paisajista, servicios al consumidor.", etiqueta: "Cobro total" },
  { valor: "10", titulo: "Me retienen el 10%", detalle: "Mis clientes B2B retienen 10% y lo depositan a Hacienda.", etiqueta: "Retención estándar PR" },
  { valor: "6", titulo: "Tengo Certificado de Relevo — 6%", detalle: "Hacienda me autorizó retención reducida. Presento el certificado a cada cliente B2B.", etiqueta: "Relevo 6% activo" },
  { valor: "exento", titulo: "Estoy exento", detalle: "Corporación, entidad exenta, u otra situación. Consulta con tu CPA.", etiqueta: "Exento" },
];

type Tab = "perfil" | "fiscal" | "facturas";

export default function EntidadForm({
  modo,
  entidad,
  esPrimeraEntidad,
  bienvenida: bienvenidaProp,
}: {
  modo: "crear" | "editar";
  entidad?: EntidadCompleta;
  esPrimeraEntidad: boolean;
  bienvenida?: boolean;
}) {
  const router = useRouter();
  const bienvenida = modo === "editar" && !!bienvenidaProp;
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("perfil");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Perfil
  const [name, setName] = useState(entidad?.name ?? "");
  const [ein, setEin] = useState(entidad?.ein ?? "");
  const [entityType, setEntityType] = useState(entidad?.entity_type ?? TIPOS_CONTRIBUYENTE[1]);
  const [phone, setPhone] = useState(entidad?.phone ?? "");
  const [address, setAddress] = useState(entidad?.address ?? "");
  const [municipio, setMunicipio] = useState(entidad?.municipio ?? "");
  const [zip, setZip] = useState(entidad?.zip ?? "");
  const [email, setEmail] = useState(entidad?.email ?? "");
  const [website, setWebsite] = useState(entidad?.website ?? "");

  // Fiscal
  const [taxRegime, setTaxRegime] = useState(entidad?.tax_regime ?? "ordinaria");
  const [ivuApplies, setIvuApplies] = useState(entidad?.ivu_applies ?? false);
  const [ivuEstatal, setIvuEstatal] = useState(String(entidad?.ivu_rate_estatal ?? 10.5));
  const [ivuMunicipal, setIvuMunicipal] = useState(String(entidad?.ivu_rate_municipal ?? 0));
  const [retencion, setRetencion] = useState(entidad?.client_retention_situation ?? "no");
  const [relevoVencimiento, setRelevoVencimiento] = useState(entidad?.relevo_certificate_expiry ?? "");

  // Facturas
  const [invoicePrefix, setInvoicePrefix] = useState(entidad?.invoice_prefix ?? "INV");
  const [invoiceStart, setInvoiceStart] = useState(String(entidad?.invoice_start_number ?? 1001));
  const [paymentTerms, setPaymentTerms] = useState(entidad?.default_payment_terms ?? "Net 30");
  const [lateFee, setLateFee] = useState(entidad?.default_late_fee ?? "Sin recargo");
  const [metodosCobro, setMetodosCobro] = useState<string[]>(entidad?.payment_methods ?? ["Stripe"]);
  const [invoiceFooter, setInvoiceFooter] = useState(entidad?.invoice_footer ?? "");

  // Certificado de relevo — solo se puede subir con una entidad que ya
  // existe (necesita el id real para la key de R2), igual que el logo.
  const relevoInputRef = useRef<HTMLInputElement>(null);
  const [tieneRelevo, setTieneRelevo] = useState(!!entidad?.relevo_certificate_r2_key);
  const [subiendoRelevo, setSubiendoRelevo] = useState(false);

  function toggleMetodo(m: string) {
    setMetodosCobro((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function subirRelevo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !entidad) return;
    setSubiendoRelevo(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityId", entidad.id);
    const res = await fetch("/api/entidades/relevo/upload", { method: "POST", body: formData });
    setSubiendoRelevo(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo subir el certificado.");
      return;
    }
    setTieneRelevo(true);
  }

  function camposComunes() {
    return {
      name,
      ein: ein || null,
      entity_type: entityType,
      phone: phone || null,
      address: address || null,
      municipio: municipio || null,
      zip: zip || null,
      email: email || null,
      website: website || null,
      tax_regime: taxRegime,
      ivu_applies: ivuApplies,
      ivu_rate_estatal: ivuApplies ? Number(ivuEstatal) || 0 : 0,
      ivu_rate_municipal: ivuApplies ? Number(ivuMunicipal) || 0 : 0,
      client_retention_situation: retencion,
      relevo_certificate_expiry: retencion === "6" ? relevoVencimiento || null : null,
      invoice_prefix: invoicePrefix || "INV",
      invoice_start_number: Number(invoiceStart) || 1001,
      default_payment_terms: paymentTerms,
      default_late_fee: lateFee,
      payment_methods: metodosCobro,
      invoice_footer: invoiceFooter || null,
    };
  }

  async function guardar() {
    if (!name.trim()) {
      setError("Ponle nombre a tu negocio antes de continuar.");
      setTab("perfil");
      return;
    }
    setGuardando(true);
    setError(null);

    if (modo === "editar" && entidad) {
      const { error: updateError } = await supabase.from("business_entities").update(camposComunes()).eq("id", entidad.id);
      setGuardando(false);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/dashboard/config");
      router.refresh();
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setGuardando(false);
      setError("Sesión expirada — vuelve a entrar.");
      return;
    }

    const { data: nueva, error: insertError } = await supabase
      .from("business_entities")
      .insert({ owner_id: user.id, ...camposComunes() })
      .select("id")
      .single();
    setGuardando(false);
    if (insertError || !nueva) {
      setError(insertError?.message ?? "No se pudo crear el negocio.");
      return;
    }
    // Al logo y al certificado de relevo les hace falta un id real de
    // entidad para subirse (ver LogoUploader y el input de relevo arriba,
    // ambos deshabilitados en modo "crear") — por eso, en vez de mandar
    // directo a Facturación, se manda a la página de editar de la entidad
    // recién creada, donde esos dos uploads ya sí funcionan.
    router.push(`/dashboard/entidades/${nueva.id}/editar?bienvenida=1`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">{modo === "crear" ? "Crea tu negocio" : `Editar — ${entidad?.name}`}</h1>
          <p className="mt-0.5 text-xs text-muted">
            {esPrimeraEntidad ? "Incluido en tu plan Pro." : modo === "crear" ? "Entidad adicional — $24.99/mes." : "Cada entidad se factura por separado."}
          </p>
        </div>
        {bienvenida ? (
          <button onClick={() => router.push("/dashboard/facturacion")} className="text-sm font-medium text-teal hover:opacity-80">
            Ir a Facturación →
          </button>
        ) : (
          <button onClick={() => router.push(modo === "crear" ? "/dashboard" : "/dashboard/config")} className="text-sm text-muted hover:opacity-80">
            Cancelar
          </button>
        )}
      </div>

      {bienvenida && (
        <div className="mb-4 rounded-lg border border-teal bg-teal/5 p-3 text-xs text-teal">
          <strong>¡Tu negocio quedó creado!</strong> Aquí puedes subir el logo y, si aplica, tu Certificado de Relevo — pestaña Perfil
          y Fiscal. Cuando termines, dale a "Ir a Facturación" arriba.
        </div>
      )}

      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-bg p-1">
        {(["perfil", "fiscal", "facturas"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="flex-1 rounded-md py-1.5 text-xs font-medium capitalize"
            style={tab === t ? { background: "#1D9E75", color: "#fff" } : { color: "var(--muted)" }}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="mb-3 text-xs text-red">{error}</p>}

      {tab === "perfil" && (
        <div className="vc-card flex flex-col gap-3">
          {modo === "editar" && entidad && <LogoUploader entidad={entidad} />}

          <Field label="Nombre del negocio o profesional">
            <input className="vc-input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="EIN">
            <input className="vc-input" value={ein} onChange={(e) => setEin(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipo de contribuyente">
              <select className="vc-input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                {TIPOS_CONTRIBUYENTE.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Teléfono">
              <input className="vc-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
          </div>
          <Field label="Dirección">
            <textarea className="vc-input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Ciudad">
              <input className="vc-input" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
            </Field>
            <Field label="ZIP">
              <input className="vc-input" value={zip} onChange={(e) => setZip(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Teléfono de contacto">
              <input className="vc-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Email">
              <input className="vc-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </div>
          <Field label="Website (opcional)">
            <input className="vc-input" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </Field>
          <button className="vc-btn-primary mt-1" onClick={() => setTab("fiscal")}>
            Continuar → Fiscal
          </button>
        </div>
      )}

      {tab === "fiscal" && (
        <div className="flex flex-col gap-3">
          <div className="vc-card">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted">¿Te retienen cuando te pagan?</p>
            <div className="flex flex-col gap-2">
              {RETENCIONES.map((r) => (
                <div
                  key={r.valor}
                  onClick={() => setRetencion(r.valor)}
                  className="cursor-pointer rounded-lg border p-3"
                  style={retencion === r.valor ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.05)" } : { borderColor: "var(--border)" }}
                >
                  <div className="flex items-start gap-2">
                    <div
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border-2"
                      style={retencion === r.valor ? { borderColor: "#1D9E75", background: "#1D9E75" } : { borderColor: "var(--border)" }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{r.titulo}</p>
                      <p className="mt-0.5 text-xs text-muted">{r.detalle}</p>
                      <span
                        className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "rgba(29,158,117,.1)", color: "#1D9E75" }}
                      >
                        {r.etiqueta}
                      </span>
                      {r.valor === "6" && retencion === "6" && (
                        <div className="mt-2 flex flex-col gap-2">
                          <Field label="Vencimiento del relevo">
                            <input
                              className="vc-input"
                              type="date"
                              value={relevoVencimiento}
                              onChange={(e) => setRelevoVencimiento(e.target.value)}
                            />
                          </Field>
                          {modo === "editar" && entidad ? (
                            <>
                              <input ref={relevoInputRef} type="file" accept="application/pdf" className="hidden" onChange={subirRelevo} />
                              <button
                                type="button"
                                disabled={subiendoRelevo}
                                className="rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted hover:opacity-80"
                                onClick={() => relevoInputRef.current?.click()}
                              >
                                {subiendoRelevo ? "Subiendo..." : tieneRelevo ? "✓ Certificado subido — toca para reemplazar" : "Subir Certificado de Relevo (PDF)"}
                              </button>
                            </>
                          ) : (
                            <p className="text-xs text-muted">Podrás subir el PDF del certificado después de crear el negocio.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="vc-card">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Régimen contributivo</p>
            <select className="vc-input" value={taxRegime} onChange={(e) => setTaxRegime(e.target.value)}>
              {REGIMENES.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="vc-card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">¿Aplica IVU?</p>
                <p className="text-xs text-muted">Si vendes bienes o ciertos servicios sujetos a IVU.</p>
              </div>
              <button
                type="button"
                onClick={() => setIvuApplies(!ivuApplies)}
                className="relative h-[17px] w-[30px] flex-shrink-0 rounded-full transition-colors"
                style={{ background: ivuApplies ? "#1D9E75" : "var(--border)" }}
              >
                <span
                  className="absolute top-[2px] h-[13px] w-[13px] rounded-full bg-white transition-all"
                  style={{ left: ivuApplies ? "15px" : "2px" }}
                />
              </button>
            </div>
            {ivuApplies && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Field label="IVU estatal %">
                  <input className="vc-input" type="number" step="0.001" value={ivuEstatal} onChange={(e) => setIvuEstatal(e.target.value)} />
                </Field>
                <Field label="IVU municipal %">
                  <input className="vc-input" type="number" step="0.001" value={ivuMunicipal} onChange={(e) => setIvuMunicipal(e.target.value)} />
                </Field>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="vc-btn-primary !bg-transparent !text-muted border border-border flex-shrink-0 px-4" onClick={() => setTab("perfil")}>
              ← Atrás
            </button>
            <button className="vc-btn-primary flex-1" onClick={() => setTab("facturas")}>
              Continuar → Facturas
            </button>
          </div>
        </div>
      )}

      {tab === "facturas" && (
        <div className="flex flex-col gap-3">
          <div className="vc-card">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Numeración</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Prefijo">
                <input className="vc-input" value={invoicePrefix} onChange={(e) => setInvoicePrefix(e.target.value)} />
              </Field>
              <Field label="Número inicial">
                <input className="vc-input" type="number" value={invoiceStart} onChange={(e) => setInvoiceStart(e.target.value)} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">
              Próxima factura: <strong style={{ color: "#1D9E75" }}>{invoicePrefix || "INV"}-{invoiceStart || "1001"}</strong>
            </p>
          </div>

          <div className="vc-card">
            <Field label="Términos de pago default">
              <select className="vc-input" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                {TERMINOS_PAGO.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="vc-card">
            <Field label="Late fee default">
              <select className="vc-input" value={lateFee} onChange={(e) => setLateFee(e.target.value)}>
                {LATE_FEES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="vc-card">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Métodos de cobro</p>
            <div className="flex flex-wrap gap-2">
              {METODOS_COBRO.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMetodo(m)}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium"
                  style={
                    metodosCobro.includes(m)
                      ? { borderColor: "#1D9E75", background: "rgba(29,158,117,.08)", color: "#1D9E75" }
                      : { borderColor: "var(--border)", color: "var(--muted)" }
                  }
                >
                  {metodosCobro.includes(m) ? "✓ " : ""}
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="vc-card">
            <Field label="Pie de factura (opcional)">
              <textarea className="vc-input" rows={2} value={invoiceFooter} onChange={(e) => setInvoiceFooter(e.target.value)} />
            </Field>
          </div>

          <div className="flex gap-2">
            <button className="vc-btn-primary !bg-transparent !text-muted border border-border flex-shrink-0 px-4" onClick={() => setTab("fiscal")}>
              ← Atrás
            </button>
            <button className="vc-btn-primary flex-1" disabled={guardando} onClick={guardar}>
              {guardando ? "Guardando..." : modo === "crear" ? "Crear mi negocio" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogoUploader({ entidad }: { entidad: EntidadCompleta }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [tieneLogo, setTieneLogo] = useState(!!entidad.logo_r2_key);
  const [subiendo, setSubiendo] = useState(false);
  const [version, setVersion] = useState(0);

  async function subirLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityId", entidad.id);
    const res = await fetch("/api/entidades/logo/upload", { method: "POST", body: formData });
    setSubiendo(false);
    if (res.ok) {
      setTieneLogo(true);
      setVersion((v) => v + 1);
    }
  }

  return (
    <div className="mb-1 flex flex-col items-center gap-2">
      <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-bg">
        {tieneLogo ? (
          <img src={`/api/entidades/${entidad.id}/logo?v=${version}`} alt="Logo" className="h-full w-full object-contain" />
        ) : (
          <i className="ti ti-building-store text-muted" style={{ fontSize: 20 }} />
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={subirLogo} />
      <button type="button" disabled={subiendo} className="text-xs font-medium text-teal hover:opacity-80" onClick={() => inputRef.current?.click()}>
        {subiendo ? "Subiendo..." : tieneLogo ? "Cambiar logo" : "Añadir logo · PNG, JPG · Máx 5MB"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs uppercase tracking-wide text-muted">{label}</label>
      {children}
    </div>
  );
}
