"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import MandadoCheckout from "@/components/MandadoCheckout";
import type { MandadoDraft } from "@/lib/mandado";

/**
 * Checkout de MANDADOS — ruta dedicada (/mandado/basket).
 *
 * Vive en el route group (mandado) con su propio layout/header, así que es
 * totalmente independiente del basket de restaurantes (/basket). El borrador
 * del mandado se lee de sessionStorage (clave "mandadoCheckoutDraft"), nunca
 * del carrito de restaurantes (zustand basket-store).
 */
export default function MandadoBasketPage() {
  const [draft, setDraft] = useState<MandadoDraft | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setDraft(JSON.parse(sessionStorage.getItem("mandadoCheckoutDraft") || "null"));
    } catch {
      sessionStorage.removeItem("mandadoCheckoutDraft");
      setDraft(null);
    }
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#09193B]" />
      </div>
    );
  }

  return <MandadoCheckout draft={draft} />;
}
