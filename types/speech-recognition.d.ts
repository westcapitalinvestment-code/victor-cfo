// Tipos mínimos para la Web Speech API — no viene incluida en el lib.dom.d.ts
// de TypeScript porque todavía no es un estándar W3C final, aunque Chrome y
// Edge la soportan hace años bajo el prefijo "webkit". Se usa solo para el
// botón de dictado por voz en app/dashboard/victor-chat.tsx.

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly [index: number]: SpeechRecognitionAlternative;
  readonly length: number;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  readonly [index: number]: SpeechRecognitionResult;
  readonly length: number;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

// Agregado 28 agosto 2026 — faltaba, y sin esto no se puede leer
// event.error para decirle al usuario POR QUÉ falló el micrófono (permiso
// denegado, sin red, sin voz detectada, etc.) en vez de fallar en silencio.
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

interface Window {
  SpeechRecognition?: typeof SpeechRecognition;
  webkitSpeechRecognition?: typeof SpeechRecognition;
}
