"use client";

// Permiso de correo del contacto (0197). Solo se marca si la persona LO DIJO en
// la visita ("sí, escríbame"). Con el permiso, VICTOR le manda automáticamente
// 3 correos cortos; cada uno trae su enlace de baja. El vendedor no tiene que
// hacer nada más.

export type EstadoPermisoCorreo = "activo" | "completo" | "baja" | null;

export function PermisoCorreoCheck({
  checked,
  onChange,
  tipo,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  tipo: "contable" | "negocio";
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2 rounded-lg border border-border p-2 text-xs ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="leading-snug text-muted">
        <span className="font-medium text-ink">{tipo === "contable" ? "El contable me dio permiso para escribirle." : "Esta persona me dio permiso para escribirle."}</span>{" "}
        VICTOR le enviará 3 correos cortos automáticamente, cada uno con su enlace para darse de baja. Márcalo solo si te dijo que sí.
        {disabled && " (Primero escribe su email.)"}
      </span>
    </label>
  );
}

export function PermisoCorreoFila({
  estado,
  tieneEmail,
  onToggle,
}: {
  estado: EstadoPermisoCorreo;
  tieneEmail: boolean;
  onToggle: (dar: boolean) => void;
}) {
  if (!tieneEmail) return null;
  if (estado === "baja") {
    return <span className="text-xs text-muted">Correos: pidió no recibir más</span>;
  }
  if (estado === "activo" || estado === "completo") {
    return (
      <span className="flex items-center gap-2 text-xs">
        <span className="text-teal">{estado === "completo" ? "Correos: serie completa ✓" : "Correos automáticos activos ✓"}</span>
        <button type="button" onClick={() => onToggle(false)} className="text-muted underline">
          Retirar permiso
        </button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => onToggle(true)} className="text-left text-xs font-medium text-teal">
      Me dio permiso para escribirle (activar correos)
    </button>
  );
}
