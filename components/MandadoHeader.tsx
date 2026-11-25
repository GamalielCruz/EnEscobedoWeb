"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * Header propio del flujo de MANDADOS.
 *
 * Mandados vive como una "app" aparte del restaurante: tiene su propio layout
 * (app/(mandado)/layout.tsx) y por lo tanto su propio header, en lugar del
 * header/footer de restaurante que usa /basket. Misma estética operativa del
 * repartidor: barra navy sólida, botón cuadrado y tipografía fuerte.
 */
export function MandadoHeader({ title = "Tu mandado" }: { title?: string }) {
  const router = useRouter();

  return (
    <header
      className="sticky top-0 z-40 flex items-center gap-2 bg-[#09193B] px-2 pb-3 text-white"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <button
        type="button"
        onClick={() => router.push("/?service=mandado")}
        aria-label="Volver a mandados"
        className="flex h-10 w-10 shrink-0 items-center justify-center transition active:bg-white/10"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="min-w-0 flex-1 truncate text-base font-black uppercase tracking-wide">
        {title}
      </h1>
    </header>
  );
}
