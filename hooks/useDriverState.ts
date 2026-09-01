"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DriverOrder = {
  orderNumber: string;
  serviceKind: "restaurant" | "mandado";
  storeName: string;
  destLabel: string;
  storeLat: number;
  storeLng: number;
  destLat: number;
  destLng: number;
  routeKm: number | null;
  etaMinutes: number | null;
  dispatchStatus: string;
  mandadoState: "assigned" | "pickup_arrival" | "en_route" | "destination_arrival" | "delivered" | null;
  mandadoOriginLabel: string | null;
  mandadoDestinationLabel: string | null;
  mandadoDetails: string | null;
  mandadoOriginReference: string | null;
  mandadoDestinationReference: string | null;
  paymentLabel: string;
  totalPrice: number;
};

type DriverOffer = {
  orderNumber: string;
  serviceKind: "restaurant" | "mandado";
  storeName: string;
  destLabel: string;
  storeLat: number;
  storeLng: number;
  destLat: number;
  destLng: number;
  routeKm: number | null;
  etaMinutes: number | null;
  paymentLabel: string;
  totalPrice: number;
  offerExpiresAt: string;
  mandadoOriginLabel: string | null;
  mandadoDestinationLabel: string | null;
};

type DriverState = {
  connected: boolean;
  estado: "available" | "offline" | "busy" | "offer_pending";
  disponibleHasta: string | null;
  connectedMinutes: number;
  location: { lat: number; lng: number } | null;
  orders: DriverOrder[];
  offer: DriverOffer | null;
};

// Polling intervals
const OFFER_POLL_MS = 1_500;       // 1.5s when active offer (15s TTL window)
const ACTIVE_POLL_MS = 10_000;     // 10s when connected with active order (no offer)
const IDLE_POLL_MS = 15_000;       // 15s when connected, no orders
const DISCONNECTED_POLL_MS = 30_000; // 30s when disconnected

function getPollInterval(state: DriverState | null): number {
  if (!state) return IDLE_POLL_MS;
  if (!state.connected) return DISCONNECTED_POLL_MS;
  if (state.offer) return OFFER_POLL_MS;
  if (state.orders.length > 0) return ACTIVE_POLL_MS;
  return IDLE_POLL_MS;
}

export function useDriverState() {
  const [state, setState] = useState<DriverState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const stateRef = useRef<DriverState | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar estado");
      const data: DriverState = await res.json();
      if (mountedRef.current) {
        setState(data);
        stateRef.current = data;
        setError(null);
        setLoading(false);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Error desconocido");
        setLoading(false);
      }
    }
  }, []);

  // Re-schedule the interval based on current state.
  // Called after each fetch completes to adjust polling rate.
  const rescheduleInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!mountedRef.current) return;
    const ms = getPollInterval(stateRef.current);
    intervalRef.current = setInterval(fetchState, ms);
  }, [fetchState]);

  // Setup polling
  useEffect(() => {
    mountedRef.current = true;
    fetchState().then(() => {
      if (mountedRef.current) rescheduleInterval();
    });

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchState, rescheduleInterval]);

  // Re-adjust interval when state changes (offer appears/disappears)
  useEffect(() => {
    rescheduleInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state, rescheduleInterval]);

  // Pause when tab hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchState().then(() => {
          if (mountedRef.current) rescheduleInterval();
        });
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchState, rescheduleInterval]);

  return { state, loading, error, refetch: fetchState };
}

export type { DriverState, DriverOrder, DriverOffer };
