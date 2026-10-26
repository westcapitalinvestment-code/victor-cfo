"use client";

import { useState } from "react";
import { MODULOS_MANUAL } from "@/lib/manual-usuario";

// Página temporal para subir las capturas del manual (requiere
// MANUAL_CAPTURAS_ABIERTO=1 en Vercel). Quitar el interruptor al terminar.
export default function SubirCapturas() {
  const [modulo, setModulo] = useState(MODULOS_MANUAL[0].id);
  const [paso, setPaso] = useState(1);
  const [msg, setMsg] = useState("");
  const m = MODULOS_MANUAL.find((x) => x.id === modulo)!;

  async function subir(f: File | undefined) {
    if (!f) return;
    const fd = new FormData();
    fd.append("file", f);
    const r = await fetch(`/api/manual/foto/${modulo}/${paso}`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? `OK ${modulo}/${paso}` : `Error: ${j.error ?? r.status}`);
  }

  return (
    <div className="mx-auto max-w-md p-4 text-sm">
      <h1 className="mb-3 text-lg font-semibold">Subir captura del manual</h1>
      <select id="mod" className="vc-input mb-2 w-full" value={modulo} onChange={(e) => { setModulo(e.target.value); setPaso(1); }}>
        {MODULOS_MANUAL.map((x) => <option key={x.id} value={x.id}>{x.id}</option>)}
      </select>
      <select id="paso" className="vc-input mb-2 w-full" value={paso} onChange={(e) => setPaso(Number(e.target.value))}>
        {m.pasos.map((p, i) => <option key={i} value={i + 1}>{i + 1}. {p.titulo}</option>)}
      </select>
      <input id="archivo" type="file" accept="image/*" onChange={(e) => subir(e.target.files?.[0])} />
      <p className="mt-3 font-medium" id="resultado">{msg}</p>
    </div>
  );
}
