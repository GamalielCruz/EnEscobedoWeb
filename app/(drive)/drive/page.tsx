"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, SignIn } from "@clerk/nextjs";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { motion } from "framer-motion";
import {
  Loader2,
  MapPin,
  Navigation,
  Package,
  Store,
  Clock,
  CheckCircle,
  XCircle,
  LocateFixed,
  Maximize2,
  Truck,
} from "lucide-react";
import { DriveNavBar, type DriveNavPhase } from "@/components/drive/DriveNavBar";
import { DriveSimPanel } from "@/components/drive/DriveSimPanel";
import { useDriveSimulator } from "@/hooks/useDriveSimulator";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
import { useDriverState, type DriverOrder, type DriverOffer } from "@/hooks/useDriverState";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useOfferAlertSound } from "@/hooks/useOfferAlertSound";
import { ThinkingOrb } from "thinking-orbs";
import { shortOrderCode } from "@/lib/dispatch/dispatch-format";
import {
  bearingBetween,
  getRoadRoute,
  haversineMeters,
  headingAlongPath,
  movePointAlong,
  pathLengthMeters,
  projectOntoPath,
  routeTargets,
  type RoadRoute,
  type RoutePoint,
} from "@/lib/dispatch/routing";
import { instructionInSpanish } from "@/lib/dispatch/nav-instructions";

// ── Map config ─────────────────────────────────────────────────────

const DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };
const containerStyle = { width: "100%", height: "100%" };

// ── Camera (navegación tipo GPS) ───────────────────────────────────
// Zoom máximo al encuadrar el trayecto (evita acercarse al suelo al llegar).
const CAMERA_MAX_ZOOM = 16.5;
// Aire alrededor del trayecto al encuadrar (fracción del tamaño del encuadre).
const CAMERA_PADDING = 0.15;
// Sin ruta activa, recentrar al repartidor solo si se movió al menos esto.
const DRIVER_CENTER_METERS = 20;
// Zoom por defecto del mapa y zoom de navegación al pulsar "Centrar GPS".
const DEFAULT_ZOOM = 15;
const FOLLOW_NAV_ZOOM = 17;
// Navegación tipo GPS: posición del conductor en pantalla (fracción vertical,
// 0 = borde superior) y distancia de cámara adelantada según el viewport.
const NAV_DRIVER_SCREEN_FRACTION = 0.68;
const NAV_AHEAD_MIN_METERS = 80;
const NAV_AHEAD_MAX_METERS = 1600;
// Re-anclar la cámara cuando el conductor avanza al menos esto sobre la ruta.
const NAV_ANCHOR_UPDATE_METERS = 8;
// No girar el mapa por variaciones menores de rumbo (anti-jitter).
const NAV_HEADING_SKIP_DEG = 2.5;
// Suavizado de rotación por frame (interpolación del ángulo más corto).
const NAV_HEADING_SMOOTH = 0.16;
// Rumbo derivado por movimiento: mínimo desplazamiento e intervalo.
const NAV_MOVEMENT_MIN_METERS = 4;
const NAV_MOVEMENT_MIN_MS = 400;
// Ventana para ignorar zoom_changed generado por la propia cámara.
const INTERNAL_ZOOM_GUARD_MS = 900;
// Anticipar la siguiente maniobra cuando falte menos que esto para el giro.
const NEXT_MANEUVER_METERS = 120;
// Mostrar "Estás llegando" cuando quede menos que esto para el destino.
const NEAR_DESTINATION_METERS = 150;
// El simulador de viaje SOLO existe fuera de producción (dev local/preview).
const DRIVE_SIM_ENABLED = getDeploymentEnvironment() !== "production";
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

// Flecha de navegación del conductor como SVG data-URI: la rotación se aplica
// explícitamente en el SVG (positiva = sentido horario, igual que el heading),
// así el marcador siempre apunta hacia donde conduce el repartidor.
function driverArrowIcon(headingDeg: number): string {
  const rotate = normalizeDeg(headingDeg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="-17 -17 34 34">
  <g transform="rotate(${rotate})">
    <path d="M0 -13 L6.5 10 L0 5 L-6.5 10 Z" fill="#3B82F6" stroke="#FFFFFF" stroke-width="2.2" stroke-linejoin="round"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

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

function hasValidCoords(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
}

/**
 * Viewport real del mapa. Se lee con un tipo estructural porque los tipos
 * del proyecto (types/google-maps.d.ts) solo declaran una parte de la API.
 */
function getMapViewport(map: google.maps.Map): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null {
  const bounds = map.getBounds() as
    | {
        getNorthEast(): { lat(): number; lng(): number };
        getSouthWest(): { lat(): number; lng(): number };
      }
    | null
    | undefined;
  if (!bounds) return null;
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return { minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() };
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Diferencia dirigida y mínima entre dos ángulos: 350° → 5° = +15°. */
function shortestAngleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Punto de CÁMARA para que el conductor quede en el tercio inferior de la
 * pantalla con la carretera por delante. Solo es un objetivo visual: nunca
 * mueve al conductor ni la ruta.
 */
function aheadCameraPoint(map: google.maps.Map, driver: RoutePoint, headingDeg: number): RoutePoint {
  const vp = getMapViewport(map);
  let viewHeightMeters = 500;
  if (vp) {
    viewHeightMeters = Math.max(
      200,
      haversineMeters(
        { lat: vp.minLat, lng: vp.minLng },
        { lat: vp.maxLat, lng: vp.minLng }
      )
    );
  }
  const fraction = NAV_DRIVER_SCREEN_FRACTION - 0.5;
  const meters = Math.min(
    NAV_AHEAD_MAX_METERS,
    Math.max(NAV_AHEAD_MIN_METERS, viewHeightMeters * fraction)
  );
  return movePointAlong(driver, headingDeg, meters);
}

/**
 * Encuadra la cámara sobre los puntos de la ruta vial (repartidor + trayecto
 * completo hasta el destino). Nunca se usa la línea recta entre extremos.
 */
function frameRouteView(map: google.maps.Map, points: RoutePoint[]): void {
  if (points.length < 2) return;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  const latPad = (maxLat - minLat) * CAMERA_PADDING;
  const lngPad = (maxLng - minLng) * CAMERA_PADDING;
  map.fitBounds({
    south: minLat - latPad,
    west: minLng - lngPad,
    north: maxLat + latPad,
    east: maxLng + lngPad,
  });
  const zoom = map.getZoom();
  if (typeof zoom === "number" && zoom > CAMERA_MAX_ZOOM) map.setZoom(CAMERA_MAX_ZOOM);
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

/** Etapa de navegación real según la acción del pedido (sin simulador). */
function actionToNavPhase(action: string | null | undefined): DriveNavPhase | null {
  switch (action) {
    case "navigate_pickup":
      return "to_pickup";
    case "navigate_delivery":
      return "to_delivery";
    case "picked_up":
      return "at_pickup";
    case "delivered":
      return "at_delivery";
    default:
      return null;
  }
}

function formatMetersShort(meters: number): string {
  const m = Math.max(0, meters);
  if (m < 1000) {
    const rounded = m < 100 ? Math.round(m) : Math.round(m / 10) * 10;
    return `${rounded} m`;
  }
  return `${(m / 1000).toFixed(1)} km`;
}

function formatSecondsShort(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    return `${h} h ${minutes % 60} min`;
  }
  return `${minutes} min`;
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
  const { location: gpsLocation, heading: gpsHeading, error: gpsError } = useDriverLocation(
    state?.connected ?? false
  );

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

  // ── Ubicación real (GPS) ────────────────────────────────────────
  // Se separa de la ubicación EFECTIVA (que el simulador puede reemplazar)
  // para que el resto de la UI consuma exactamente la misma estructura.
  const realLocation = useMemo(() => {
    if (gpsLocation) return gpsLocation;
    if (state?.location) return state.location;
    return null;
  }, [gpsLocation, state?.location]);

  // Active order for navigation target
  const activeOrder = state?.orders?.[0] ?? null;
  const orderAction = useMemo(
    () => (activeOrder ? getOrderAction(activeOrder) : null),
    [activeOrder]
  );

  // Coordenadas de recolección y entrega (solo si son válidas, nunca (0,0)).
  const pickupPoint = useMemo(() => {
    if (!activeOrder) return null;
    if (hasValidCoords(activeOrder.storeLat, activeOrder.storeLng)) {
      return { lat: activeOrder.storeLat, lng: activeOrder.storeLng };
    }
    return null;
  }, [activeOrder]);
  const deliveryPoint = useMemo(() => {
    if (!activeOrder) return null;
    if (hasValidCoords(activeOrder.destLat, activeOrder.destLng)) {
      return { lat: activeOrder.destLat, lng: activeOrder.destLng };
    }
    return null;
  }, [activeOrder]);

  // Navigation target real, según la etapa del pedido: navigate_pickup →
  // recolección, navigate_delivery → entrega (coordenadas exactas del pedido).
  const realNavTarget = useMemo(() => {
    if (!activeOrder) return null;
    const action = orderAction?.action;
    if (action === "navigate_pickup" && pickupPoint) {
      return { ...pickupPoint, label: activeOrder.storeName };
    }
    if (action === "navigate_delivery" && deliveryPoint) {
      return { ...deliveryPoint, label: activeOrder.destLabel };
    }
    return null;
  }, [activeOrder, orderAction, pickupPoint, deliveryPoint]);

  // Ruta vial dibujada sobre el mapa (Google Directions + caché dentro de
  // lib/dispatch/routing.ts). El caché hace que los ticks de GPS no llamen a
  // la API: solo se recalcula cuando el origen se mueve >200 m o cambia el
  // destino. Si la API falla o aún no hay ruta, roadRoute es null y NO se
  // dibuja ninguna línea (nunca una línea recta entre los dos puntos).
  const [roadRoute, setRoadRoute] = useState<RoadRoute | null>(null);
  const prevNavKeyRef = useRef<string | null>(null);

  // ── Simulador de viaje (SOLO dev/staging) ───────────────────────
  // Todo en estado local: entrega una posición simulada y una etapa override
  // al MISMO pipeline que usa el GPS real (currentLocation / roadRoute /
  // barra / cámara), sin tocar dispatch, Sanity ni el estado del pedido.
  const sim = useDriveSimulator({
    enabled: DRIVE_SIM_ENABLED,
    origin: realLocation,
    pickup: pickupPoint,
    delivery: deliveryPoint,
    route: roadRoute,
  });

  // Si el pedido desaparece (o el repartidor se desconecta) con una
  // simulación en curso, detenerla: no dejar una posición fantasma.
  const simIsActive = sim.active;
  const stopSim = sim.stop;
  useEffect(() => {
    if (simIsActive && !activeOrder) stopSim();
  }, [simIsActive, activeOrder, stopSim]);

  // Ubicación EFECTIVA: simulada cuando la simulación está activa, si no la
  // del GPS real / última reportada. El resto de la UI no sabe de dónde viene.
  const currentLocation = useMemo(() => {
    if (sim.active && sim.simLocation) return sim.simLocation;
    return realLocation ?? DEFAULT_CENTER;
  }, [sim.active, sim.simLocation, realLocation]);

  // Solo pedir ruta cuando hay una ubicación del repartidor (GPS real o
  // simulada); si no hay ninguna, no se dibuja ruta desde el centro del mapa.
  const driverHasLocation = sim.active ? Boolean(sim.simLocation) : realLocation !== null;

  // Destination según la etapa que la simulación está mostrando (permite
  // probar el cambio RECOLECCIÓN → ENTREGA sin tocar el pedido real).
  const simNavTarget = useMemo(() => {
    if (!sim.active) return null;
    const stage = sim.stage;
    if ((stage === "to_pickup" || stage === "at_pickup") && pickupPoint) {
      return { ...pickupPoint, label: activeOrder?.storeName };
    }
    if (
      (stage === "to_delivery" || stage === "at_delivery" || stage === "done") &&
      deliveryPoint
    ) {
      return { ...deliveryPoint, label: activeOrder?.destLabel };
    }
    return null;
  }, [sim.active, sim.stage, pickupPoint, deliveryPoint, activeOrder]);

  const navTarget = sim.active ? simNavTarget : realNavTarget;

  useEffect(() => {
    const navKey = navTarget ? `${navTarget.lat},${navTarget.lng}` : null;
    if (prevNavKeyRef.current !== navKey) {
      // Cambió el tramo (recolección → entrega o viceversa): descartar la
      // ruta anterior para no dibujarla durante el tramo equivocado.
      setRoadRoute(null);
      prevNavKeyRef.current = navKey;
    }
    if (!navTarget || !mapsLoaded || !driverHasLocation) {
      return;
    }
    // Mientras el simulador avanza sobre una ruta que YA corresponde al
    // destino actual, no recalcular en cada frame de la simulación.
    if (sim.active && routeTargets(roadRoute, navTarget)) return;
    let cancelled = false;
    getRoadRoute(currentLocation, navTarget).then((route) => {
      if (!cancelled) setRoadRoute(route);
    });
    return () => {
      cancelled = true;
    };
  }, [currentLocation, navTarget, mapsLoaded, driverHasLocation, sim.active, roadRoute]);

  // Etapa de navegación efectiva (real o simulada).
  const navPhase = useMemo<DriveNavPhase | null>(() => {
    if (sim.active) return sim.stage as DriveNavPhase;
    return actionToNavPhase(orderAction?.action ?? null);
  }, [sim.active, sim.stage, orderAction]);

  // Progreso + siguiente maniobra basados en la geometría REAL de la ruta y
  // en los steps de Directions (no se hace ninguna llamada extra a Google).
  const guidance = useMemo(() => {
    if (!roadRoute?.path || roadRoute.path.length < 2) return null;
    const total = pathLengthMeters(roadRoute.path);
    if (total <= 0) return null;
    const done = Math.min(Math.max(projectOntoPath(roadRoute.path, currentLocation), 0), total);
    const remaining = Math.max(0, total - done);
    const duration = roadRoute.durationSeconds;
    const remainingSeconds =
      duration != null ? Math.max(0, duration * (remaining / total)) : null;

    // Steps de Directions: el step "pendiente" es el que aún no termina.
    let pendingIdx = -1;
    if (roadRoute.steps.length > 0) {
      let acc = 0;
      for (let i = 0; i < roadRoute.steps.length; i++) {
        acc += roadRoute.steps[i].distanceMeters;
        if (acc > done) {
          pendingIdx = i;
          break;
        }
      }
      if (pendingIdx === -1) pendingIdx = roadRoute.steps.length - 1;
    }
    let shownStep: (typeof roadRoute.steps)[number] | null = null;
    if (pendingIdx >= 0) {
      const step = roadRoute.steps[pendingIdx];
      const next = roadRoute.steps[pendingIdx + 1];
      // Metros hasta el giro (fin del step en curso): si queda poco, mostrar
      // la siguiente maniobra en lugar de la instrucción del tramo actual.
      let accEnd = 0;
      for (let i = 0; i <= pendingIdx; i++) accEnd += roadRoute.steps[i].distanceMeters;
      const distToTurn = Math.max(0, accEnd - done);
      shownStep = next && distToTurn <= NEXT_MANEUVER_METERS ? next : step;
    }
    return {
      total,
      remaining,
      remainingSeconds,
      // Siempre en español: capa de normalización sobre el texto de Google.
      instruction: shownStep
        ? instructionInSpanish(shownStep.instruction, shownStep.maneuver)
        : null,
      maneuver: shownStep?.maneuver ?? null,
      fractionCompleted: Math.min(1, Math.max(0, done / total)),
    };
  }, [roadRoute, currentLocation]);

  // ── Cámara (navegación tipo GPS) ────────────────────────────────
  // Modo seguimiento/navegación: la cámara acompaña al conductor con la
  // posición adelantada (tercio inferior) y orientación según rumbo. El mapa
  // se mueve y rota DEBAJO del conductor; currentLocation nunca cambia. Cuando
  // el usuario arrastra o hace zoom (interacción manual) salimos del modo; los
  // cambios internos de zoom usan un guard para no confundirse con el usuario.
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapListenersRef = useRef<Array<{ remove: () => void }>>([]);
  const lastFollowPosRef = useRef<RoutePoint | null>(null);
  const lastCamDriverPosRef = useRef<RoutePoint | null>(null);
  const lastFramedRouteRef = useRef<RoadRoute | null>(null);
  const prevNavigatingRef = useRef(false);
  const prevFramedLegKeyRef = useRef<string | null>(null);
  const currentLocationRef = useRef<RoutePoint>(currentLocation);
  const movementHeadingRef = useRef<number | null>(null);
  const movementPrevRef = useRef<{ pos: RoutePoint; ts: number } | null>(null);
  const visualHeadingRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  const internalZoomRef = useRef(false);
  const internalZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [followDriver, setFollowDriver] = useState(true);
  const [driverHeading, setDriverHeading] = useState(0);

  const navigatingWithRoute = Boolean(
    navTarget && mapsLoaded && driverHasLocation && roadRoute?.path
  );
  const legKey = navTarget ? `${navTarget.lat.toFixed(4)},${navTarget.lng.toFixed(4)}` : null;

  // El rumbo visual para el marcador se deriva de refs en cada render.
  currentLocationRef.current = currentLocation;

  // Resuelve el rumbo objetivo según la fuente disponible:
  // 1) GPS real (coords.heading) · 2) derivado por movimiento · 3) geometría.
  const headingResolverRef = useRef<() => number | null>(() => null);
  headingResolverRef.current = () => {
    const pos = currentLocationRef.current;
    const route = roadRoute;
    // Simulación: rumbo del tramo actual de la geometría real.
    if (sim.active && route?.path && route.path.length >= 2) {
      return headingAlongPath(route.path, projectOntoPath(route.path, pos));
    }
    // GPS real con rumbo válido.
    if (!sim.active && gpsHeading != null) return gpsHeading;
    // Rumbo derivado del movimiento de posiciones consecutivas.
    if (movementHeadingRef.current != null) return movementHeadingRef.current;
    // Último respaldo: dirección de la ruta en el punto del conductor.
    if (route?.path && route.path.length >= 2) {
      return headingAlongPath(route.path, projectOntoPath(route.path, pos));
    }
    return null;
  };

  const stopHeadingAnimation = useCallback(() => {
    if (headingRafRef.current !== null) {
      cancelAnimationFrame(headingRafRef.current);
      headingRafRef.current = null;
    }
  }, []);

  const applyHeading = useCallback((deg: number) => {
    const map = mapRef.current;
    if (!map) return;
    visualHeadingRef.current = normalizeDeg(deg);
    setDriverHeading(normalizeDeg(deg));
    map.setHeading(normalizeDeg(deg));
    // Re-anclar en cada paso de rotación: el conductor se mantiene en la zona
    // inferior mientras el mapa gira debajo de él.
    const pos = currentLocationRef.current;
    if (pos) map.setCenter(aheadCameraPoint(map, pos, normalizeDeg(deg)));
  }, []);

  /** Rotación suave hacia `target` (siempre por el arco más corto). */
  const startHeadingTween = useCallback(
    (target: number) => {
      const map = mapRef.current;
      if (!map) return;
      const current = visualHeadingRef.current;
      const delta = current == null ? 0 : shortestAngleDelta(target, current);
      if (current == null || Math.abs(delta) <= NAV_HEADING_SKIP_DEG) {
        applyHeading(target);
        return;
      }
      stopHeadingAnimation();
      const step = () => {
        const now = visualHeadingRef.current ?? target;
        const diff = shortestAngleDelta(target, now);
        if (Math.abs(diff) < 1) {
          applyHeading(target);
          headingRafRef.current = null;
          return;
        }
        applyHeading(now + diff * NAV_HEADING_SMOOTH);
        headingRafRef.current = requestAnimationFrame(step);
      };
      headingRafRef.current = requestAnimationFrame(step);
    },
    [applyHeading, stopHeadingAnimation]
  );

  const markInternalZoom = useCallback(() => {
    internalZoomRef.current = true;
    if (internalZoomTimerRef.current) clearTimeout(internalZoomTimerRef.current);
    internalZoomTimerRef.current = setTimeout(() => {
      internalZoomRef.current = false;
    }, INTERNAL_ZOOM_GUARD_MS);
  }, []);

  /** Sale del modo navegación/seguimiento (interacción manual del usuario). */
  const exitFollowMode = useCallback(() => {
    setFollowDriver(false);
    stopHeadingAnimation();
    visualHeadingRef.current = null;
    setDriverHeading(0);
    const map = mapRef.current;
    if (map && map.getHeading?.()) map.setHeading(0);
  }, [stopHeadingAnimation]);

  const handleMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      mapListenersRef.current.forEach((listener) => listener.remove());
      mapListenersRef.current = [
        // Pan manual → exploración.
        map.addListener("dragstart", () => exitFollowMode()),
        // Zoom gestual (pinch/rueda) → exploración. Los cambios de zoom de la
        // propia cámara (Centrar GPS / encuadres / Ver viaje) llevan guard.
        map.addListener("zoom_changed", () => {
          if (!internalZoomRef.current) exitFollowMode();
        }),
      ];
    },
    [exitFollowMode]
  );

  const handleMapUnmount = useCallback(() => {
    stopHeadingAnimation();
    mapListenersRef.current.forEach((listener) => listener.remove());
    mapListenersRef.current = [];
    mapRef.current = null;
  }, [stopHeadingAnimation]);

  // Limpieza global al desmontar.
  useEffect(() => {
    return () => {
      stopHeadingAnimation();
      if (internalZoomTimerRef.current) clearTimeout(internalZoomTimerRef.current);
    };
  }, [stopHeadingAnimation]);

  // Rumbo derivado por movimiento del GPS real (no aplica en simulación).
  useEffect(() => {
    if (sim.active) {
      movementPrevRef.current = null;
      movementHeadingRef.current = null;
      return;
    }
    const now = Date.now();
    const prev = movementPrevRef.current;
    movementPrevRef.current = { pos: currentLocation, ts: now };
    if (prev) {
      const elapsed = now - prev.ts;
      const dist = haversineMeters(prev.pos, currentLocation);
      if (elapsed >= NAV_MOVEMENT_MIN_MS && dist >= NAV_MOVEMENT_MIN_METERS) {
        const raw = bearingBetween(prev.pos, currentLocation);
        movementHeadingRef.current =
          movementHeadingRef.current == null
            ? raw
            : normalizeDeg(
                movementHeadingRef.current +
                  shortestAngleDelta(raw, movementHeadingRef.current) * 0.35
              );
      }
    }
  }, [currentLocation, sim.active]);

  // Al salir de una navegación con ruta (pedido entregado / ruta fallida):
  // restaurar norte arriba, zoom por defecto y centrar al repartidor.
  useEffect(() => {
    const map = mapRef.current;
    if (map && prevNavigatingRef.current && !navigatingWithRoute) {
      stopHeadingAnimation();
      visualHeadingRef.current = null;
      setDriverHeading(0);
      map.setHeading(0);
      markInternalZoom();
      map.setZoom(DEFAULT_ZOOM);
      lastFollowPosRef.current = currentLocation;
      map.setCenter(currentLocation);
      setFollowDriver(true);
    }
    prevNavigatingRef.current = navigatingWithRoute;
  }, [navigatingWithRoute, currentLocation, stopHeadingAnimation, markInternalZoom, mapsLoaded]);

  // ── Modo navegación (conductor en el tercio inferior, rumbo, ruta por delante)
  useEffect(() => {
    const map = mapRef.current;
    if (!mapsLoaded || !map || !followDriver || !driverHasLocation) return;
    const withRoute = Boolean(
      navTarget && roadRoute?.path && roadRoute.path.length >= 2
    );

    if (!withRoute) {
      // Sin ruta: seguimiento simple, norte arriba (no girar el mapa).
      if (visualHeadingRef.current != null) {
        visualHeadingRef.current = null;
        setDriverHeading(0);
        map.setHeading(0);
      }
      const last = lastFollowPosRef.current;
      const dist = last ? haversineMeters(last, currentLocation) : Infinity;
      if (dist < DRIVER_CENTER_METERS) return;
      lastFollowPosRef.current = currentLocation;
      map.setCenter(currentLocation);
      return;
    }

    const moved = lastCamDriverPosRef.current
      ? haversineMeters(lastCamDriverPosRef.current, currentLocation)
      : Infinity;
    const target = headingResolverRef.current();

    // Rotar solo si hay una fuente real de rumbo (movimiento/GPS) o simulación;
    // así el mapa no gira mientras el conductor está detenido sin rumbo.
    const hasMotion =
      sim.active || gpsHeading != null || movementHeadingRef.current != null;
    if (target != null && hasMotion) {
      const current = visualHeadingRef.current;
      if (current == null || Math.abs(shortestAngleDelta(target, current)) > NAV_HEADING_SKIP_DEG) {
        startHeadingTween(target);
      }
    }

    if (moved < NAV_ANCHOR_UPDATE_METERS && lastCamDriverPosRef.current) return;
    lastCamDriverPosRef.current = currentLocation;
    const heading = visualHeadingRef.current ?? 0;
    map.setCenter(aheadCameraPoint(map, currentLocation, heading));
    // Zoom de navegación al entrar (sin pisar un zoom manual posterior).
    const zoom = map.getZoom();
    if (typeof zoom === "number" && (zoom < 15 || zoom > 18.5)) {
      markInternalZoom();
      map.setZoom(FOLLOW_NAV_ZOOM);
    }
  }, [
    mapsLoaded,
    followDriver,
    driverHasLocation,
    currentLocation,
    roadRoute,
    navTarget,
    gpsHeading,
    sim.active,
    startHeadingTween,
    markInternalZoom,
  ]);

  // Encuadre general de un tramo NUEVO (primera ruta o cambio recolección →
  // entrega), una sola vez y solo en modo seguimiento. Después, mientras
  // conduce, la cámara navegación se ancla sola (arriba) sin volver a
  // encuadrar toda la ruta.
  useEffect(() => {
    const map = mapRef.current;
    const routeReady = Boolean(
      navTarget && driverHasLocation && roadRoute?.path && roadRoute.path.length >= 2
    );
    if (!mapsLoaded || !map || !routeReady || !followDriver) return;
    const legChanged = prevFramedLegKeyRef.current !== legKey;
    const neverFramed = lastFramedRouteRef.current === null;
    if (!legChanged && !neverFramed) {
      lastFramedRouteRef.current = roadRoute;
      return;
    }
    // Vista general del nuevo tramo, norte arriba.
    stopHeadingAnimation();
    visualHeadingRef.current = null;
    setDriverHeading(0);
    map.setHeading(0);
    markInternalZoom();
    frameRouteView(map, [currentLocation, ...roadRoute!.path]);
    prevFramedLegKeyRef.current = legKey;
    lastFramedRouteRef.current = roadRoute;
  }, [
    mapsLoaded,
    followDriver,
    roadRoute,
    legKey,
    navTarget,
    driverHasLocation,
    currentLocation,
    stopHeadingAnimation,
    markInternalZoom,
  ]);

  // ── Controles de cámara ─────────────────────────────────────────

  // "Centrar GPS" = volver al MODO NAVEGACIÓN: posición adelantada (tercio
  // inferior), orientación por rumbo, zoom de conducción y seguimiento activo.
  // NUNCA encuadra todo el viaje ni recalcula routing.
  const handleCenterGps = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    markInternalZoom();
    map.setZoom(FOLLOW_NAV_ZOOM);
    const withRoute = Boolean(
      navTarget && roadRoute?.path && roadRoute.path.length >= 2
    );
    const target = headingResolverRef.current ? headingResolverRef.current() : null;
    if (withRoute && target != null) {
      startHeadingTween(target);
    } else {
      stopHeadingAnimation();
      visualHeadingRef.current = null;
      setDriverHeading(0);
      map.setHeading(0);
    }
    lastFollowPosRef.current = currentLocation;
    lastCamDriverPosRef.current = currentLocation;
    const heading = visualHeadingRef.current ?? 0;
    map.setCenter(
      withRoute ? aheadCameraPoint(map, currentLocation, heading) : currentLocation
    );
    setFollowDriver(true);
  }, [
    currentLocation,
    roadRoute,
    navTarget,
    startHeadingTween,
    stopHeadingAnimation,
    markInternalZoom,
  ]);

  // "Ver viaje completo" = vista convencional (norte arriba, sin seguimiento):
  // fitBounds sobre la geometría vial real; no vuelve al conductor solo.
  const handleFullTripView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const points: RoutePoint[] = [currentLocation];
    if (roadRoute?.path?.length) {
      // Encuadrar SOLO la geometría vial real (nunca una línea recta).
      points.push(...roadRoute.path);
    } else if (activeOrder) {
      // Sin ruta todavía: encuadrar con los puntos disponibles del pedido.
      if (pickupPoint) points.push(pickupPoint);
      if (deliveryPoint) points.push(deliveryPoint);
    }
    if (points.length < 2) {
      // Solo hay un punto: comportarse como centrar GPS.
      handleCenterGps();
      return;
    }
    stopHeadingAnimation();
    visualHeadingRef.current = null;
    setDriverHeading(0);
    map.setHeading(0);
    markInternalZoom();
    frameRouteView(map, points);
    // Dejar de forzar la cámara para que pueda ver el recorrido completo.
    setFollowDriver(false);
  }, [
    currentLocation,
    roadRoute,
    activeOrder,
    pickupPoint,
    deliveryPoint,
    handleCenterGps,
    stopHeadingAnimation,
    markInternalZoom,
  ]);

  // ── Contenido de la barra de navegación (etapa actual) ──────────

  const navContent = useMemo(() => {
    if (!navPhase || !activeOrder) return null;

    const orderCode = shortOrderCode(activeOrder.orderNumber);
    const pickupLabel = activeOrder.mandadoOriginLabel ?? activeOrder.storeName;
    const deliveryLabel = activeOrder.mandadoDestinationLabel ?? activeOrder.destLabel;
    const hasLegMetrics = navPhase === "to_pickup" || navPhase === "to_delivery";
    const arriving =
      hasLegMetrics &&
      guidance !== null &&
      guidance.remaining <= NEAR_DESTINATION_METERS;
    // Distancia/tiempo RESTANTES calculados desde currentLocation sobre la
    // geometría real (la tarjeta conserva sus valores originales del servicio).
    const distanceLabel =
      hasLegMetrics && guidance
        ? `${formatMetersShort(guidance.remaining)} restantes`
        : null;
    const durationLabel =
      hasLegMetrics && guidance?.remainingSeconds != null
        ? formatSecondsShort(guidance.remainingSeconds)
        : null;
    const progress =
      hasLegMetrics && guidance ? guidance.fractionCompleted : null;
    const address =
      navPhase === "to_delivery" || navPhase === "at_delivery" || navPhase === "done"
        ? deliveryLabel
        : pickupLabel;
    const arrivalManeuver: string | null = arriving ? "arrive" : null;
    const maneuver = arrivalManeuver ?? guidance?.maneuver ?? null;

    switch (navPhase) {
      case "to_pickup":
        return {
          title: "RECOLECCIÓN",
          icon: <Package className="h-5 w-5" />,
          accent: "orange" as const,
          orderCode,
          main: arriving
            ? "Estás llegando"
            : guidance?.instruction ?? "Dirígete a la recolección",
          sub: arriving ? `Destino de recolección · ${address}` : address,
          distance: distanceLabel,
          duration: durationLabel,
          progress,
          maneuver,
          waiting: !guidance && sim.active,
        };
      case "at_pickup":
        return {
          title: "RECOLECCIÓN",
          icon: <Package className="h-5 w-5" />,
          accent: "orange" as const,
          orderCode,
          main: "Has llegado a la recolección",
          sub: address,
          distance: null,
          duration: null,
          progress: null,
          maneuver: null,
          waiting: false,
        };
      case "to_delivery":
        return {
          title: "ENTREGA",
          icon: <Truck className="h-5 w-5" />,
          accent: "red" as const,
          orderCode,
          main: arriving
            ? "Estás llegando"
            : guidance?.instruction ?? "Dirígete a la entrega",
          sub: arriving ? `Destino de entrega · ${address}` : address,
          distance: distanceLabel,
          duration: durationLabel,
          progress,
          maneuver,
          waiting: !guidance && sim.active,
        };
      case "at_delivery":
        return {
          title: "ENTREGA",
          icon: <MapPin className="h-5 w-5" />,
          accent: "green" as const,
          orderCode,
          main: "Has llegado a la entrega",
          sub: address,
          distance: null,
          duration: null,
          progress: null,
          maneuver: null,
          waiting: false,
        };
      case "done":
        return {
          title: "VIAJE COMPLETADO",
          icon: <CheckCircle className="h-5 w-5" />,
          accent: "green" as const,
          orderCode,
          main: "✓ Viaje completado",
          sub: address,
          distance: null,
          duration: null,
          progress: null,
          maneuver: null,
          waiting: false,
        };
      default:
        return null;
    }
  }, [navPhase, activeOrder, guidance, sim.active]);

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
      <div className="relative flex-1">
        {mapsLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            options={mapOptions}
            onLoad={handleMapLoad}
            onUnmount={handleMapUnmount}
          >
            {/* Driver marker: flecha de navegación que se rota según rumbo. */}
            <Marker
              position={currentLocation}
              icon={{
                url: driverArrowIcon(driverHeading),
                scaledSize: new google.maps.Size(34, 34),
                anchor: new google.maps.Point(17, 17),
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

            {/* Route line: SOLO la geometría vial real de Google Directions.
                Nunca se dibuja una línea recta entre los dos puntos: si no
                hay ruta (API caída o todavía cargando), no se dibuja nada y
                el mapa sigue funcionando con los marcadores. */}
            {roadRoute?.path && (
              <Polyline
                path={roadRoute.path}
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

        {/* Floating controls — navegación (no interfieren con marcadores ni
            con los controles nativos: están sobre el mapa, lado derecho). */}
        {mapsLoaded && (
          <>
            <div className="absolute right-3 bottom-4 z-20 flex flex-col gap-2">
              <button
                onClick={handleCenterGps}
                aria-label="Centrar GPS"
                title="Centrar GPS"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#09193B] shadow-lg ring-1 ring-black/5 transition hover:bg-gray-50 active:scale-95"
              >
                <LocateFixed className="h-5 w-5" />
              </button>
              <button
                onClick={handleFullTripView}
                aria-label="Ver viaje completo"
                title="Ver viaje completo"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#09193B] shadow-lg ring-1 ring-black/5 transition hover:bg-gray-50 active:scale-95"
              >
                <Maximize2 className="h-5 w-5" />
              </button>
            </div>

            {/* Herramienta de desarrollo: simular viaje (solo dev/staging). */}
            <DriveSimPanel
              visible={DRIVE_SIM_ENABLED && connected && Boolean(activeOrder) && mapsLoaded}
              canStart={sim.canStart}
              active={sim.active}
              running={sim.running}
              finished={sim.finished}
              stageLabel={sim.stageLabel}
              speed={sim.speed}
              waitingForRoute={sim.waitingForRoute}
              onStart={sim.start}
              onPause={sim.pause}
              onResume={sim.resume}
              onRestart={sim.restart}
              onStop={sim.stop}
              onSpeed={sim.setSpeed}
            />
          </>
        )}
      </div>

      {/* Barra de indicaciones — etapa actual del pedido (recolección/entrega) */}
      {navContent && navPhase && (
        <DriveNavBar
          title={navContent.title}
          icon={navContent.icon}
          accent={navContent.accent}
          orderCode={navContent.orderCode}
          mainText={navContent.main}
          subText={navContent.sub}
          distanceLabel={navContent.distance}
          durationLabel={navContent.duration}
          progress={navContent.progress}
          maneuver={navContent.maneuver}
          waitingForRoute={navContent.waiting}
          simulated={sim.active}
        />
      )}

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
