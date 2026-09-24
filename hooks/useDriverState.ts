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
  /** Dirección de la tienda/punto de recogida (información secundaria). */
  storeAddress: string | null;
  /** Qué recoger: nombres de productos (restaurantes) hasta 3. */
  itemsSummary: string[] | null;
  /** Cantidad del primer producto (restaurantes). */
  itemsQuantity: number | null;
  paymentLabel: string;
  totalPrice: number;
  /** Nombre del cliente/destinatario (para el contexto de entrega). */
  customerName: string | null;
  /** true ⇔ la entrega requiere NIP (decidido por el gate del servidor). */
  requiresDeliveryPin: boolean;
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
  /** Ventana vigente: PENDING_DELIVERY = entrega; ACTIVE = respuesta (14 s). */
  offerExpiresAt: string;
  offerStatus: "pending_delivery" | "active" | null;
  offerId: string | null;
  offerCreatedAt: string | null;
  offerDeliveryDeadlineAt: string | null;
  offerShownAt: string | null;
  /** Reloj del servidor al consultar (fuente de verdad del contador). */
  serverNow: string;
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
  /** true ⇔ hay orden activa (servicio en curso, independiente de la sesión). */
  inService?: boolean;
  /** true ⇔ sesión de disponibilidad vigente. */
  sessionValid?: boolean;
  /** Intención: false = no recibirá nuevas ofertas al terminar el servicio. */
  aceptaNuevasOfertas?: boolean;
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
      const payload = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : null) || "Error al cargar estado";

        throw new Error(message);
      }

      const data: DriverState = payload as DriverState;
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
