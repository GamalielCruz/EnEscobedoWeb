"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { RatingSection } from "@/components/ratings/RatingSection";

/**
 * Punto de entrada a la evaluación desde el HISTORIAL de pedidos.
 *
 * El Historial puede tener decenas de pedidos, así que NO montamos la
 * evaluación de todos: mostramos un botón compacto y solo al tocar montamos
 * `RatingSection` (que consulta el estado real y decide si se puede evaluar).
 * Así la página no dispara N peticiones al abrirse.
 */
export function OrderHistoryRating({ orderNumber }: { orderNumber: string }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="mt-3">
        <RatingSection
          orderNumber={orderNumber}
          role="customer"
          endpoint={`/api/orders/${encodeURIComponent(orderNumber)}/rating`}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition hover:bg-red-50"
      style={{ borderColor: "#EB1901", color: "#EB1901" }}
    >
      <Star className="h-3.5 w-3.5" />
      Calificar al repartidor
    </button>
  );
}