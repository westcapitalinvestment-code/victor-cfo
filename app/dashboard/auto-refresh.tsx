"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Si alguien deja la app abierta todo el día sin tocarla (ej. en la
// computadora), los datos del dashboard se quedaban congelados en lo que
// había cuando cargó la página — la sincronización de Plaid de las 9am
// nunca aparecía hasta que el usuario cerraba y reabría. Este componente
// invisible refresca los Server Components de la página actual cada 30
// minutos (mientras la pestaña esté visible), y también en cuanto el
// usuario vuelve después de tener la app en background un rato.
//
// router.refresh() solo vuelve a pedir los datos de Supabase para la ruta
// actual — no llama a Plaid ni recarga toda la página ni pierde el estado
// del chat, así que es liviano y seguro de correr seguido.
const INTERVALO_MS = 30 * 60 * 1000; // 30 minutos

export default function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, INTERVALO_MS);

    function alVolver() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", alVolver);

    return () => {
      clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [router]);

  return null;
}
