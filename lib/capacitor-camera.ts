import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

// Cámara nativa (30 sept 2026, app empacada con Capacitor para App Store/
// Google Play) — capacidad real que Apple exige para pasar la revisión
// 4.2 ("Minimum Functionality"), y de paso se siente mejor que el
// `<input type="file" capture="environment">` de la PWA (abre la cámara
// del sistema directo, sin el chrome del navegador alrededor).
//
// Fuera de la app nativa (navegador/PWA instalada) sigue sirviendo el
// input de siempre — este helper solo se usa cuando
// Capacitor.isNativePlatform() es true.
export function camaraNativaDisponible(): boolean {
  return Capacitor.isNativePlatform();
}

// Devuelve un File normal (mismo tipo que entrega un <input type="file">)
// para que el resto del formulario (FormData, preview, etc.) no tenga que
// saber si el archivo vino de la cámara nativa o de un input HTML — mismo
// "shape" en los dos casos.
export async function tomarFotoNativa(): Promise<File | null> {
  const foto = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    quality: 85,
    saveToGallery: false,
  });

  if (!foto.base64String) return null;

  const mime = `image/${foto.format || "jpeg"}`;
  const res = await fetch(`data:${mime};base64,${foto.base64String}`);
  const blob = await res.blob();
  return new File([blob], `foto-${Date.now()}.${foto.format || "jpg"}`, { type: mime });
}
