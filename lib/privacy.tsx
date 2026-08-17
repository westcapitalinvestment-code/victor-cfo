"use client";

import { useEffect, useState } from "react";

// El "ojito" de privacidad del mockup (VICTOR — Dashboard Core.html,
// togglePriv()/class .sensitive) — oculta montos en pantalla cuando el
// usuario está en público. Es puramente visual/cliente: no toca nada del
// servidor, solo enmascara lo que ya se le mandó al navegador. Se guarda
// en localStorage para que la preferencia sobreviva entre páginas.

const STORAGE_KEY = "victor_hide_sensitive";
const EVENT_NAME = "victor:privacy-changed";

function readHidden(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

function setHidden(hidden: boolean) {
  window.localStorage.setItem(STORAGE_KEY, hidden ? "1" : "0");
  window.dispatchEvent(new Event(EVENT_NAME));
}

function useHiddenState(): boolean {
  const [hidden, setHiddenState] = useState(false);

  useEffect(() => {
    setHiddenState(readHidden());
    const onChange = () => setHiddenState(readHidden());
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  return hidden;
}

// Envuelve cualquier monto/número sensible: <Sensitive>{`$4,832.40`}</Sensitive>
export function Sensitive({ children, mask = "••••••" }: { children: React.ReactNode; mask?: string }) {
  const hidden = useHiddenState();
  return <>{hidden ? mask : children}</>;
}

// El botón "ojito" — colócalo donde estaba el eye del mockup (dentro del
// balance verde, o en el topbar). Alterna el estado global de privacidad.
export function PrivacyToggle({ className = "vc-eye" }: { className?: string }) {
  const hidden = useHiddenState();
  return (
    <button
      type="button"
      onClick={() => setHidden(!hidden)}
      className={className}
      title={hidden ? "Mostrar montos" : "Ocultar montos"}
      aria-label={hidden ? "Mostrar montos" : "Ocultar montos"}
    >
      <i className={`ti ${hidden ? "ti-eye-off" : "ti-eye"}`} />
    </button>
  );
}
