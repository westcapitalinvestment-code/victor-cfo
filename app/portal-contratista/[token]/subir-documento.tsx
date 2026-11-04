"use client";

import { useState } from "react";

// Formulario del portal del contratista: enviar documentos (quedan "en
// revisión" hasta que el dueño los acepta) y actualizar dirección/correo.
export default function SubirDocumento({ token, direccion, correo }: { token: string; direccion: string; correo: string }) {
  const [tipo, setTipo] = useState<"relevo" | "registro_comerciante">("registro_comerciante");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [pct, setPct] = useState("6");
  const [fecha, setFecha] = useState("");
  const [dir, setDir] = useState(direccion);
  const [mail, setMail] = useState(correo);
  const [msg, setMsg] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviarDoc() {
    setMsg(null);
    if (!archivo) return setMsg("Escoge el PDF.");
    if (tipo === "relevo" && !fecha) return setMsg("Indica la fecha de expiración del relevo.");
    setCargando(true);
    const fd = new FormData();
    fd.append("file", archivo);
    fd.append("tipo", tipo);
    if (tipo === "relevo") {
      fd.append("relevoPct", pct);
      fd.append("relevoFechaExpiracion", fecha);
    }
    const res = await fetch(`/api/portal-contratista/${token}/subir`, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok) return setMsg(j.error ?? "No se pudo enviar.");
    setMsg("Enviado. Quedó en revisión; el negocio lo aceptará.");
    setArchivo(null);
    setTimeout(() => window.location.reload(), 1200);
  }

  async function guardarDatos() {
    setMsg(null);
    setCargando(true);
    const res = await fetch(`/api/portal-contratista/${token}/datos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: dir, email: mail }),
    });
    const j = await res.json().catch(() => ({}));
    setCargando(false);
    setMsg(res.ok ? "Datos guardados." : j.error ?? "No se pudo guardar.");
  }

  const campo = { width: "100%", padding: "8px 10px", border: "1px solid #d9e3df", borderRadius: 8, fontSize: 14, boxSizing: "border-box" as const };
  const boton = { background: "#1D9E75", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };

  return (
    <div style={{ marginTop: 14, borderTop: "1px solid #eef3f1", paddingTop: 12, display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>Enviar un documento (PDF, máx. 5 MB)</div>
      <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} style={campo}>
        <option value="registro_comerciante">Registro de Comerciante</option>
        <option value="relevo">Certificado de Relevo de Retención</option>
      </select>
      {tipo === "relevo" && (
        <div style={{ display: "flex", gap: 8 }}>
          <select value={pct} onChange={(e) => setPct(e.target.value)} style={campo}>
            <option value="6">Relevo parcial (6%)</option>
            <option value="0">Relevo total (0%)</option>
          </select>
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={campo} aria-label="Fecha de expiración" />
        </div>
      )}
      <input type="file" accept="application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} style={{ fontSize: 13 }} />
      <button onClick={enviarDoc} disabled={cargando} style={boton}>Enviar documento</button>

      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>Actualizar mis datos</div>
      <input value={dir} onChange={(e) => setDir(e.target.value)} placeholder="Dirección postal" style={campo} />
      <input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Correo electrónico" type="email" style={campo} />
      <button onClick={guardarDatos} disabled={cargando} style={boton}>Guardar datos</button>
      {msg && <div style={{ fontSize: 13, color: "#1D9E75" }}>{msg}</div>}
    </div>
  );
}
