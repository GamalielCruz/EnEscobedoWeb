"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Frontera de error SOLO para /drive.
 *
 * No oculta el error: lo registra completo en consola para diagnóstico. La UI
 * sustituye la pantalla genérica "¡Ups! Algo salió mal" por un estado del
 * repartidor con reintento, porque en Drive la mayoría de fallos son
 * transitorios (carga de sesión de Clerk, Google Maps aún inicializando,
 * API momentáneamente no disponible). Nunca se elimina la autenticación.
 */
export default function DriveError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[drive] error boundary", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#09193B] p-4">
      <div className="w-full max-w-sm text-center">
        <p className="text-lg font-bold text-white">No pudimos cargar tu panel</p>
        <p className="mt-2 text-sm text-white/70">
          Puede ser una interrupción momentánea de la sesión o de la conexión.
        </p>
        <button
          onClick={() => reset()}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#EB1902] px-6 py-2.5 text-sm font-bold text-white transition hover:bg-[#850C22]"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </button>
      </div>
    </div>
  );
}
