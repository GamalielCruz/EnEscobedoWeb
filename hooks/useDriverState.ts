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

const ACTIVE_POLL_MS = 10_000;   // 10s when connected with active order
const IDLE_POLL_MS = 15_000;     // 15s when connected, no orders
const DISCONNECTED_POLL_MS = 30_000; // 30s when disconnected

export function useDriverState() {
  const [state, setState] = useState<DriverState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/driver/state", { cache: "no-store" });
      if (!res.ok) throw new Error("Error al cargar estado");
      const data: DriverState = await res.json();
      if (mountedRef.current) {
        setState(data);
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

  // Determine polling interval based on state
  const getInterval = useCallback(() => {
    if (!state) return IDLE_POLL_MS;
    if (!state.connected) return DISCONNECTED_POLL_MS;
    if (state.orders.length > 0 || state.offer) return ACTIVE_POLL_MS;
    return IDLE_POLL_MS;
  }, [state]);

  // Setup polling
  useEffect(() => {
    mountedRef.current = true;
    fetchState();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchState]);

  // Re-setup interval when state changes
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchState, getInterval());

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchState, getInterval]);

  // Pause when tab hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchState();
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(fetchState, getInterval());
      } else {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [fetchState, getInterval]);

  return { state, loading, error, refetch: fetchState };
}

export type { DriverState, DriverOrder, DriverOffer };
