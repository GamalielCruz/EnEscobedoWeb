"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CustomerTrackingPhase } from "@/lib/order-tracking";

// ────────────────────────────────────────────────────────────────────
// Sondeo ligero del estado del pedido (tiempo casi real, sin recargas).
// Intervalo lento por defecto; mientras se BUSCA repartidor, el intervalo es
// más corto para reaccionar rápido a la asignación.
// Errores de red: se toleran hasta `maxMisses` ciclos seguidos antes de
// reportar desconexión (el pedido NO falla por perder conexión temporalmente).
// ────────────────────────────────────────────────────────────────────

export type TrackingDriver = {
  nombre: string | null;
  foto: unknown;
  calificacion: number | null;
};

export type TrackingSummary = {
  storeName: string;
  storeAddress: string;
  destination: string;
  destinationReference: string;
  items: Array<{ quantity: number; name: string }>;
  total: number | null;
  currency: string;
};

export type TrackingState = {
  orderNumber: string;
  orderId: string;
  phase: CustomerTrackingPhase;
  phaseLabel: string;
  phaseHint: string | null;
  prolonged: { message: string; hint: string } | null;
  canCancel: boolean;
  paymentMethod: string | null;
  paymentStatus: string | null;
  driver: TrackingDriver | null;
  summary: TrackingSummary;
  updatedAt: string | null;
};

type FetchState = "idle" | "polling" | "reconnecting";

const FAST_INTERVAL_MS = 6000; // buscando repartidor: reacción rápida
const SLOW_INTERVAL_MS = 20000; // ya asignado: el viaje es más lento
const MAX_MISSES = 3;

export function useOrderTracking(orderNumber: string | null) {
  const [state, setState] = useState<TrackingState | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [notFound, setNotFound] = useState(false);
  const missesRef = useRef(0);

  const fetchOnce = useCallback(async () => {
    if (!orderNumber) return;
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNumber)}`, {
        cache: "no-store",
      });
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as TrackingState;
      missesRef.current = 0;
      setFetchState("polling");
      setState(data);
    } catch {
      missesRef.current += 1;
      if (missesRef.current >= MAX_MISSES) {
        setFetchState("reconnecting");
      }
      // Si el fallo es puntual, conservamos el último estado conocido y la
      // UI sigue mostrando la fase anterior (sin parpadeos).
    }
  }, [orderNumber]);

  useEffect(() => {
    if (!orderNumber) return;
    let cancelled = false;
    let timer: number | undefined;

    const loop = async () => {
      if (cancelled) return;
      await fetchOnce();
      if (cancelled) return;
      const current = state;
      const interval =
        current?.phase === "searching" ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
      timer = window.setTimeout(loop, interval);
    };

    void loop();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
    // `state` se lee por referencia en el loop para elegir intervalo sin
    // reiniciar el ciclo en cada cambio; el ref no es necesario porque el
    // closure se recrea con cada render y el timeout corto lo mantiene vivo.
  }, [orderNumber, fetchOnce, state?.phase]);

  return { state, fetchState, notFound, refresh: fetchOnce };
}
