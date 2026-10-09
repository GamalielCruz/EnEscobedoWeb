"use client";

import { useCallback, useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { RatingSection } from "@/components/ratings/RatingSection";

/**
 * TARJETA DE CALIFICACIÓN del cliente.
 *
 * Al abrir la app, si hay un pedido entregado hace MENOS DE 72 HORAS y sin
 * evaluar, se muestra esta tarjeta. Pasada la ventana, el servidor ya no lo
 * devuelve y la tarjeta no se pinta.
 *
 * "Ahora no" solo pospone durante la sesión (sessionStorage): el recordatorio
 * no desaparece para siempre ni se convierte en una molestia persistente.
 */

type Pending = { orderNumber: string; deliveredAt: string; driverName: string | null };

const dismissKey = (orderNumber: string) => `ratingPromptDismissed:${orderNumber}`;

export function PendingRatingPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/orders/rating/pending", { cache: "no-store" });
        const body = await res.json().catch(() => null);
        if (cancelled || !res.ok || !body?.ok || !body?.pending) return;
        const next = body.pending as Pending;
        if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(dismissKey(next.orderNumber))) {
          return;
        }
        setPending(next);
      } catch {
        // Fail-closed: si no se puede consultar, no se muestra nada.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (pending) {
      try {
        sessionStorage.setItem(dismissKey(pending.orderNumber), "1");
      } catch {
        // sessionStorage puede fallar en modo privado: se oculta igual.
      }
    }
    setDismissed(true);
  }, [pending]);

  if (!pending || dismissed) return null;

  return (
    <section aria-label="Califica tu último pedido" className="w-full">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-black text-[#09193B]">
          <Star className="h-4 w-4" style={{ color: "#EB1901" }} fill="#EB1901" />
          Califica tu último pedido
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex items-center gap-1 text-xs font-bold text-gray-400 transition hover:text-gray-600"
        >
          <X className="h-3.5 w-3.5" />
          Ahora no
        </button>
      </div>
      <RatingSection
        orderNumber={pending.orderNumber}
        role="customer"
        endpoint={`/api/orders/${encodeURIComponent(pending.orderNumber)}/rating`}
      />
    </section>
  );
}