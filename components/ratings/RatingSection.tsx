"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { RatingRole } from "@/lib/order-ratings";
import { StarRating, type StarRatingPayload } from "@/components/ratings/StarRating";

/**
 * Bloque de evaluación auto-contenido: consulta si el pedido es evaluable,
 * evita duplicados y envía la evaluación. No pinta nada si el pedido no puede
 * evaluarse (no entregado, sin permiso o ya evaluado no bloquea: se muestra
 * el cierre "gracias").
 *
 *   - GET  → estado (rateable / alreadyRated)
 *   - POST con el mismo endpoint, body { orderNumber, ...payload }
 */
export function RatingSection({
  orderNumber,
  role,
  endpoint,
  onEngaged,
}: {
  orderNumber: string;
  role: RatingRole;
  endpoint: string;
  /** Avisa al contenedor que el usuario empezó a evaluar (pausar autocierre). */
  onEngaged?: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "ready" | "hidden" | "error">("loading");
  const [alreadyRated, setAlreadyRated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase("loading");
    try {
      const separator = endpoint.includes("?") ? "&" : "?";
      const response = await fetch(
        `${endpoint}${separator}orderNumber=${encodeURIComponent(orderNumber)}`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        // Sin permiso, pedido inexistente o no entregado: no mostramos nada.
        setPhase("hidden");
        return;
      }
      if (!data.rateable && !data.alreadyRated) {
        setPhase("hidden");
        return;
      }
      setAlreadyRated(Boolean(data.alreadyRated));
      setPhase("ready");
    } catch {
      // Fallo de red puntual: ofrecemos reintentar sin romper la pantalla.
      setPhase("error");
    }
  }, [endpoint, orderNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = useCallback(
    async (payload: StarRatingPayload): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderNumber, ...payload }),
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          // Duplicado: se considera resuelto (ya hay evaluación registrada).
          if (data?.code === "duplicate") {
            setSubmitted(true);
            return true;
          }
          setError(data?.error || "No pudimos guardar tu evaluación. Intenta de nuevo.");
          return false;
        }
        setSubmitted(true);
        return true;
      } catch {
        setError("Sin conexión. Revisa tu red e intenta de nuevo.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [endpoint, orderNumber]
  );

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (phase === "hidden" && !submitted) return null;

  // Ya evaluado antes de entrar: mostramos el cierre, sin formulario.
  if (alreadyRated && !submitted) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm font-bold text-[#09193B]">Ya evaluaste este pedido. ¡Gracias!</p>
      </div>
    );
  }

  if (phase === "error" && !submitted) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 text-center shadow-sm">
        <p className="text-sm text-gray-500">No pudimos cargar la evaluación.</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-2 text-xs font-bold text-[#EB1902] underline underline-offset-2"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <StarRating
      role={role}
      submitting={submitting}
      serverError={error}
      submitted={submitted}
      onEngaged={onEngaged}
      onSubmit={handleSubmit}
    />
  );
}
