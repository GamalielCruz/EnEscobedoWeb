"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, SignIn } from "@clerk/nextjs";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  MapPin,
  Navigation,
  Package,
  Store,
  Clock,
  CheckCircle,
  XCircle,
  Phone,
  MessageCircle,
} from "lucide-react";
import { useDriverState, type DriverOrder, type DriverOffer } from "@/hooks/useDriverState";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useOfferAlertSound } from "@/hooks/useOfferAlertSound";
import { ThinkingOrb } from "thinking-orbs";
import { shortOrderCode, estimateEtaMinutes } from "@/lib/dispatch/dispatch-format";
import { getRoadRoute, type RoadRoute } from "@/lib/dispatch/routing";

// ── Map config ─────────────────────────────────────────────────────

const DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };
const containerStyle = { width: "100%", height: "100%" };
const mapOptions = {
  disableDefaultUI: true,
  zoomControl: false,
  gestureHandling: "greedy",
  clickableIcons: false,
  styles: [
    { featureType: "poi.business", elementType: "labels", stylers: [{ visibility: "off" }] },
  ],
};

// ── Pin SVG ────────────────────────────────────────────────────────

const driverPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#3B82F6" stroke="#1E40AF" stroke-width="2"/>
  <circle cx="16" cy="16" r="5" fill="white"/>
</svg>`;

const storePinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path fill="#F97316" d="M14 2C9.03 2 5 6.03 5 11c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z"/>
  <circle cx="14" cy="11" r="3" fill="white"/>
</svg>`;

const destPinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <path fill="#EF4444" d="M14 2C9.03 2 5 6.03 5 11c0 6.75 9 15 9 15s9-8.25 9-15c0-4.97-4.03-9-9-9z"/>
  <circle cx="14" cy="11" r="3" fill="white"/>
</svg>`;

// ── Action helpers ─────────────────────────────────────────────────

function getMandadoAction(order: DriverOrder): { label: string; action: string; icon: React.ReactNode } {
  switch (order.mandadoState) {
    case "assigned":
      return { label: "NAVEGAR A RECOLECCIÓN", action: "navigate_pickup", icon: <Navigation className="h-5 w-5" /> };
    case "pickup_arrival":
      return { label: "YA RECOGÍ EL MANDADO", action: "picked_up", icon: <Package className="h-5 w-5" /> };
    case "en_route":
      return { label: "NAVEGAR A ENTREGA", action: "navigate_delivery", icon: <Navigation className="h-5 w-5" /> };
    case "destination_arrival":
      return { label: "CONFIRMAR ENTREGA", action: "delivered", icon: <CheckCircle className="h-5 w-5" /> };
    default:
      return { label: "VER PEDIDO", action: "view", icon: <Package className="h-5 w-5" /> };
  }
}

function getRestaurantAction(order: DriverOrder): { label: string; action: string; icon: React.ReactNode } {
  switch (order.dispatchStatus) {
    case "accepted":
      return { label: "NAVEGAR A RECOLECCIÓN", action: "navigate_pickup", icon: <Navigation className="h-5 w-5" /> };
    case "at_door":
      return { label: "CONFIRMAR ENTREGA", action: "delivered", icon: <CheckCircle className="h-5 w-5" /> };
    default:
      return { label: "VER PEDIDO", action: "view", icon: <Package className="h-5 w-5" /> };
  }
}

// ── External navigation helpers ───────────────────────────────────────
// La polyline del mapa es SOLO la vista previa de la ruta; el botón abre la
// app de navegación del dispositivo hacia las coordenadas exactas del tramo
// actual (recolección o entrega).

function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS se anuncia como Mac, pero con pantalla táctil
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

/**
 * URL de navegación por plataforma:
 * - iOS → Apple Maps (maps.apple.com abre la app en el dispositivo)
 * - Android/desktop → Google Maps (en Android abre la app; en desktop, la web)
 * El `destination` puede ser "lat,lng" (coordenadas exactas) o una dirección.
 */
function buildDirectionsUrl(destination: string): string {
  const encoded = encodeURIComponent(destination);
  if (isIOSDevice()) {
    return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encoded}&travelmode=driving`;
}

/**
 * Punto de navegación real para el tramo actual del pedido:
 * - navigate_pickup → coordenadas de la RECOLECCIÓN (storeLat/storeLng)
 * - navigate_delivery → coordenadas de la ENTREGA (destLat/destLng)
 * Si las coordenadas no existen (0/0), se cae al texto de la dirección real
 * del pedido en lugar de abrir la app en un punto inventado.
 */
function getOrderLegTarget(
  order: DriverOrder,
  action: string
): { destination: string; hasCoordinates: boolean } | null {
  if (action !== "navigate_pickup" && action !== "navigate_delivery") return null;
  const isPickup = action === "navigate_pickup";
  const lat = isPickup ? order.storeLat : order.destLat;
  const lng = isPickup ? order.storeLng : order.destLng;
  const fallbackLabel = isPickup
    ? (order.mandadoOriginLabel ?? order.storeName)
    : (order.mandadoDestinationLabel ?? order.destLabel);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
  if (hasCoordinates) {
    return { destination: `${lat},${lng}`, hasCoordinates: true };
  }
  if (fallbackLabel) {
    return { destination: fallbackLabel, hasCoordinates: false };
  }
  return null;
}

function getOrderAction(order: DriverOrder) {
  return order.serviceKind === "mandado"
    ? getMandadoAction(order)
    : getRestaurantAction(order);
}

// ── Main component ─────────────────────────────────────────────────

export default function DrivePage() {
  const { isSignedIn } = useAuth();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: "driver-app-google-maps",
    googleMapsApiKey: apiKey,
  });

  const { state, loading, error: stateError, refetch } = useDriverState();
  const { location: gpsLocation, error: gpsError } = useDriverLocation(state?.connected ?? false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Sound alert for new offers ──────────────────────────────
  const { notifyOfferChange, stopAlertImmediate, resetAction } = useOfferAlertSound();

  // ── Offer expiration detection ─────────────────────────────
  // Track previous offer to detect when it disappears without user action
  const prevOfferRef = useRef<DriverOffer | null>(null);
  const actionJustCompletedRef = useRef(false);

  // Track offer changes → play/stop sound + detect expiration
  useEffect(() => {
    const hadOffer = prevOfferRef.current !== null;
    const hasOffer = state?.offer !== null;
    const offerDisappeared = hadOffer && !hasOffer;

    if (state?.offer) {
      notifyOfferChange(state.offer.orderNumber, state.offer.offerExpiresAt);
    } else {
      notifyOfferChange(null, null);
    }

    // If offer disappeared without user action → it expired
    // Trigger immediate release + redispatch on the server
    if (offerDisappeared && !actionJustCompletedRef.current) {
      fetch("/api/driver/check-expired-offer", { method: "POST" }).catch(() => {});
    }

    prevOfferRef.current = state?.offer ?? null;
  }, [state?.offer, notifyOfferChange]);

  // Stop sound on unmount
  useEffect(() => {
    return () => stopAlertImmediate();
  }, [stopAlertImmediate]);

  // Current position: GPS if available, otherwise from state
  const currentLocation = useMemo(() => {
    if (gpsLocation) return gpsLocation;
    if (state?.location) return state.location;
    return DEFAULT_CENTER;
  }, [gpsLocation, state?.location]);

  // Active order for navigation target
  const activeOrder = state?.orders?.[0] ?? null;

  // Navigation target based on order action
  const navTarget = useMemo(() => {
    if (!activeOrder) return null;
    const action = getOrderAction(activeOrder);
    if (action.action === "navigate_pickup") {
      return { lat: activeOrder.storeLat, lng: activeOrder.storeLng, label: activeOrder.storeName };
    }
    if (action.action === "navigate_delivery") {
      return { lat: activeOrder.destLat, lng: activeOrder.destLng, label: activeOrder.destLabel };
    }
    return null;
  }, [activeOrder]);

  // Ruta vial dibujada sobre el mapa (Google Directions + caché dentro de
  // lib/dispatch/routing.ts). El caché hace que los ticks de GPS no llamen a
  // la API: solo se recalcula cuando el origen se mueve >200 m o cambia el
  // destino. Si la API falla, roadRoute es null y se cae a la línea recta.
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);

  useEffect(() => {
    if (!navTarget || !mapsLoaded) {
      setRoadRoute(null);
      return;
    }
    let cancelled = false;
    getRoadRoute(currentLocation, navTarget).then((route) => {
      if (!cancelled) setRoadRoute(route);
    });
    return () => {
      cancelled = true;
    };
  }, [currentLocation, navTarget, mapsLoaded]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleSession = useCallback(
    async (action: "connect" | "disconnect") => {
      setActionLoading("session");
      try {
        await fetch("/api/driver/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        await refetch();
      } finally {
        setActionLoading(null);
      }
    },
    [refetch]
  );

  const handleAction = useCallback(
    async (action: string, orderNumber: string) => {
      // Navigation actions open the device's maps app toward the exact
      // coordinates of the order that owns the button (recolección o entrega)
      if (action === "navigate_pickup" || action === "navigate_delivery") {
        const order = state?.orders.find((o) => o.orderNumber === orderNumber) ?? activeOrder;
        const target = order ? getOrderLegTarget(order, action) : null;
        if (target) {
          window.open(buildDirectionsUrl(target.destination), "_blank", "noopener");
        }
        return;
      }

      // Backend actions
      setActionLoading(orderNumber);
      try {
        await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, orderNumber }),
        });
        await refetch();
      } finally {
        setActionLoading(null);
      }
    },
    [state?.orders, activeOrder, refetch]
  );

  const handleOffer = useCallback(
    async (action: "accept" | "reject", orderNumber: string) => {
      // Mark that user initiated an action → suppress expiration detection
      actionJustCompletedRef.current = true;
      // Stop sound immediately and suppress re-activation during action
      stopAlertImmediate();
      setActionLoading(`offer-${orderNumber}`);
      try {
        await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, orderNumber }),
        });
        await refetch();
      } finally {
        actionJustCompletedRef.current = false;
        resetAction();
        setActionLoading(null);
      }
    },
    [refetch, stopAlertImmediate, resetAction]
  );

  // ── Not signed in ────────────────────────────────────────────────

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09193B] p-4">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-center text-2xl font-bold text-white">
            🚗 ElMenu Driver
          </h1>
          <SignIn
            routing="hash"
            appearance={{
              elements: {
                card: "bg-white rounded-2xl shadow-xl",
                formButtonPrimary: "bg-[#EB1902] hover:bg-[#850C22]",
              },
            }}
          />
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09193B]">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#EB1902]" />
          <p className="mt-3 text-sm text-white/60">Cargando...</p>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────

  if (stateError && !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#09193B] p-4">
        <div className="text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-400" />
          <p className="mt-3 text-sm text-white/80">{stateError}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 rounded-xl bg-[#EB1902] px-6 py-2 text-sm font-bold text-white"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const connected = state?.connected ?? false;
  const orders = state?.orders ?? [];
  const offer = state?.offer ?? null;

  // ── Main UI ──────────────────────────────────────────────────────

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      {/* Status Bar */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 safe-area-top">
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-green-400 animate-pulse" : "bg-gray-500"
            }`}
          />
          <span className="text-xs font-bold uppercase tracking-wide text-white/80">
            {connected
              ? state?.estado === "busy"
                ? "Ocupado"
                : state?.estado === "offer_pending"
                  ? "Oferta pendiente"
                  : "Disponible"
              : "Desconectado"}
          </span>
        </div>
        {connected && state?.disponibleHasta && (
          <span className="text-xs text-white/50">
            <Clock className="mr-1 inline h-3 w-3" />
            {(() => {
              const remaining = Math.max(
                0,
                Math.round(
                  (new Date(state.disponibleHasta).getTime() - Date.now()) / 60000
                )
              );
              const h = Math.floor(remaining / 60);
              const m = remaining % 60;
              return h > 0 ? `${h}h ${m}min` : `${m}min`;
            })()}
          </span>
        )}
      </div>

      {/* GPS Warning */}
      {gpsError && connected && (
        <div className="absolute top-12 left-0 right-0 z-20 mx-4 rounded-lg bg-amber-500/20 px-3 py-2 text-xs text-amber-300">
          ⚠️ {gpsError}
        </div>
      )}

      {/* Map */}
      <div className="flex-1">
        {mapsLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={currentLocation}
            zoom={15}
            options={mapOptions}
          >
            {/* Driver marker */}
            <Marker
              position={currentLocation}
              icon={{
                url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(driverPinSvg)}`,
                scaledSize: new google.maps.Size(32, 32),
                anchor: new google.maps.Point(16, 16),
              }}
            />

            {/* Store marker */}
            {activeOrder && (
              <Marker
                position={{ lat: activeOrder.storeLat, lng: activeOrder.storeLng }}
                icon={{
                  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(storePinSvg)}`,
                  scaledSize: new google.maps.Size(28, 28),
                  anchor: new google.maps.Point(14, 28),
                }}
                label={{
                  text: activeOrder.storeName,
                  className: "text-[10px] font-bold bg-white rounded px-1 shadow-sm whitespace-nowrap",
                }}
              />
            )}

            {/* Destination marker */}
            {activeOrder && (
              <Marker
                position={{ lat: activeOrder.destLat, lng: activeOrder.destLng }}
                icon={{
                  url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(destPinSvg)}`,
                  scaledSize: new google.maps.Size(28, 28),
                  anchor: new google.maps.Point(14, 28),
                }}
                label={{
                  text: "Entrega",
                  className: "text-[10px] font-bold bg-white rounded px-1 shadow-sm",
                }}
              />
            )}

            {/* Route line: ruta vial real (Google Directions) cuando está
                disponible; línea recta solo como fallback si la API falla */}
            {navTarget && (
              <Polyline
                path={roadRoute?.path ?? [currentLocation, navTarget]}
                options={{
                  strokeColor: "#3B82F6",
                  strokeWeight: 4,
                  strokeOpacity: 0.7,
                  geodesic: true,
                }}
              />
            )}
          </GoogleMap>
        ) : (
          <div className="flex h-full items-center justify-center bg-[#0d1526]">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        )}
      </div>

      {/* Bottom Sheet */}
      <div className="relative z-10 rounded-t-3xl bg-white shadow-2xl safe-area-bottom">
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-300" />

        <div className="max-h-[50vh] overflow-y-auto px-4 pb-6 pt-2">
          {/* Not connected → INICIAR (sesión abierta, sin duración) */}
          {!connected && (
            <div className="py-4 text-center">
              <h2 className="text-lg font-bold text-[#09193B]">
                Estás desconectado
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Inicia para recibir pedidos
              </p>

              <button
                onClick={() => handleSession("connect")}
                disabled={actionLoading === "session"}
                className="mt-4 w-full rounded-2xl bg-[#EB1902] py-4 text-lg font-black text-white shadow-lg shadow-[#EB1902]/30 transition active:scale-95"
              >
                {actionLoading === "session" ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : (
                  "INICIAR"
                )}
              </button>
            </div>
          )}

          {/* Connected → Offer */}
          {connected && offer && (
            <OfferCard
              offer={offer}
              loading={!!actionLoading?.startsWith("offer-")}
              onAccept={() => handleOffer("accept", offer.orderNumber)}
              onReject={() => handleOffer("reject", offer.orderNumber)}
            />
          )}

          {/* Connected → Active orders */}
          {connected && orders.length > 0 && (
            <div className="space-y-3">
              {orders.map((order) => (
                <OrderCard
                  key={order.orderNumber}
                  order={order}
                  loading={actionLoading === order.orderNumber}
                  onAction={(action) => handleAction(action, order.orderNumber)}
                />
              ))}
            </div>
          )}

          {/* Connected → No orders, no offer */}
          {connected && orders.length === 0 && !offer && (
            <div className="py-6 text-center">
              <ThinkingOrb
                state="searching"
                size={64}
                theme="light"
                speed={0.7}
                aria-label="Conectado, esperando pedidos"
                className="mx-auto mb-3"
              />
              <p className="text-base font-bold text-[#09193B]">
                Estás conectado
              </p>
              <p className="mt-1 text-sm font-medium text-green-600">
                Esperando pedidos...
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Te notificaremos cuando haya un pedido
              </p>
              <button
                onClick={() => handleSession("disconnect")}
                disabled={actionLoading === "session"}
                className="mt-4 rounded-xl border border-gray-200 px-6 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
              >
                Desconectar
              </button>
            </div>
          )}

          {/* Connected → Disconnect button (when has orders) */}
          {connected && (orders.length > 0 || offer) && (
            <button
              onClick={() => handleSession("disconnect")}
              disabled={actionLoading === "session"}
              className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-400 transition hover:bg-gray-50"
            >
              Desconectar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Offer Card ─────────────────────────────────────────────────────

function OfferCard({
  offer,
  loading,
  onAccept,
  onReject,
}: {
  offer: DriverOffer;
  loading: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(
        0,
        Math.round((new Date(offer.offerExpiresAt).getTime() - Date.now()) / 1000)
      );
      setTimeLeft(remaining);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [offer.offerExpiresAt]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const urgent = timeLeft < 120;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-amber-600">
          Nueva oferta
        </span>
        <span
          className={`text-sm font-black tabular-nums ${
            urgent ? "text-red-500" : "text-amber-600"
          }`}
        >
          {minutes}:{seconds.toString().padStart(2, "0")}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-base font-bold text-[#09193B]">
          #{shortOrderCode(offer.orderNumber)}
        </p>
        <p className="mt-1 flex items-center gap-1 text-sm text-gray-600">
          <Store className="h-3.5 w-3.5" />
          {offer.storeName}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {offer.destLabel}
        </p>
        <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
          {offer.routeKm != null && <span>{offer.routeKm} km</span>}
          {offer.etaMinutes != null && <span>{offer.etaMinutes} min</span>}
          <span className="font-bold text-[#09193B]">{offer.paymentLabel}</span>
          {offer.totalPrice > 0 && (
            <span className="font-bold text-[#09193B]">
              ${offer.totalPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={onReject}
          disabled={loading}
          className="flex-1 rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-500 transition hover:bg-gray-50 active:scale-95"
        >
          RECHAZAR
        </button>
        <button
          onClick={onAccept}
          disabled={loading}
          className="flex-1 rounded-xl bg-green-500 py-3 text-sm font-black text-white shadow-lg shadow-green-500/30 transition hover:bg-green-600 active:scale-95"
        >
          {loading ? (
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          ) : (
            "ACEPTAR"
          )}
        </button>
      </div>
    </motion.div>
  );
}

// ── Order Card ─────────────────────────────────────────────────────

function OrderCard({
  order,
  loading,
  onAction,
}: {
  order: DriverOrder;
  loading: boolean;
  onAction: (action: string) => void;
}) {
  const { label, action, icon } = getOrderAction(order);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-[#09193B]">
          #{shortOrderCode(order.orderNumber)}
        </p>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
          {order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {/* Recolección (etapa actual mientras el pedido no se ha recogido) */}
        <div
          className={`rounded-xl border px-3 py-2 ${
            action === "navigate_pickup"
              ? "border-orange-300 bg-orange-50"
              : "border-gray-100 bg-gray-50"
          }`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-wide ${
              action === "navigate_pickup" ? "text-orange-500" : "text-gray-400"
            }`}
          >
            📍 Recolección
            {action === "navigate_pickup" && " · ahora"}
          </p>
          <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-gray-800">
            <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
            <span className="leading-snug">{order.mandadoOriginLabel ?? order.storeName}</span>
          </p>
        </div>

        {/* Entrega (siguiente etapa; solo destacada cuando el pedido va en ruta) */}
        <div
          className={`rounded-xl border px-3 py-2 ${
            action === "navigate_delivery"
              ? "border-red-300 bg-red-50"
              : action === "navigate_pickup"
                ? "border-gray-100 bg-gray-50 opacity-70"
                : "border-gray-100 bg-gray-50"
          }`}
        >
          <p
            className={`text-[10px] font-bold uppercase tracking-wide ${
              action === "navigate_delivery" ? "text-red-500" : "text-gray-400"
            }`}
          >
            📍 Entrega
            {action === "navigate_delivery" && " · ahora"}
          </p>
          <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-gray-800">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
            <span className="leading-snug">{order.mandadoDestinationLabel ?? order.destLabel}</span>
          </p>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
        {order.routeKm != null && <span>{order.routeKm} km</span>}
        {order.etaMinutes != null && <span>{order.etaMinutes} min</span>}
        <span className="font-medium text-[#09193B]">{order.paymentLabel}</span>
        {order.totalPrice > 0 && (
          <span className="font-bold text-[#09193B]">
            ${order.totalPrice.toFixed(2)}
          </span>
        )}
      </div>

      {order.mandadoDetails && (
        <p className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500 line-clamp-2">
          📝 {order.mandadoDetails}
        </p>
      )}

      <button
        onClick={() => onAction(action)}
        disabled={loading}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#09193B] py-3 text-sm font-black text-white shadow-lg transition hover:bg-[#0d2347] active:scale-95 disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            {icon}
            {label}
          </>
        )}
      </button>
    </div>
  );
}
