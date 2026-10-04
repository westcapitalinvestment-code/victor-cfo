"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CobroTarjeta from "./cobro-tarjeta";
import ConectarShopify from "./conectar-shopify";

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
  // Certificado de Compras Exentas (Modelo SC 2916, #783) — para presentarle
  // a los SUPLIDORES de esta entidad y no pagar IVU al comprar inventario
  // para reventa. Dirección inversa de clients.ivu_exempt_reseller.
  sc2916_certificate_r2_key?: string | null;
  sc2916_certificate_expiry?: string | null;
  invoice_prefix: string | null;
  invoice_start_number: number | null;
  default_payment_terms: string | null;
  default_late_fee: string | null;
  payment_methods: string[] | null;
  invoice_footer: string | null;
  logo_r2_key: string | null;
  brand_color: string | null;
  ath_movil_business_path: string | null;
  ath_movil_public_token?: string | null;
  stripe_connect_account_id?: string | null;
  stripe_connect_charges_enabled?: boolean | null;
  shopify_shop_domain?: string | null;
  shopify_conectado?: boolean | null;
  ach_bank_name?: string | null;
  ach_routing_number?: string | null;
  ach_account_type?: string | null;
  ach_company_id?: string | null;
};

// Paleta de colores de marca (pedido de Joel, 1 sept 2026): para que la
// factura vaya acorde con el logo del negocio en vez de salir siempre en
// el verde de VICTOR por default. Se aplica en el PDF (línea del
// encabezado + total grande) — ver /api/facturas/[id]/pdf.
const COLORES_MARCA: { hex: string; nombre: string }[] = [
  { hex: "#1D9E75", nombre: "Verde VICTOR" },
  { hex: "#1677D9", nombre: "Azul" },
  { hex: "#7C3AED", nombre: "Morado" },
  { hex: "#DC2626", nombre: "Rojo" },
  { hex: "#EA580C", nombre: "Naranja" },
  { hex: "#0891B2", nombre: "Turquesa" },
  { hex: "#BE185D", nombre: "Fucsia" },
  { hex: "#0F172A", nombre: "Negro" },
];

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
  relevoError,
  logoError,
}: {
  modo: "crear" | "editar";
  entidad?: EntidadCompleta;
  esPrimeraEntidad: boolean;
  bienvenida?: boolean;
  relevoError?: boolean;
  logoError?: boolean;
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
  const [brandColor, setBrandColor] = useState(entidad?.brand_color ?? "#1D9E75");

  // Fiscal
  const [taxRegime, setTaxRegime] = useState(entidad?.tax_regime ?? "ordinaria");
  const [ivuApplies, setIvuApplies] = useState(entidad?.ivu_applies ?? false);
  const [ivuEstatal, setIvuEstatal] = useState(String(entidad?.ivu_rate_estatal ?? 10.5));
  const [ivuMunicipal, setIvuMunicipal] = useState(String(entidad?.ivu_rate_municipal ?? 1));
  const [retencion, setRetencion] = useState(entidad?.client_retention_situation ?? "no");
  const [relevoVencimiento, setRelevoVencimiento] = useState(entidad?.relevo_certificate_expiry ?? "");
  // Certificado de Compras Exentas SC 2916 (#783) — solo tiene sentido
  // subirlo en modo editar (necesita un entityId real para la key de R2),
  // igual que "Certificado de Registro de Comerciante" en Pagos (#788): sin
  // el flujo dual crear/subir-después del Relevo, porque este certificado
  // no bloquea nada al crear la entidad — se puede añadir cuando ya exista.
  const [sc2916Vencimiento, setSc2916Vencimiento] = useState(entidad?.sc2916_certificate_expiry ?? "");
  const sc2916InputRef = useRef<HTMLInputElement>(null);
  const [tieneSc2916, setTieneSc2916] = useState(!!entidad?.sc2916_certificate_r2_key);
  const [subiendoSc2916, setSubiendoSc2916] = useState(false);

  // Facturas
  const [invoicePrefix, setInvoicePrefix] = useState(entidad?.invoice_prefix ?? "INV");
  const [invoiceStart, setInvoiceStart] = useState(String(entidad?.invoice_start_number ?? 1001));
  const [paymentTerms, setPaymentTerms] = useState(entidad?.default_payment_terms ?? "Net 30");
  const [lateFee, setLateFee] = useState(entidad?.default_late_fee ?? "Sin recargo");
  const [metodosCobro, setMetodosCobro] = useState<string[]>(entidad?.payment_methods ?? ["Stripe"]);
  const [invoiceFooter, setInvoiceFooter] = useState(entidad?.invoice_footer ?? "");
  // pATH de ATH Móvil Business (2 sept 2026, pedido de Joel): el
  // identificador que usan los clientes para pagarte por ATH Móvil Business
  // — siempre empieza con "/" (ej. /MiNegocioPR). No es "el nombre del
  // negocio" — es un handle propio que Joel configura en la app de ATH
  // Móvil Business. Con este campo lleno, Nueva/Editar Factura puede
  // mostrar el estimado de cuánto le llega neto con el 2.25% que cobra BPPR.
  const [athMovilPath, setAthMovilPath] = useState(entidad?.ath_movil_business_path ?? "");
  // Public Token de ATH Móvil Business (28 sept 2026, pedido de Joel: "un
  // POS con QR... que quizás pueda ser ATH Móvil también") — a diferencia
  // del pATH de arriba (que solo sirve para MOSTRAR cómo pagarle y estimar
  // el fee), este token es lo que activa de verdad el Payment Button
  // oficial de Evertec (athmovil_base.js) en la página pública /cobro/[id]
  // — permite generar un cobro real con monto fijo que el cliente confirma
  // desde su app de ATH Móvil, no solo un pATH que el cliente busca a mano.
  // Se configura en la app de ATH Business → Ajustes → Configuración de
  // Ecommerce. No es secreto (viaja al navegador del cliente), así que se
  // guarda en texto plano igual que el pATH.
  const [athPublicToken, setAthPublicToken] = useState(entidad?.ath_movil_public_token ?? "");

  // Certificado de relevo — la SUBIDA a R2 solo puede pasar con una entidad
  // que ya existe (necesita el id real para la key), igual que el logo. Pero
  // en modo "crear" sí dejamos ESCOGER el archivo de una vez (relevoFile) y
  // lo subimos automáticamente justo después del insert en guardar() — así
  // el dueño no tiene que acordarse de volver luego a una segunda pantalla.
  // (Antes decía "podrás subirlo después" y ese "después" nunca llegaba
  // para varios usuarios — bug reportado por Joel, 9 sept 2026.)
  const relevoInputRef = useRef<HTMLInputElement>(null);
  const [tieneRelevo, setTieneRelevo] = useState(!!entidad?.relevo_certificate_r2_key);
  const [subiendoRelevo, setSubiendoRelevo] = useState(false);
  const [relevoFile, setRelevoFile] = useState<File | null>(null);

  function escogerRelevo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("El certificado debe ser un PDF.");
      return;
    }
    setError(null);
    setRelevoFile(file);
  }

  async function subirRelevoParaEntidad(entityId: string, file: File): Promise<boolean> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityId", entityId);
    try {
      const res = await fetch("/api/entidades/relevo/upload", { method: "POST", body: formData });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Logo — mismo patrón que el certificado de relevo arriba: en modo
  // "crear" solo se ESCOGE (logoFile) y se sube apenas exista un id real de
  // entidad, dentro de guardar(). logoPreview es la vista previa local
  // (object URL) mientras tanto, para que se vea igual de "ya quedó" que en
  // modo editar aunque todavía no se haya subido a R2.
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  function escogerLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) {
      setError("El logo debe ser PNG o JPG.");
      return;
    }
    setError(null);
    setLogoFile(file);
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  async function subirLogoParaEntidad(entityId: string, file: File): Promise<boolean> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityId", entityId);
    try {
      const res = await fetch("/api/entidades/logo/upload", { method: "POST", body: formData });
      return res.ok;
    } catch {
      return false;
    }
  }

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

  async function subirSc2916(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !entidad) return;
    if (file.type !== "application/pdf") {
      setError("El certificado debe ser un PDF.");
      return;
    }
    setSubiendoSc2916(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("entityId", entidad.id);
    const res = await fetch("/api/entidades/sc2916/upload", { method: "POST", body: formData });
    setSubiendoSc2916(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo subir el certificado.");
      return;
    }
    setTieneSc2916(true);
  }

  async function borrarSc2916() {
    if (!entidad) return;
    setSubiendoSc2916(true);
    setError(null);
    const res = await fetch(`/api/entidades/${entidad.id}/sc2916`, { method: "DELETE" });
    setSubiendoSc2916(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo quitar el certificado.");
      return;
    }
    setTieneSc2916(false);
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
      brand_color: brandColor || "#1D9E75",
      tax_regime: taxRegime,
      ivu_applies: ivuApplies,
      ivu_rate_estatal: ivuApplies ? Number(ivuEstatal) || 0 : 0,
      ivu_rate_municipal: ivuApplies ? Number(ivuMunicipal) || 0 : 0,
      client_retention_situation: retencion,
      relevo_certificate_expiry: retencion === "6" ? relevoVencimiento || null : null,
      sc2916_certificate_expiry: sc2916Vencimiento || null,
      invoice_prefix: invoicePrefix || "INV",
      invoice_start_number: Number(invoiceStart) || 1001,
      default_payment_terms: paymentTerms,
      default_late_fee: lateFee,
      payment_methods: metodosCobro,
      invoice_footer: invoiceFooter || null,
      ath_movil_business_path: metodosCobro.includes("ATH Móvil") ? athMovilPath.trim() || null : null,
      ath_movil_public_token: metodosCobro.includes("ATH Móvil") ? athPublicToken.trim() || null : null,
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
    // Si esta NO es la primera entidad, hay que cobrar el addon de $24.99/mes
    // (migración 0063) — se sincroniza después de crear, no antes, porque la
    // cantidad real (entidades activas - 1) ya cambió con este insert. Se
    // dispara sin bloquear la navegación: si Stripe falla por lo que sea, la
    // entidad ya quedó creada de todos modos — mejor que el usuario pueda
    // seguir trabajando y que esto se reconcilie en el próximo intento
    // (ej. al crear otra entidad) que dejarlo atascado en este formulario.
    if (!esPrimeraEntidad) {
      // No se espera (misma lógica de no bloquear de arriba), pero sí se lee
      // la respuesta: un cliente de Firma Accountant sin suscripción propia
      // (4 oct 2026) puede devolver requierePago+checkoutUrl en vez de
      // sincronizar directo — en ese caso lo mandamos a Stripe a poner su
      // tarjeta, aunque la navegación de abajo ya haya arrancado (el
      // redirect gana, no hay conflicto real).
      fetch("/api/stripe/addon-entidades/sincronizar", { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data?.requierePago && data?.checkoutUrl) window.location.href = data.checkoutUrl;
        })
        .catch(() => {});
    }
    // Si escogieron el certificado de relevo durante la creación (arriba,
    // solo se podía ESCOGER, no subir — hacía falta el id real de la
    // entidad), lo subimos ahora mismo que ya existe ese id. Si por lo que
    // sea falla, no bloqueamos la creación (la entidad ya quedó guardada) —
    // se lo marcamos con relevoError=1 para que la página de editar avise y
    // pueda reintentar ahí mismo, en vez de perder el negocio recién creado.
    let relevoFallo = false;
    if (relevoFile) {
      const ok = await subirRelevoParaEntidad(nueva.id, relevoFile);
      relevoFallo = !ok;
    }
    // Mismo trato para el logo: si lo escogieron en el formulario de crear,
    // se sube ahora que ya hay id real de entidad.
    let logoFallo = false;
    if (logoFile) {
      const ok = await subirLogoParaEntidad(nueva.id, logoFile);
      logoFallo = !ok;
    }
    const params = ["bienvenida=1"];
    if (relevoFallo) params.push("relevoError=1");
    if (logoFallo) params.push("logoError=1");
    router.push(`/dashboard/entidades/${nueva.id}/editar?${params.join("&")}`);
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

      {(relevoError || logoError) && (
        <div className="mb-4 rounded-lg border border-red bg-red/5 p-3 text-xs text-red">
          <strong>Tu negocio quedó creado, pero {relevoError && logoError ? "el logo y el Certificado de Relevo no se pudieron subir" : relevoError ? "el Certificado de Relevo no se pudo subir" : "el logo no se pudo subir"}.</strong>{" "}
          {relevoError && "Ve a la pestaña Fiscal para reintentar el certificado. "}
          {logoError && "Ve a la pestaña Perfil para reintentar el logo. "}
          No se perdió nada más.
        </div>
      )}

      {bienvenida && !relevoError && !logoError && (
        <div className="mb-4 rounded-lg border border-teal bg-teal/5 p-3 text-xs text-teal">
          <strong>¡Tu negocio quedó creado!</strong> Si no adjuntaste el logo o tu Certificado de Relevo al crearlo, puedes hacerlo
          aquí mismo — pestañas Perfil y Fiscal. Cuando termines, dale a "Ir a Facturación" arriba.
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
          {modo === "editar" && entidad ? (
            <LogoUploader entidad={entidad} />
          ) : (
            <div className="mb-1 flex flex-col items-center gap-2">
              <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-dashed border-border bg-bg">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
                ) : (
                  <i className="ti ti-building-store text-muted" style={{ fontSize: 20 }} />
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={escogerLogo} />
              <button type="button" className="text-xs font-medium text-teal hover:opacity-80" onClick={() => logoInputRef.current?.click()}>
                {logoFile ? "Cambiar logo" : "Añadir logo · PNG, JPG · Máx 5MB"}
              </button>
            </div>
          )}

          <SelectorColorFactura color={brandColor} onChange={setBrandColor} />

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
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={subiendoRelevo}
                                  className="rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted hover:opacity-80"
                                  onClick={() => relevoInputRef.current?.click()}
                                >
                                  {subiendoRelevo ? "Subiendo..." : tieneRelevo ? "✓ Certificado subido — toca para reemplazar" : "Subir Certificado de Relevo (PDF)"}
                                </button>
                                {tieneRelevo && (
                                  <a
                                    href={`/api/entidades/${entidad.id}/relevo`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-medium text-teal hover:opacity-80"
                                  >
                                    Ver / imprimir
                                  </a>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <input ref={relevoInputRef} type="file" accept="application/pdf" className="hidden" onChange={escogerRelevo} />
                              <button
                                type="button"
                                className="rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted hover:opacity-80"
                                onClick={() => relevoInputRef.current?.click()}
                              >
                                {relevoFile ? `✓ ${relevoFile.name} — toca para cambiar` : "Adjuntar Certificado de Relevo (PDF)"}
                              </button>
                              <p className="text-xs text-muted">
                                Se sube junto con el negocio al darle Guardar. Si no lo tienes a mano, puedes añadirlo después desde Configuración.
                              </p>
                            </>
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

          {/* Certificado de Compras Exentas SC 2916 (#783, 1 oct 2026) — si el
              negocio compra inventario/mercancía para revenderla, este
              certificado se le presenta a SUS suplidores para no pagar IVU
              en esa compra (el IVU se cobra una sola vez, en la venta final).
              Solo tiene sentido subirlo con la entidad ya creada (necesita el
              id real para la key de R2) — igual que el Certificado de
              Relevo arriba, pero sin el flujo dual crear/editar porque este
              no bloquea nada al crear el negocio. */}
          <div className="vc-card">
            <p className="text-sm font-medium">Certificado de Compras Exentas (SC 2916)</p>
            <p className="mb-3 text-xs text-muted">
              Si compras inventario/mercancía para revenderla, este certificado se lo presentas a tus suplidores para no
              pagar IVU en esa compra — el IVU se cobra una sola vez, cuando tú le vendas al cliente final.
            </p>
            {modo === "editar" && entidad ? (
              <>
                <Field label="Vencimiento (opcional)">
                  <input
                    className="vc-input"
                    type="date"
                    value={sc2916Vencimiento}
                    onChange={(e) => setSc2916Vencimiento(e.target.value)}
                  />
                </Field>
                <input ref={sc2916InputRef} type="file" accept="application/pdf" className="hidden" onChange={subirSc2916} />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    disabled={subiendoSc2916}
                    className="vc-btn-primary flex-1"
                    style={{ width: "auto" }}
                    onClick={() => sc2916InputRef.current?.click()}
                  >
                    {subiendoSc2916 ? "Subiendo..." : tieneSc2916 ? "✓ Certificado subido — toca para reemplazar" : "Subir Certificado SC 2916 (PDF)"}
                  </button>
                  {tieneSc2916 && (
                    <>
                      <a
                        href={`/api/entidades/${entidad.id}/sc2916`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-teal hover:opacity-80"
                      >
                        Ver
                      </a>
                      <button type="button" className="text-xs font-medium text-red hover:opacity-80" disabled={subiendoSc2916} onClick={borrarSc2916}>
                        Quitar
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              <p className="text-xs text-muted">Podrás subirlo después de crear el negocio, desde esta misma pestaña.</p>
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
            {metodosCobro.includes("ATH Móvil") && (
              <div className="mt-3">
                <Field label="Tu pATH de ATH Móvil Business">
                  <input
                    className="vc-input"
                    value={athMovilPath}
                    onChange={(e) => setAthMovilPath(e.target.value)}
                    placeholder="/MiNegocioPR"
                  />
                </Field>
                <p className="mt-1 text-xs text-muted">
                  El identificador (empieza con "/") que usan tus clientes para pagarte por ATH Móvil Business — lo
                  configuras en la app de ATH Móvil Business, no aquí. Con esto lleno, Facturación te muestra cuánto te
                  llega neto (BPPR cobra 2.25% por pago, mínimo $0.06).
                </p>
                <div className="mt-3">
                  <Field label="Public Token de ATH Móvil Business (opcional — para cobrar con QR)">
                    <input
                      className="vc-input"
                      value={athPublicToken}
                      onChange={(e) => setAthPublicToken(e.target.value)}
                      placeholder="a66ce73d04f2087615f6320b724defc5b4eedc55"
                    />
                  </Field>
                  <p className="mt-1 text-xs text-muted">
                    Con esto lleno, tus facturas pueden generar un código QR que tu cliente escanea y paga de verdad
                    por ATH Móvil (confirma en su app, sin tener que buscarte a mano por el pATH). Lo encuentras en
                    la app de ATH Business → Ajustes → Configuración de Ecommerce. Sin este token, el QR solo ofrece
                    pagar con tarjeta.
                  </p>
                </div>
              </div>
            )}
            {metodosCobro.includes("Stripe") && modo === "editar" && entidad?.id && (
              <CobroTarjeta
                entityId={entidad.id}
                cuentaId={entidad.stripe_connect_account_id}
                chargesEnabled={entidad.stripe_connect_charges_enabled}
              />
            )}
            {metodosCobro.includes("Stripe") && modo === "crear" && (
              <p className="mt-3 text-xs text-muted">
                Guarda tu negocio primero — después de crearlo, en Configuración podrás conectar tu cuenta de Stripe
                para cobrar con tarjeta de verdad.
              </p>
            )}
          </div>

          {modo === "editar" && entidad?.id && (
            <div className="vc-card">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Integraciones</p>
              <ConectarShopify
                entityId={entidad.id}
                conectado={entidad.shopify_conectado}
                shopDomainActual={entidad.shopify_shop_domain}
              />
            </div>
          )}

          {/* Cuenta ACH originadora (30 sept 2026, pedido de Joel: exportar
              archivo NACHA para subir al portal del banco en vez de copiar/
              pegar nombre+monto a mano) — de aquí sale el dinero de cada
              Corrida de Pago. Solo en modo editar, igual que Relevo/Logo:
              hace falta el id real de la entidad para guardar vía API
              (el número de cuenta se cifra en el servidor, no puede pasar
              por el insert directo de Supabase que usa el resto del form). */}
          {modo === "editar" && entidad?.id && (
            <CuentaACHEntidad
              entityId={entidad.id}
              bankNameActual={entidad.ach_bank_name}
              routingActual={entidad.ach_routing_number}
              accountTypeActual={entidad.ach_account_type}
              companyIdActual={entidad.ach_company_id}
              tieneCuenta={!!entidad.ach_routing_number}
            />
          )}

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

// Debajo de dónde subes el logo va el color de marca — con paleta rápida +
// personalizado, y un preview en vivo calcado del encabezado real del PDF
// (línea + "Total a pagar" grande) para que Joel vea el efecto antes de
// guardar (pedido de Joel, 1 sept 2026).
function SelectorColorFactura({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const colorValido = /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#1D9E75";
  return (
    <div className="rounded-lg border border-border bg-bg p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Color de tus facturas</p>
      <p className="mb-2.5 text-xs text-muted">Se usa en el total y la línea del encabezado — para que vaya acorde con tu logo.</p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {COLORES_MARCA.map((c) => (
          <button
            key={c.hex}
            type="button"
            title={c.nombre}
            onClick={() => onChange(c.hex)}
            className="h-8 w-8 flex-shrink-0 rounded-full border-2"
            style={{ background: c.hex, borderColor: colorValido.toLowerCase() === c.hex.toLowerCase() ? "var(--text)" : "transparent" }}
          />
        ))}
        <label
          className="relative flex h-8 w-8 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-border text-muted"
          title="Color personalizado"
        >
          <i className="ti ti-color-picker" style={{ fontSize: 14 }} />
          <input
            type="color"
            value={colorValido}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white p-3">
        <div className="mb-2 h-[2px] w-full" style={{ background: colorValido }} />
        <div className="flex items-end justify-between">
          <p className="text-[9px] uppercase tracking-wide" style={{ color: "#8a8a8a" }}>
            Total a pagar
          </p>
          <p className="text-lg font-bold" style={{ color: colorValido }}>
            $1,410.00
          </p>
        </div>
      </div>
    </div>
  );
}

// Bancos de PR con routing number conocido — Joel confirmó que la mayoría
// de sus clientes bancean con estos 3 (conversación con su CPA Gem, 30 sept
// 2026). "Otro" deja escribir el routing a mano.
const BANCOS_ACH: { nombre: string; routing: string }[] = [
  { nombre: "BPPR", routing: "021502011" },
  { nombre: "FirstBank", routing: "021502228" },
  { nombre: "Oriental", routing: "021502914" },
];

function CuentaACHEntidad({
  entityId,
  bankNameActual,
  routingActual,
  accountTypeActual,
  companyIdActual,
  tieneCuenta,
}: {
  entityId: string;
  bankNameActual?: string | null;
  routingActual?: string | null;
  accountTypeActual?: string | null;
  companyIdActual?: string | null;
  tieneCuenta: boolean;
}) {
  const [bankName, setBankName] = useState(bankNameActual ?? "BPPR");
  const [routing, setRouting] = useState(routingActual ?? BANCOS_ACH[0].routing);
  const [accountNumber, setAccountNumber] = useState("");
  const [accountType, setAccountType] = useState(accountTypeActual === "savings" ? "savings" : "checking");
  const [companyId, setCompanyId] = useState(companyIdActual ?? "");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function escogerBanco(nombre: string) {
    setBankName(nombre);
    const preset = BANCOS_ACH.find((b) => b.nombre === nombre);
    if (preset) setRouting(preset.routing);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const res = await fetch(`/api/entidades/${entityId}/banca`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankName, routingNumber: routing, accountNumber, accountType, companyId }),
    });
    setGuardando(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "No se pudo guardar la cuenta ACH.");
      return;
    }
    setAccountNumber("");
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  return (
    <div className="vc-card">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Cuenta ACH — para exportar archivo NACHA</p>
      <p className="mb-3 text-xs text-muted">
        De esta cuenta sale el dinero cuando descargas el archivo .ach de una Corrida de Pago para subirlo al portal de tu
        banco. Opcional — si no la llenas, sigues pudiendo copiar/pegar los pagos a mano como hasta ahora.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Banco">
          <select className="vc-input" value={bankName} onChange={(e) => escogerBanco(e.target.value)}>
            {BANCOS_ACH.map((b) => (
              <option key={b.nombre} value={b.nombre}>
                {b.nombre}
              </option>
            ))}
            <option value="Otro">Otro</option>
          </select>
        </Field>
        <Field label="Routing number">
          <input className="vc-input" value={routing} onChange={(e) => setRouting(e.target.value)} maxLength={9} />
        </Field>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Field label={tieneCuenta ? "Número de cuenta (dejar en blanco = no cambiar)" : "Número de cuenta"}>
          <input
            className="vc-input"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder={tieneCuenta ? "•••• ya archivada" : ""}
          />
        </Field>
        <Field label="Tipo">
          <select className="vc-input" value={accountType} onChange={(e) => setAccountType(e.target.value)}>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
        </Field>
      </div>
      <div className="mt-2">
        <Field label="Company ID (lo da tu banco para originar ACH — a veces es 1 + tu EIN)">
          <input className="vc-input" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="1660123456" />
        </Field>
      </div>
      {error && <p className="mt-2 text-xs text-red">{error}</p>}
      {guardado && <p className="mt-2 text-xs text-teal">✓ Cuenta ACH guardada.</p>}
      <button type="button" className="vc-btn-secondary mt-3" disabled={guardando} onClick={guardar}>
        {guardando ? "Guardando..." : "Guardar cuenta ACH"}
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
