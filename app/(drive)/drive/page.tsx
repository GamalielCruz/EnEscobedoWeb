"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, SignIn } from "@clerk/nextjs";
import { GoogleMap, Marker, Polyline, useJsApiLoader } from "@react-google-maps/api";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  MapPin,
  Package,
  Store,
  CheckCircle,
  X,
  XCircle,
  LocateFixed,
  Home as HomeIcon,
} from "lucide-react";
import { DriveNavBar, type DriveNavPhase } from "@/components/drive/DriveNavBar";
import { DriveTripSheet } from "@/components/drive/DriveTripSheet";
import {
  DriveRouteSheet,
  MOVING_SPEED_MPS,
  type RouteStop,
} from "@/components/drive/DriveRouteSheet";
import { DriveCancelOrderSheet } from "@/components/drive/DriveCancelOrderSheet";
import { DriveHome } from "@/components/drive/DriveHome";
import { DriveOrderDetails } from "@/components/drive/DriveOrderDetails";
import { DriveSimPanel } from "@/components/drive/DriveSimPanel";
import { RatingSection } from "@/components/ratings/RatingSection";
import {
  getDestinationPinVariants,
  resetDestinationPins,
} from "@/components/drive/DriveDestinationPins";
import {
  useDriveSimulator,
  SIM_BASE_METERS_PER_SECOND,
} from "@/hooks/useDriveSimulator";
import type { DriveSimStage } from "@/hooks/useDriveSimulator";
import { getDeploymentEnvironment } from "@/lib/deployment-environment";
import { useDriverState, type DriverOrder, type DriverOffer } from "@/hooks/useDriverState";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import { useOfferAlertSound } from "@/hooks/useOfferAlertSound";
import { shortOrderCode, shortAddress } from "@/lib/dispatch/dispatch-format";
import {
  bearingBetween,
  distanceToPathMeters,
  getLastRoutingError,
  getRoadRoute,
  headingAlongPath,
  haversineMeters,
  movePointAlong,
  pathLengthMeters,
  projectOntoPath,
  routeTargets,
  type RoadRoute,
  type RoutePoint,
} from "@/lib/dispatch/routing";
import { instructionInSpanish, shortInstructionInSpanish, streetFromInstruction } from "@/lib/dispatch/nav-instructions";
import {
  DRIVE_MOTION_DURATION,
  DRIVE_MOTION_EASE,
} from "@/components/drive/motion";
import {
  DRIVE_MAP_STYLES,
  OFFER_PREVIEW_COLOR,
  ROUTE_BLUE,
} from "@/lib/drive/map-styles";

// ── Map config ─────────────────────────────────────────────────────

// Map ID del mapa vectorial de marca (Cloud Console → Map Management). Sin
// él el mapa es raster: sin rotación heading-up ni tilt. El estilo visual
// vive en el PROPIO Map ID (JSON de marca importado); el fallback inline de
// DRIVE_MAP_STYLES es solo transitorio hasta crear el Map ID.
const DRIVE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "";

const DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };
const containerStyle = { width: "100%", height: "100%" };

// ── Camera (navegación tipo GPS) ───────────────────────────────────
// Aire alrededor del trayecto al encuadrar (fracción del tamaño del encuadre).
const CAMERA_PADDING = 0.15;
// Sin ruta activa, recentrar al repartidor solo si se movió al menos esto.
const DRIVER_CENTER_METERS = 20;
// Zoom por defecto del mapa (sin navegación).
const DEFAULT_ZOOM = 15;
// Ancalaje visual del conductor en pantalla (fracción desde arriba).
const NAV_DRIVER_SCREEN_FRACTION = 0.72;
// ── Zoom de navegación turn-by-turn ──
// Referencia Waze/Google Maps (18.5–19). Ligeramente MÁS CERCANO que antes:
// el repartidor distingue calles, incorporaciones y la próxima maniobra sin
// perder el contexto de la ruta. El nivel se mantiene dentro de un rango
// estrecho según velocidad y cercanía al giro.
const NAV_ZOOM_BASE = 18.6;
const NAV_ZOOM_MAX = 19;
const NAV_ZOOM_MIN = 17.9;
const NAV_ZOOM_SLOW = NAV_ZOOM_BASE;
const NAV_ZOOM_FAST = NAV_ZOOM_BASE - 0.4;
// No girar el mapa por variaciones menores de rumbo (anti-jitter).
const NAV_HEADING_SKIP_DEG = 2.5;
// Suavizado de rotación por frame (interpolación del ángulo más corto).
const NAV_HEADING_SMOOTH = 0.16;
// Velocidad angular máxima del giro de cámara en modo navegación para evitar
// saltos instantáneos y mantener la rotación suave pero reactiva.
const MAX_HEADING_ROTATION_DEG_PER_SEC = 150;
// Rumbo derivado por movimiento: mínimo desplazamiento e intervalo.
const NAV_MOVEMENT_MIN_METERS = 4;
const NAV_MOVEMENT_MIN_MS = 400;
// Interpolación de posición del vehículo entre ticks de GPS: fracción de la
// distancia restante por frame y paso mínimo (elimina la teletransportación).
const POSITION_SMOOTH_FACTOR = 0.18;
const POSITION_MIN_STEP_METERS = 1.5;
// ── Zoom adaptativo en maniobras (suave, animado) ──
// Velocidad que alcanza el zoom lejano (≈65 km/h).
const NAV_SPEED_REF_MPS = 18;
// Ventana de alejamiento ANTES del giro: la cámara empieza a abrirse de
// forma GRADUAL al entrar en esta distancia a la maniobra.
const TURN_AWARENESS_METERS = 220;
// Ventana de recuperación DESPUÉS del giro: la cámara se cierra de nuevo
// gradualmente durante este tramo posterior a la maniobra.
const TURN_RECOVERY_METERS = 70;
// Apertura de zoom máxima al llegar a la maniobra (respecto al zoom de
// velocidad del momento): muestra el punto exacto del giro + el tramo
// previo + el tramo posterior.
const TURN_ZOOM_OUT = 0.9;
// Umbrales del ángulo entre el step actual y el siguiente para considerar
// el giro "relevante": giros leves no abren la cámara.
const TURN_ANGLE_SIGNIFICANT_DEG = 40;
const TURN_ANGLE_STRONG_DEG = 80;
// Apertura extra para giros fuertes / retornos / glorietas.
const TURN_ZOOM_OUT_STRONG = 1.25;
// Maniobras consecutivas: si la siguiente está a menos de esto, mantener
// una vista útil del CONJUNTO en lugar de alternar cercano/lejano.
const CONSECUTIVE_MANEUVER_METERS = 150;
// Suavizado del zoom por frame en el loop de cámara (fracción del delta
// restante): transición animada y gradual, sin saltos ni parpadeos.
const NAV_ZOOM_SMOOTH = 0.06;
// Umbral bajo el cual la diferencia de zoom ya no se persigue.
const NAV_ZOOM_EPSILON = 0.01;
// Solo recomputar el zoom objetivo cuando el cambio es relevante
// (histéresis, evita objetivo oscilando frame a frame).
const NAV_ZOOM_HYSTERESIS = 0.18;

// Desvío: distancia lateral a la geometría y ticks consecutivos antes de
// recalcular la ruta (anti-jitter del GPS).
const OFF_ROUTE_METERS = 60;
const OFF_ROUTE_CHECKS = 4;
// Ventana para ignorar zoom_changed generado por la propia cámara.
const INTERNAL_ZOOM_GUARD_MS = 900;
// Anticipar la siguiente maniobra cuando falte menos que esto para el giro.
const NEXT_MANEUVER_METERS = 120;
// Mostrar "Estás llegando" cuando quede menos que esto para el destino.
const NEAR_DESTINATION_METERS = 150;
// Enfriamiento entre reintentos de ruta durante la SIMULACIÓN (si la primera
// petición a Directions falla). Evita repetir la llamada en cada frame sin
// dejar la simulación pegada para siempre.
const SIM_ROUTE_RETRY_MS = 5_000;

// ── OFFER_ROUTE_PREVIEW ─────────────────────────────────────────────
// Preview TEMPORAL del recorrido completo del servicio (pickup → destino)
// mientras una oferta está en pantalla. Es un estado AISLADO de la
// navegación real: nunca toca navPhase, navTarget, roadRoute ni el estado
// del pedido, y se destruye al aceptar / rechazar / expirar la oferta.

// Margen (px) para que la ruta A → B no quede pegada a los bordes al
// encuadrar el preview. El margen inferior es mayor: la tarjeta de oferta
// tapa la parte baja de la pantalla.
const OFFER_PREVIEW_CAMERA_MARGIN = { top: 72, right: 64, bottom: 320, left: 64 };
// Zoom máximo al encuadrar el preview (mismo criterio que frameRouteView).
const OFFER_PREVIEW_CAMERA_MAX_ZOOM = 16;
// Restaurar la cámara solo si la oferta vivió al menos este tiempo: evita
// animaciones de cámara sin sentido en ofertas de vida ultracorta.
const OFFER_PREVIEW_RESTORATION_MIN_MS = 150;
// Gracia entre ofertas consecutivas (sección 8): si la siguiente oferta llega
// dentro de esta ventana NO se restaura la cámara en el intermedio; el
// preview se actualiza reutilizando el contexto capturado original.
const OFFER_PREVIEW_CAMERA_GRACE_MS = 1_000;

/** Contexto de cámara capturado al llegar la oferta (sección 6). */
type OfferPreviewCameraState = {
  center: RoutePoint;
  zoom: number;
  heading: number | null;
  tilt: number | null;
  /** true ⇔ la cámara estaba en modo seguimiento al llegar la oferta. */
  followDriver: boolean;
};

/**
 * Estado del preview de oferta. OFFER PREVIEW ≠ ACTIVE NAVIGATION: esta
 * estructura nunca alimenta la navegación del pedido (sección 10).
 */
type OfferPreviewState = {
  offerKey: string;
  orderNumber: string;
  pickup: RoutePoint | null;
  destination: RoutePoint | null;
  /** Etiquetas para los marcadores temporales del preview. */
  pickupLabel: string;
  destinationLabel: string;
  route: RoadRoute | null;
  /** true ⇔ la solicitud de ruta ya se disparó (no repetirla por tick). */
  routeRequested: boolean;
  previousCamera: OfferPreviewCameraState | null;
  startedAt: number;
};

// Radio de llegada AUTOMÁTICA: dentro de esta geocerca el backend marca la
// llegada (pickup_arrival / destination_arrival) sin acción del repartidor.
const ARRIVAL_RADIUS_METERS = 50;
// El simulador de viaje SOLO existe fuera de producción (dev local/preview).
const DRIVE_SIM_ENABLED = getDeploymentEnvironment() !== "production";
const mapOptions = {
  disableDefaultUI: true,
  // Los atajos de teclado NO los apaga disableDefaultUI: se desactivan aparte.
  keyboardShortcuts: false,
  zoomControl: false,
  fullscreenControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  gestureHandling: "greedy",
  clickableIcons: false,
  // Map ID VECTORIAL (Cloud Console): habilita rotación heading-up + tilt
  // vía map.moveCamera y el estilo de marca configurado en el mismo Map ID.
  ...(DRIVE_MAP_ID ? { mapId: DRIVE_MAP_ID } : {}),
  // Fallback TRANSITORIO (solo si aún no existe el Map ID): estilo inline con
  // el mismo JSON de marca. Estado final = Map ID + estilo de marca + rotación
  // siempre juntos; este branch desaparece cuando DRIVE_MAP_ID esté en env.
  ...(DRIVE_MAP_ID ? {} : { styles: DRIVE_MAP_STYLES }),
};

// ── Pin SVG ────────────────────────────────────────────────────────

// Flecha de navegación del conductor como SVG data-URI: la rotación se aplica
// explícitamente en el SVG (positiva = sentido horario, igual que el heading),
// así el marcador siempre apunta hacia donde conduce el repartidor.
function driverArrowIcon(headingDeg: number): string {
  const rotate = normalizeDeg(headingDeg);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="-22 -22 44 44">
  <defs>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.2" stdDeviation="1.4" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g filter="url(#shadow)" transform="rotate(${rotate})">
    <circle cx="0" cy="0" r="15" fill="#FFFFFF" stroke="#D7DEE8" stroke-width="1.5"/>
    <path d="M0 -8.5 L6 8.5 L0 4.5 L-6 8.5 Z" fill="${ROUTE_BLUE}" stroke="#FFFFFF" stroke-width="1" stroke-linejoin="round"/>
  </g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ── Rotación IMPERATIVA del marcador (por buckets de ángulo) ────────
//
// En heading-up, el mapa ya está rotado por mapHeading y los marcadores NO
// rotan con el mapa (el icono mide su rotación desde "arriba de la pantalla").
// La flecha debe quedar apuntando hacia arriba en pantalla cuando el mapa
// está bien orientado (mapHeading == driverHeading): la rotación del icono
// es la diferencia relativa driverHeading - mapHeading.
//
// La rotación se aplica con marker.setIcon() DENTRO del loop rAF (mismo hilo
// que setPosition) y NUNCA vía estado de React: un setState por frame
// re-renderizaba la página a 60 fps (SVG/data-URI nuevo + google.maps.Size
// y Point nuevos en cada commit), la causa principal del jank de navegación.
//
// Para no reconstruir nada en el hot path se pre-generan ICON_BUCKET_DEG
// variantes del icono (buckets de 10°) y se reutilizan: cero data-URIs y
// cero objetos Size/Point por frame. El último bucket aplicado se recuerda
// para no tocar el marcador si el ángulo no cambió de bucket.

const ICON_SIZE_PX = 44;
const ICON_ANCHOR_PX = ICON_SIZE_PX / 2;
const ICON_BUCKET_DEG = 10;
const ICON_BUCKET_COUNT = 360 / ICON_BUCKET_DEG;

// Cache a nivel módulo: se construye UNA vez con google.maps ya cargado.
let driverIconBuckets: google.maps.Icon[] | null = null;
let driverIconScaledSize: google.maps.Size | null = null;
let driverIconAnchor: google.maps.Point | null = null;
let lastDriverIconBucket: number | null = null;

function getDriverIconBuckets(): google.maps.Icon[] | null {
  if (driverIconBuckets) return driverIconBuckets;
  // google.maps solo existe tras cargar el script de Maps (SSR-safe).
  if (typeof google === "undefined" || !google.maps) return null;
  // Un único objeto Size/Point reutilizado por TODOS los buckets.
  driverIconScaledSize = new google.maps.Size(ICON_SIZE_PX, ICON_SIZE_PX);
  driverIconAnchor = new google.maps.Point(ICON_ANCHOR_PX, ICON_ANCHOR_PX);
  driverIconBuckets = Array.from({ length: ICON_BUCKET_COUNT }, (_, i) => ({
    url: driverArrowIcon(i * ICON_BUCKET_DEG),
    scaledSize: driverIconScaledSize!,
    anchor: driverIconAnchor!,
  }));
  return driverIconBuckets;
}

/**
 * Aplica la rotación del marcador del conductor de forma IMPERATIVA.
 * Igual que el render anterior (driverArrowIconRelativeToMap): la rotación
 * del icono es relativa al mapa; sin heading de mapa (exploración), absoluta.
 * No-op si el ángulo sigue en el mismo bucket de 10° (no toca el marcador).
 */
function applyDriverMarkerIcon(
  marker: google.maps.Marker | null,
  driverHeadingDeg: number,
  mapHeadingDeg: number | null
): void {
  if (!marker) return;
  const buckets = getDriverIconBuckets();
  if (!buckets) return;
  const relative =
    mapHeadingDeg == null
      ? normalizeDeg(driverHeadingDeg)
      : shortestAngleDelta(driverHeadingDeg, mapHeadingDeg);
  const bucket =
    Math.round(normalizeDeg(relative) / ICON_BUCKET_DEG) % ICON_BUCKET_COUNT;
  if (bucket === lastDriverIconBucket) return;
  lastDriverIconBucket = bucket;
  marker.setIcon(buckets[bucket]);
}

/** Marca el bucket como desconocido (remount del marcador / reset). */
function resetDriverMarkerIconBucket(): void {
  lastDriverIconBucket = null;
}

// Pines de destino (store/entrega) movidos a DriveDestinationPins (Fase 4):
// variantes standard/arriving pre-generadas con swap por evento de etapa.

// ── Action helpers ─────────────────────────────────────────────────

function getMandadoAction(order: DriverOrder): { label: string; action: string; icon: React.ReactNode } {
  switch (order.mandadoState) {
    case "assigned":
      return { label: "RECOLECCIÓN", action: "navigate_pickup", icon: <MapPin className="h-4 w-4" /> };
    case "pickup_arrival":
      // En el punto: la UI muestra el deslizador de confirmación de recolección.
      return { label: "CONFIRMAR RECOLECCIÓN", action: "picked_up", icon: <Package className="h-4 w-4" /> };
    case "en_route":
      return { label: "ENTREGA", action: "navigate_delivery", icon: <MapPin className="h-4 w-4" /> };
    case "destination_arrival":
      return { label: "CONFIRMAR ENTREGA", action: "delivered", icon: <CheckCircle className="h-4 w-4" /> };
    default:
      return { label: "VER PEDIDO", action: "view", icon: <Package className="h-4 w-4" /> };
  }
}

function getRestaurantAction(order: DriverOrder): { label: string; action: string; icon: React.ReactNode } {
  switch (order.dispatchStatus) {
    case "accepted":
      return { label: "RECOLECCIÓN", action: "navigate_pickup", icon: <MapPin className="h-4 w-4" /> };
    case "at_door":
      return { label: "CONFIRMAR ENTREGA", action: "delivered", icon: <CheckCircle className="h-4 w-4" /> };
    default:
      return { label: "VER PEDIDO", action: "view", icon: <Package className="h-4 w-4" /> };
  }
}

/**
 * Plan de acciones REALES que ejecuta el SIMULADOR al llegar a un punto,
 * derivado del estado REAL del pedido (no de la etapa simulada).
 *
 * Motivo: la simulación siempre arranca en "camino a recolección", pero el
 * pedido puede estar más adelante (p. ej. un mandado ya recogido, en
 * "en_route"). Si el plan repitiera "pickup_arrival" el servidor lo
 * rechazaría con "Acción no válida en estado "en_route". Aquí solo se piden
 * las transiciones que faltan, igual que haría el repartidor real.
 */
function simActionPlanFor(order: DriverOrder, stage: "at_pickup" | "at_delivery"): string[] {
  const isMandado = order.serviceKind === "mandado";
  const mandadoState = order.mandadoState;

  if (stage === "at_pickup") {
    // Restaurante: la recolección es navegación pura, sin acción de servidor.
    if (!isMandado) return [];
    if (mandadoState === "assigned") return ["pickup_arrival", "picked_up"];
    if (mandadoState === "pickup_arrival") return ["picked_up"];
    return []; // Ya recogido (en_route o posterior): nada que hacer.
  }

  if (isMandado) {
    if (mandadoState === "en_route") return ["destination_arrival", "delivered"];
    if (mandadoState === "destination_arrival") return ["delivered"];
    return [];
  }
  if (order.dispatchStatus === "at_door") return ["delivered"];
  return ["destination_arrival", "delivered"];
}

/**
 * Verifica que las coordenadas sean válidas (no NaN, no 0,0).
 */
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

// ── Resolvedor de TARGET HEADING (estabilización tipo GPS real) ──────
// La cámara y su suavizado visual NO cambian: esto solo decide QUÉ rumbo
// objetivo se le entrega. Estrategia:
//
//  - En movimiento (>= 2 m/s): el GPS domina (coords.heading, o el bearing
//    entre ticks de GPS si el course no es válido). La brújula queda como
//    fallback (detenido, muy lento o GPS sin rumbo).
//  - Siguiendo la ruta: el bearing del segmento de ruta estabiliza el rumbo
//    cuando GPS y ruta concuerdan (<= ROUTE_ALIGN_TOLERANCE_DEG), evitando
//    oscilaciones de pocos grados entre fuentes.
//  - Desvío real: GPS vs ruta con diferencia grande (> HEADING_DEVIATION_START_DEG)
//    y SOSTENIDA durante ~1.2 s antes de aceptarse; se vuelve a "en ruta"
//    solo cuando la diferencia baja claramente (< ROUTE_ALIGN_TOLERANCE_DEG)
//    (histéresis). Samples de GPS heading aislados que ni el bearing entre
//    ticks ni la ruta corroboran se ignoran.

const ROUTE_ALIGN_TOLERANCE_DEG = 15;
const HEADING_DEVIATION_START_DEG = 25;
const HEADING_DEVIATION_CONFIRM_MS = 1200;
const HEADING_DEVIATION_MIN_SAMPLES = 3;
// Por debajo de esta velocidad la brújula puede dominar; por arriba de GPS_SPEED_DOMINANT_MPS
// el GPS domina; entre ambas hay transición gradual.
const GPS_SPEED_DOMINANT_MPS = 2;
const COMPASS_SPEED_MAX_MPS = 1;
// Velocidad (m/s) a partir de la cual un heading GPS es confiable por sí solo.
const GPS_HEADING_MIN_SPEED_MPS = 1.5;

export type DriveHeadingSource =
  | "SIMULATOR"
  | "GPS"
  | "FOLLOWING_ROUTE"
  | "DEVIATING"
  | "COMPASS_FALLBACK";

export type DriveHeadingDebugInfo = {
  source: DriveHeadingSource;
  speedMps: number;
  gpsHeading: number | null;
  movementHeading: number | null;
  routeHeading: number | null;
  nextSegmentBearing: number | null;
  compassHeading: number | null;
  gpsVsRouteDeltaDeg: number | null;
  deviatingForMs: number;
};

/**
 * Crea el resolvedor de heading objetivo con su estado interno (máquina de
 * estados + refs). El estado vive en refs para que el loop rAF pueda llamar
 * `resolve()` cada frame SIN recrear el callback ni depender de re-renders.
 */
function createDriveHeadingResolver(options: {
  getSimHeading: () => { active: boolean; simHeading: number | null };
  getGpsHeading: () => number | null;
  getSpeedMps: () => number;
  getMovementHeading: () => number | null;
  getDeviceHeading: () => { heading: number; available: string; permission: string };
  getRouteGeometry: () => {
    path: RoutePoint[] | null;
    /** Posición actual del vehículo (visual) para proyectar sobre la ruta. */
    vehiclePos: RoutePoint | null;
  };
}) {
  type ResolverState = {
    deviating: boolean;
    deviationStartedAt: number | null;
    deviationStreak: number;
    gpsHeadingSpikeStreak: number;
    lastGpsTickPos: RoutePoint | null;
    lastGpsTickTs: number | null;
    gpsTickBearing: number | null;
    lastGpsHeadingTs: number | null;
    /** "Racha" de muestras GPS heading consecutivas compatibles con el rumbo aceptado. */
    gpsHeadingConfirmStreak: number;
    /** Último heading objetivo aceptado (para confirmar muestras nuevas). */
    acceptedHeading: number | null;
    debug: DriveHeadingDebugInfo | null;
  };
  const state: ResolverState = {
    deviating: false,
    deviationStartedAt: null,
    deviationStreak: 0,
    gpsHeadingSpikeStreak: 0,
    lastGpsTickPos: null,
    lastGpsTickTs: null,
    gpsTickBearing: null,
    lastGpsHeadingTs: null,
    gpsHeadingConfirmStreak: 0,
    acceptedHeading: null,
    debug: null,
  };

  const deviceCompassUsable = () => {
    const d = options.getDeviceHeading();
    return d.available === "available" && d.permission === "granted";
  };

  const resolve = (): number | null => {
    const now = Date.now();
    const sim = options.getSimHeading();
    const speedMps = options.getSpeedMps();
    const gpsHeadingRaw = options.getGpsHeading();
    const movementHeading = options.getMovementHeading();
    const { path, vehiclePos } = options.getRouteGeometry();

    // ── Simulador: prioridad absoluta, sin máquina de estados ──
    if (sim.active && sim.simHeading != null) {
      state.acceptedHeading = sim.simHeading;
      state.debug = {
        source: "SIMULATOR",
        speedMps,
        gpsHeading: gpsHeadingRaw,
        movementHeading,
        routeHeading: null,
        nextSegmentBearing: null,
        compassHeading: deviceCompassUsable() ? options.getDeviceHeading().heading : null,
        gpsVsRouteDeltaDeg: null,
        deviatingForMs: 0,
      };
      return sim.simHeading;
    }

    // ── Geometría de ruta: bearing del segmento actual y del siguiente ──
    let routeHeading: number | null = null;
    let nextSegmentBearing: number | null = null;
    if (path && path.length >= 2 && vehiclePos) {
      const total = pathLengthMeters(path);
      const driven = Math.min(Math.max(projectOntoPath(path, vehiclePos), 0), total);
      routeHeading = headingAlongPath(path, driven);
      // Bearing del segmento INMEDIATAMENTE siguiente al punto proyectado.
      let acc = 0;
      for (let i = 1; i < path.length; i++) {
        const segLen = haversineMeters(path[i - 1], path[i]);
        if (acc + segLen > driven) {
          nextSegmentBearing = bearingBetween(path[i - 1], path[i]);
          break;
        }
        acc += segLen;
      }
    }

    // ── Bearing entre ticks de GPS consecutivos (curso real medido) ──
    if (vehiclePos && state.lastGpsTickPos) {
      const tickDist = haversineMeters(state.lastGpsTickPos, vehiclePos);
      const tickElapsed = state.lastGpsTickTs != null ? now - state.lastGpsTickTs : 0;
      if (tickDist >= NAV_MOVEMENT_MIN_METERS && tickElapsed >= NAV_MOVEMENT_MIN_MS) {
        state.gpsTickBearing = bearingBetween(state.lastGpsTickPos, vehiclePos);
      }
    }
    if (vehiclePos && (!state.lastGpsTickPos || haversineMeters(state.lastGpsTickPos, vehiclePos) > 1)) {
      state.lastGpsTickPos = vehiclePos;
      state.lastGpsTickTs = now;
    }

    // ── Detección de spikes de GPS heading (sample aislado no corroborado) ──
    // Un salto grande del coords.heading solo se acepta si el bearing entre
    // ticks O la ruta lo respaldan; si no, exige varias muestras consecutivas.
    const corroboratedBy = (h: number): boolean => {
      if (state.gpsTickBearing != null && Math.abs(shortestAngleDelta(h, state.gpsTickBearing)) <= HEADING_DEVIATION_START_DEG) return true;
      const ref = routeHeading ?? nextSegmentBearing;
      return ref != null && Math.abs(shortestAngleDelta(h, ref)) <= HEADING_DEVIATION_START_DEG;
    };
    let gpsHeading = gpsHeadingRaw;
    if (gpsHeadingRaw != null) {
      const accepted = state.acceptedHeading;
      const jumped = accepted != null && Math.abs(shortestAngleDelta(gpsHeadingRaw, accepted)) > HEADING_DEVIATION_START_DEG;
      if (jumped && !corroboratedBy(gpsHeadingRaw)) {
        state.gpsHeadingSpikeStreak += 1;
        if (state.gpsHeadingSpikeStreak < HEADING_DEVIATION_MIN_SAMPLES) {
          gpsHeading = null; // sample aislado: ignorar este frame
        }
      } else {
        state.gpsHeadingSpikeStreak = 0;
      }
    }

    // ── Coincidencia GPS vs ruta (histéresis) ──
    const gpsRef = gpsHeading ?? movementHeading;
    const gpsVsRouteDeltaDeg =
      gpsRef != null && routeHeading != null
        ? Math.abs(shortestAngleDelta(routeHeading, gpsRef))
        : null;

    if (gpsVsRouteDeltaDeg != null) {
      if (!state.deviating) {
        // Entrar en "desviado" solo con diferencia grande y sostenida.
        if (gpsVsRouteDeltaDeg > HEADING_DEVIATION_START_DEG) {
          state.deviationStreak += 1;
          if (
            state.deviationStartedAt == null &&
            state.deviationStreak >= 2
          ) {
            state.deviationStartedAt = now;
          }
          const sustainedMs = state.deviationStartedAt != null ? now - state.deviationStartedAt : 0;
          if (
            sustainedMs >= HEADING_DEVIATION_CONFIRM_MS ||
            state.deviationStreak >= HEADING_DEVIATION_MIN_SAMPLES + 2
          ) {
            state.deviating = true;
          }
        } else {
          state.deviationStreak = 0;
          state.deviationStartedAt = null;
        }
      } else {
        // Ya en "desviado": volver a "en ruta" solo claramente (histéresis).
        if (gpsVsRouteDeltaDeg < ROUTE_ALIGN_TOLERANCE_DEG) {
          state.deviating = false;
          state.deviationStreak = 0;
          state.deviationStartedAt = null;
        }
      }
    }
    const deviatingForMs =
      state.deviating && state.deviationStartedAt != null ? now - state.deviationStartedAt : 0;

    // ── Selección de fuente por velocidad ──
    const device = options.getDeviceHeading();
    const compassOk = deviceCompassUsable();
    const compassHeading = compassOk ? device.heading : null;

    let heading: number | null = null;
    let source: DriveHeadingSource = "GPS";

    if (speedMps >= GPS_SPEED_DOMINANT_MPS) {
      // En movimiento: GPS domina. La ruta solo estabiliza si concuerdan.
      if (gpsHeading != null) {
        heading = gpsHeading;
        // Estabilizador de ruta: si el GPS concuerda con la ruta, suaviza el
        // rumbo hacia ella (evita ver 83° ↔ 87° oscilando) pero SOLO cuando
        // estamos "en ruta" (no desviados).
        if (!state.deviating && routeHeading != null) {
          const d = Math.abs(shortestAngleDelta(routeHeading, heading));
          if (d <= ROUTE_ALIGN_TOLERANCE_DEG) {
            heading = normalizeDeg(
              heading + shortestAngleDelta(routeHeading, heading) * 0.35
            );
            source = "FOLLOWING_ROUTE";
          } else {
            source = "GPS";
          }
        } else {
          source = state.deviating ? "DEVIATING" : "GPS";
        }
      } else if (movementHeading != null) {
        // Sin course válido: bearing entre posiciones GPS.
        heading = movementHeading;
        if (!state.deviating && routeHeading != null && Math.abs(shortestAngleDelta(routeHeading, heading)) <= ROUTE_ALIGN_TOLERANCE_DEG) {
          heading = normalizeDeg(heading + shortestAngleDelta(routeHeading, heading) * 0.35);
          source = "FOLLOWING_ROUTE";
        } else {
          source = state.deviating ? "DEVIATING" : "GPS";
        }
      } else if (compassOk) {
        // GPS temporalmente sin rumbo confiable: brújula como fallback.
        heading = compassHeading;
        source = "COMPASS_FALLBACK";
      }
    } else if (speedMps >= COMPASS_SPEED_MAX_MPS) {
      // Transición gradual (1–2 m/s): mezcla GPS/movimiento con brújula.
      const motionRef = gpsHeading ?? movementHeading;
      const t = (speedMps - COMPASS_SPEED_MAX_MPS) / (GPS_SPEED_DOMINANT_MPS - COMPASS_SPEED_MAX_MPS);
      if (motionRef != null && compassOk) {
        heading = normalizeDeg(motionRef + shortestAngleDelta(device.heading, motionRef) * (1 - t));
        source = motionRef === gpsHeading ? "GPS" : "GPS";
      } else if (motionRef != null) {
        heading = motionRef;
        source = state.deviating ? "DEVIATING" : "GPS";
      } else if (compassOk) {
        heading = compassHeading;
        source = "COMPASS_FALLBACK";
      }
    } else {
      // Detenido / muy lento: la brújula manda si existe; si no, último rumbo.
      if (compassOk) {
        heading = compassHeading;
        source = "COMPASS_FALLBACK";
      } else if (gpsHeading != null || movementHeading != null) {
        heading = gpsHeading ?? movementHeading;
        source = "GPS";
      }
    }

    if (heading != null) {
      // Confirmación de muestras: rastrea cuántas muestras GPS consecutivas
      // respaldan el rumbo aceptado (diagnóstico; el spike-filter usa la
      // corroboración por bearing/ruta, más directa).
      if (gpsHeading != null) {
        const agrees =
          state.acceptedHeading != null
            ? Math.abs(shortestAngleDelta(gpsHeading, state.acceptedHeading)) <= HEADING_DEVIATION_START_DEG
            : true;
        state.gpsHeadingConfirmStreak = agrees ? state.gpsHeadingConfirmStreak + 1 : 1;
      } else {
        state.gpsHeadingConfirmStreak = 0;
      }
      state.acceptedHeading = heading;
      state.lastGpsHeadingTs = gpsHeading != null ? now : state.lastGpsHeadingTs;
    }

    state.debug = {
      source: heading == null ? "COMPASS_FALLBACK" : source,
      speedMps,
      gpsHeading: gpsHeadingRaw,
      movementHeading,
      routeHeading,
      nextSegmentBearing,
      compassHeading,
      gpsVsRouteDeltaDeg,
      deviatingForMs,
    };
    return heading;
  };

  return { resolve, state };
}

/**
 * Punto de CÁMARA para que el conductor quede en el tercio inferior de la
 * pantalla con la carretera por delante. Solo es un objetivo visual: nunca
 * mueve al conductor ni la ruta.
 *
 * En navegación tipo Waze/Google Maps la cámara NO mira al vehículo: mira a
 * un punto POR DELANTE del vehículo. El vehículo queda entonces en el tercio
 * inferior y la carretera delante ocupa la mayor parte de la pantalla.
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
  const meters = Math.max(80, Math.min(420, viewHeightMeters * Math.abs(fraction)));
  return movePointAlong(driver, headingDeg, meters);
}

/**
 * Aplica la cámara en UNA llamada vía map.moveCamera (compose de
 * center/heading/tilt/zoom, mapa vectorial): evita los saltos y la doble
 * animación de setCenter/setHeading/setZoom por separado. Con mapa raster
 * (sin Map ID) moveCamera no existe: cae a setCenter + setHeading.
 */
function moveMapCamera(
  map: google.maps.Map,
  camera: google.maps.CameraOptions
): void {
  if (typeof map.moveCamera === "function") {
    map.moveCamera(camera);
    return;
  }
  // Fallback transitorio raster: mismo encuadre, sin tilt. Acepta cámara
  // PARCIAL (solo zoom, solo heading, ...) para no romper llamadas nuevas.
  if (camera.center != null) {
    map.setCenter(camera.center as google.maps.LatLngLiteral);
  }
  if (camera.heading != null) map.setHeading(camera.heading);
  if (camera.zoom != null) map.setZoom(camera.zoom);
}

/**
 * OFFER_ROUTE_PREVIEW — captura el estado de cámara ACTUAL para poder
 * restaurarlo cuando la oferta termine sin aceptación (sección 6). Si la
 * cámara aún no es legible (mapa recién montado) devuelve null y la
 * restauración cae al fallback: ubicación ACTUAL del repartidor + zoom drive.
 */
function captureOfferPreviewCamera(
  map: google.maps.Map,
  followDriver: boolean
): OfferPreviewCameraState | null {
  const center = map.getCenter?.();
  const zoom = map.getZoom?.();
  if (!center || typeof zoom !== "number") return null;
  return {
    center: { lat: center.lat(), lng: center.lng() },
    zoom,
    heading: map.getHeading?.() ?? null,
    tilt: map.getTilt?.() ?? null,
    followDriver,
  };
}

/**
 * OFFER_ROUTE_PREVIEW — encuadra el recorrido completo A → B (geometría vial
 * real si existe; si no, los dos puntos) con margen para que la ruta no
 * quede pegada a los bordes. Una sola llamada por actualización, sin
 * animaciones encadenadas (sección 13).
 */
function frameOfferPreview(
  map: google.maps.Map,
  pickup: RoutePoint,
  destination: RoutePoint,
  routePath: RoutePoint[] | null
): void {
  const points = routePath && routePath.length >= 2 ? routePath : [pickup, destination];
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
  // Aire alrededor del recorrido (misma proporción que frameRouteView).
  const latPad = (maxLat - minLat) * CAMERA_PADDING;
  const lngPad = (maxLng - minLng) * CAMERA_PADDING;
  map.fitBounds(
    {
      south: minLat - latPad,
      west: minLng - lngPad,
      north: maxLat + latPad,
      east: maxLng + lngPad,
    },
    OFFER_PREVIEW_CAMERA_MARGIN
  );
  const zoom = map.getZoom?.();
  if (typeof zoom === "number" && zoom > OFFER_PREVIEW_CAMERA_MAX_ZOOM) {
    map.setZoom(OFFER_PREVIEW_CAMERA_MAX_ZOOM);
  }
}

/**
 * Punto de navegación real para el tramo actual del pedido:
 * - navigate_pickup → coordenadas de la RECOLECCIÓN (storeLat/storeLng)
 * - navigate_delivery → coordenadas de la ENTREGA (destLat/destLng)
 * Si las coordenadas no existen (0/0), se cae al texto de la dirección real
 * del pedido en lugar de abrir la app en un punto inventado.
 */
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

// ── Main component ─────────────────────────────────────────────────

export default function DrivePage() {
  const { isSignedIn } = useAuth();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  const { isLoaded: mapsLoaded } = useJsApiLoader({
    id: "driver-app-google-maps",
    googleMapsApiKey: apiKey,
    // Carga el mapa vectorial asociado al Map ID (rotación/tilt habilitados).
    ...(DRIVE_MAP_ID ? { mapIds: [DRIVE_MAP_ID] } : {}),
  });

  // El sondeo solo arranca cuando Clerk confirma la sesión: sin sesión no se
  // llama /api/driver/state (evita los 401 repetidos en la subdominio Drive).
  const { state, loading, error: stateError, refetch } = useDriverState({
    enabled: isSignedIn === true,
  });
  const { location: gpsLocation, heading: gpsHeading } = useDriverLocation(
    state?.connected ?? false
  );

  // Brújula física del dispositivo (DeviceOrientationEvent). NO pide permiso
  // automáticamente: se activa solo cuando el repartidor comienza navegación
  // o pulsa "Centrar navegación", con explicación previa si es necesario.
  const deviceOrientation = useDeviceOrientation();

  // Panel de diagnóstico de sensores (solo desarrollo/debug): muestra heading
  // del dispositivo vs GPS, velocidad, fuente de heading y estado de permisos.
  // Se oculta en producción o cuando no hay ruta activa.
  // (declarado después de navigatingWithRoute para evitar TDZ)
  let sensorDebugVisible = false;
  const SHOW_SENSOR_DEBUG = false;

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // Error de la última acción de etapa (recogí / entregué / NIP). Se muestra
  // en el panel de detalles y se limpia al iniciar otra.
  const [stageActionError, setStageActionError] = useState<string | null>(null);
  // Altura visible del bottom sheet COLAPSADO (px). La hoja la reporta para
  // anclar los controles de cámara justo encima, incluso al expandir.
  const [tripSheetCollapsedHeight, setTripSheetCollapsedHeight] = useState<number | null>(null);
  // Estado EXPANDIDO de la hoja (la hoja lo reporta). La página lo usa para
  // la regla de distancia única: al expandir, la barra oculta la distancia.
  // IMPORTANTE: declarado ANTES de los early returns (Rules of Hooks).
  const [tripSheetExpanded, setTripSheetExpanded] = useState(false);
  // CIERRE DEL PANEL DE PEDIDO: al tocar el mapa la página incrementa este
  // token y el panel colapsa de inmediato (sin capa alguna sobre el mapa).
  const [tripSheetCollapseToken, setTripSheetCollapseToken] = useState(0);
  // HOJA DE RUTA: capa INDEPENDIENTE sobre el panel de pedido. Se abre solo
  // con "Ver ruta"; al abrirse el panel de pedido se colapsa para quedar
  // cubierto, y al cerrarse se restaura su estado exacto.
  const [routeSheetOpen, setRouteSheetOpen] = useState(false);
  // CANCELACIÓN DEL PEDIDO ACTIVO: segundo nivel del menú ⋮ del panel de
  // pedido. Igual que la Hoja de ruta, es una capa independiente que cubre el
  // panel mientras está abierta (el panel se colapsa detrás).
  const [cancelSheetOpen, setCancelSheetOpen] = useState(false);
  // HOME DEL REPARTIDOR (solo UI): pantalla de inicio con acceso al mapa y
  // las secciones Notificaciones y Wallet (placeholders). Solo se ofrece
  // cuando NO hay viaje activo (desconectado o disponible).
  const [homeOpen, setHomeOpen] = useState(false);
  // Si mientras el Home está abierto llega un viaje u oferta, se cierra solo:
  // el repartidor debe volver al mapa para atenderlo.
  const activeWorkRef = useRef(0);
  useEffect(() => {
    const work = (state?.orders?.length ?? 0) + (state?.offer ? 1 : 0);
    if (work > activeWorkRef.current) setHomeOpen(false);
    activeWorkRef.current = work;
  }, [state?.orders?.length, state?.offer]);
  // Timestamp del último paneo del mapa: un arrastre NO debe contar como
  // toque (no cierra "Tu ruta").
  const mapDraggedAtRef = useRef(0);
  // Intención de disponibilidad OPTIMISTA: la tarjeta de fin de ruta aparece /
  // desaparece al instante mientras el backend confirma (luego se sincroniza).
  const [stopOffersIntent, setStopOffersIntent] = useState<boolean | null>(null);
  // Toast temporal con Deshacer tras elegir disponibilidad en "Tu ruta".
  // El cambio de backend se aplica AL MOMENTO; Deshacer lo revierte.
  const [routeToast, setRouteToast] = useState<{
    message: string;
    undo: () => void;
  } | null>(null);
  const routeToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRouteToastTimer = useCallback(() => {
    if (routeToastTimerRef.current) {
      clearTimeout(routeToastTimerRef.current);
      routeToastTimerRef.current = null;
    }
  }, []);

  const showUndoToast = useCallback(
    (message: string, undo: () => void) => {
      clearRouteToastTimer();
      setRouteToast({ message, undo });
      routeToastTimerRef.current = setTimeout(() => setRouteToast(null), 6000);
    },
    [clearRouteToastTimer]
  );

  // Limpieza del timer al desmontar.
  useEffect(() => clearRouteToastTimer, [clearRouteToastTimer]);
  // Último pedido entregado (snapshot local): la orden sale del backend al
  // confirmarse la entrega, pero la confirmación limpia de finalización
  // ("Entrega completada") se muestra en el panel inferior unos segundos.
  const [lastDelivered, setLastDelivered] = useState<{ order: DriverOrder; at: number } | null>(
    null
  );
  // Mientras el repartidor evalúa al cliente, el panel no se autocierra: sería
  // absurdo que el formulario desapareciera a mitad de la captura.
  const [ratingEngaged, setRatingEngaged] = useState(false);

  // La confirmación de finalización se descarga sola: vuelve el panel de
  // espera (o la siguiente oferta) sin acción del repartidor.
  useEffect(() => {
    if (!lastDelivered || ratingEngaged) return;
    const t = setTimeout(() => setLastDelivered(null), 60_000);
    return () => clearTimeout(t);
  }, [lastDelivered, ratingEngaged]);
  // Una oferta nueva manda sobre la confirmación de finalización.
  useEffect(() => {
    if (state?.offer) setLastDelivered(null);
  }, [state?.offer]);
  // Al cambiar de pedido completado, reiniciamos el estado de evaluación.
  useEffect(() => {
    if (!lastDelivered) setRatingEngaged(false);
  }, [lastDelivered]);

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
      // Clave estable por intento (offerId): la oferta pasa de PENDING_DELIVERY
      // a ACTIVE sin volver a sonar (es la misma oferta, sólo cambió la ventana).
      notifyOfferChange(
        state.offer.orderNumber,
        state.offer.offerId ?? state.offer.offerExpiresAt
      );
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

  // ── ACK de presentación (OFFER_SHOWN) ───────────────────────
  // Cuando el servidor nos entrega la oferta (PENDING_DELIVERY) y la app puede
  // mostrarla, avisamos al backend. Sólo entonces el servidor fija los 14 s;
  // la latencia entre el Dispatch Center y el teléfono NO descuenta tiempo.
  const ackedOfferRef = useRef<string | null>(null);
  useEffect(() => {
    const pendingOffer = state?.offer;
    if (!pendingOffer || pendingOffer.offerStatus !== "pending_delivery") return;
    const key = pendingOffer.offerId ?? pendingOffer.orderNumber;
    if (ackedOfferRef.current === key) return;
    ackedOfferRef.current = key;
    fetch("/api/driver/offer-shown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderNumber: pendingOffer.orderNumber, offerId: pendingOffer.offerId }),
    })
      .then((res) => {
        // Fail-closed: si el servidor rechaza el ACK (409 conflicto, 500, etc.),
        // la oferta sigue en pending_delivery y DEBE reintentarse en el próximo
        // ciclo de polling; marcarla como "ackeada" dejaría la oferta sin
        // activar y el card sin temporizador para siempre.
        if (!res.ok) ackedOfferRef.current = null;
        return refetch();
      })
      .catch(() => {
        // Permite reintentar en el siguiente ciclo de polling.
        ackedOfferRef.current = null;
      });
  }, [state?.offer, refetch]);

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
  /** Último destino para el que el SIMULADOR ya pidió la ruta (ver más abajo). */
  const simRouteKeyRef = useRef<string | null>(null);
  /** Antes de este instante no se reintenta la ruta de la simulación. */
  const simRouteRetryAtRef = useRef(0);
  /** Motivo del último fallo de ruta durante la simulación (solo diagnóstico). */
  const [simRouteDiag, setSimRouteDiag] = useState<string | null>(null);

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

  // El simulador, además de mover el mapa, puede ejecutar las acciones REALES
  // del pedido (recoger/entregar) para dejarlo completado en el servidor —
  // así Dispatch, settlement y Wallet ven un servicio real. Se puede apagar
  // desde el panel dev para simular SOLO la vista.
  const [simCommitOrders, setSimCommitOrders] = useState(true);

  // Ref sincronizado del hook para que los callbacks estables (ej. el loop de
  // seguimiento) lean valores frescos sin depender del closure inicial ni sin
  // recrear rAF cada vez que cambia el estado del simulador.
  const simRef = useRef(sim);
  useEffect(() => {
    simRef.current = sim;
  }, [sim]);

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

  // Heading de navegación para el simulador: derivado de la ruta cuando está
  // activo (sin depender de sensores reales), para validar la cámara de forma
  // determinista. En GPS real sigue usándose navigationHeading().
  const navHeadingForSim = useMemo(() => {
    if (!sim.active || sim.simHeading == null) return null;
    return sim.simHeading;
  }, [sim.active, sim.simHeading]);

  // Ubicación del repartidor disponible en el mapa (GPS real o simulada).
  // OJO: durante la simulación esto pasa a true recién cuando la ruta ya
  // llegó y el marcador avanzó, por lo que NO sirve como condición para
  // pedir la ruta simulada (ver el efecto de ruta más abajo).
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
      simRouteKeyRef.current = null;
    }
    if (!navTarget || !mapsLoaded) {
      return;
    }

    // ── SIMULACIÓN ──
    // Dos diferencias deliberadas frente al GPS real:
    //  1. El origen es el punto de partida del viaje, NO la ubicación
    //     efectiva: la posición simulada nace justamente al avanzar por la
    //     ruta, así que exigirla aquí era un bloqueo mutuo (sin ruta no hay
    //     posición simulada; sin posición simulada no se pedía la ruta). El
    //     síntoma era "Esperando ruta de Google…" para siempre.
    //  2. Se pide UNA vez por destino y SIN cancelar: `currentLocation` cambia
    //     en cada frame y el cleanup cancelaba la petición en vuelo antes de
    //     que Google respondiera.
    if (sim.active) {
      const simOrigin = sim.simLocation ?? realLocation;
      if (!simOrigin) return;
      if (routeTargets(roadRoute, navTarget)) return;
      if (simRouteKeyRef.current === navKey && Date.now() < simRouteRetryAtRef.current) {
        return;
      }
      simRouteKeyRef.current = navKey;
      simRouteRetryAtRef.current = Date.now() + SIM_ROUTE_RETRY_MS;
      getRoadRoute(simOrigin, navTarget).then((route) => {
        // Si falla se reintenta tras el enfriamiento (getRoadRoute ya evita
        // castigar la API mientras el fallo esté cacheado). El motivo queda
        // visible en el panel dev: "REQUEST_DENIED" ⇒ falta habilitar la
        // Directions API, "maps_api_unavailable" ⇒ el loader no está listo.
        if (route) {
          setSimRouteDiag(null);
          setRoadRoute(route);
        } else {
          setSimRouteDiag(getLastRoutingError() ?? "sin_ruta");
        }
      });
      return;
    }

    if (!driverHasLocation) return;
    let cancelled = false;
    getRoadRoute(currentLocation, navTarget).then((route) => {
      if (!cancelled) setRoadRoute(route);
    });
    return () => {
      cancelled = true;
    };
  }, [
    currentLocation,
    realLocation,
    navTarget,
    mapsLoaded,
    driverHasLocation,
    sim.active,
    sim.simLocation,
    roadRoute,
  ]);

  // Al detener el simulador se permite volver a pedir la ruta en el próximo
  // intento (la marca por destino se limpia).
  useEffect(() => {
    if (!sim.active) {
      simRouteKeyRef.current = null;
      setSimRouteDiag(null);
    }
  }, [sim.active]);

  // Etapa de navegación efectiva (real o simulada).
  // Llegada AUTOMÁTICA por geocerca GPS: dentro del radio de llegada la UI
  // avanza a "en el punto" sin acción del repartidor (sin paso visual
  // "Llegué al punto"). El backend se marca en segundo plano (ver efecto
  // siguiente) para que las transiciones de confirmación sean válidas.
  const navPhase = useMemo<DriveNavPhase | null>(() => {
    if (sim.active) return sim.stage as DriveNavPhase;
    const phase = actionToNavPhase(orderAction?.action ?? null);
    if (phase === "to_pickup" && pickupPoint && haversineMeters(currentLocation, pickupPoint) < ARRIVAL_RADIUS_METERS) {
      return "at_pickup";
    }
    if (phase === "to_delivery" && deliveryPoint && haversineMeters(currentLocation, deliveryPoint) < ARRIVAL_RADIUS_METERS) {
      return "at_delivery";
    }
    return phase;
  }, [sim.active, sim.stage, orderAction, currentLocation, pickupPoint, deliveryPoint]);

  // ── Marcado de llegada en segundo plano (geocerca) ─────────────
  // Silencioso e idempotente: si falla, la confirmación manual sigue
  // funcionando. Un solo intento por pedido+acción hasta que cambie la etapa.
  const arrivalMarkedRef = useRef<string | null>(null);
  const markArrival = useCallback(
    async (orderNumber: string, action: "pickup_arrival" | "destination_arrival") => {
      try {
        await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, orderNumber }),
        });
      } catch {
        /* silencioso */
      }
    },
    []
  );
  useEffect(() => {
    if (sim.active || !activeOrder || !navPhase || !currentLocation) return;
    const action =
      navPhase === "at_pickup"
        ? "pickup_arrival"
        : navPhase === "at_delivery"
          ? "destination_arrival"
          : null;
    const target =
      navPhase === "at_pickup" ? pickupPoint : navPhase === "at_delivery" ? deliveryPoint : null;
    if (!action || !target) return;
    if (haversineMeters(currentLocation, target) >= ARRIVAL_RADIUS_METERS) return;
    const key = `${activeOrder.orderNumber}:${action}`;
    if (arrivalMarkedRef.current === key) return;
    arrivalMarkedRef.current = key;
    void markArrival(activeOrder.orderNumber, action);
  }, [navPhase, activeOrder, currentLocation, pickupPoint, deliveryPoint, sim.active, markArrival]);

  // Fase 4 — "llegando" SOLO con ruta del tramo vigente (ver routeOnLeg).

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
    let distanceToManeuver: number | null = null;
    if (pendingIdx >= 0) {
      const step = roadRoute.steps[pendingIdx];
      const next = roadRoute.steps[pendingIdx + 1];
      // Metros hasta el giro (fin del step en curso): si queda poco, mostrar
      // la siguiente maniobra en lugar de la instrucción del tramo actual.
      let accEnd = 0;
      for (let i = 0; i <= pendingIdx; i++) accEnd += roadRoute.steps[i].distanceMeters;
      const distToTurn = Math.max(0, accEnd - done);
      distanceToManeuver = distToTurn;
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
      // Calle donde ocurre la maniobra ("Av. Panamericana") o null.
      street: shownStep ? streetFromInstruction(shownStep.instruction) : null,
      // Metros hasta el final del step en curso (la siguiente maniobra).
      distanceToManeuver,
      fractionCompleted: Math.min(1, Math.max(0, done / total)),
    };
  }, [roadRoute, currentLocation]);

  // Fase 4 — "llegando" SOLO con ruta del tramo vigente. Al voltear de tramo
  // (recolección → entrega), la guidance del tramo anterior (~30 m restantes)
  // sobrevive un frame y dispararía un ARRIVING espurio; roadRoute.destination
  // identifica el tramo solicitado y lo excluye.
  const routeOnLeg = Boolean(
    roadRoute?.destination &&
      navTarget &&
      haversineMeters(roadRoute.destination, navTarget) < 30
  );
  const arrivingActive = useMemo(
    () =>
      Boolean(
        (navPhase === "to_pickup" || navPhase === "to_delivery") &&
          routeOnLeg &&
          guidance !== null &&
          guidance.remaining <= NEAR_DESTINATION_METERS
      ),
    [navPhase, routeOnLeg, guidance]
  );

  // ── Cámara (navegación tipo GPS) ────────────────────────────────
  // Modo seguimiento/navegación: la cámara acompaña al conductor con la
  // posición adelantada (tercio inferior) y orientación según rumbo. El mapa
  // se mueve y rota DEBAJO del conductor; currentLocation nunca cambia. Cuando
  // el usuario arrastra o hace zoom (interacción manual) salimos del modo; los
  // cambios internos de zoom usan un guard para no confundirse con el usuario.
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapListenersRef = useRef<Array<{ remove: () => void }>>([]);
  const lastFollowPosRef = useRef<RoutePoint | null>(null);
  const lastFramedRouteRef = useRef<RoadRoute | null>(null);
  const prevNavigatingRef = useRef(false);
  const prevFramedLegKeyRef = useRef<string | null>(null);
  const currentLocationRef = useRef<RoutePoint>(currentLocation);
  const movementHeadingRef = useRef<number | null>(null);
  const movementSpeedRef = useRef<number | null>(null);
  // Refs espejo para el loop rAF (lecturas frescas sin recrear el callback).
  const movementSpeedLoopRef = useRef<number | null>(null);
  const simSpeedLoopRef = useRef(1);
  const simActiveLoopRef = useRef(false);
  const simHeadingLoopRef = useRef<number | null>(null);
  const movementPrevRef = useRef<{ pos: RoutePoint; ts: number } | null>(null);
  const visualHeadingRef = useRef<number | null>(null);
  const visualCameraHeadingRef = useRef<{ current: number | null; lastTs?: number }>({ current: null });
  const headingRafRef = useRef<number | null>(null);
  const internalZoomRef = useRef(false);
  const internalZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seguimiento suave tipo GPS: el marcador y la cámara se interpolan entre
  // ticks de GPS vía rAF (nunca se teletransportan). El marcador se mueve por
  // ref (setPosition) para no re-renderizar la página a 60 fps.
  const initialDriverPosRef = useRef(currentLocation);
  const driverMarkerRef = useRef<google.maps.Marker | null>(null);
  const visualPosRef = useRef<RoutePoint>(currentLocation);
  const followTargetRef = useRef<RoutePoint | null>(null);
  const followRafRef = useRef<number | null>(null);
  const lastZoomRef = useRef<number | null>(null);
  // Objetivo de zoom vigente (histéresis): el loop persigue este valor de
  // forma exponencial frame a frame (transición suave, sin saltos).
  const targetZoomRef = useRef<{ target: number; ts: number } | null>(null);
  // Desvío: racha de ticks fuera de la geometría antes de recalcular.
  const offRouteStreakRef = useRef(0);
  const [followDriver, setFollowDriver] = useState(true);
  // Ancla de cámara adelantada al zoom base (m se multiplica por 2^(Δzoom)):
  // mantiene al conductor en el tercio inferior en cualquier nivel de zoom,
  // incluida la apertura antes de maniobras.
  const NAV_AHEAD_BASE = 90;
  const [isRecalculating, setIsRecalculating] = useState(false);
  // Mapa listo (onLoad del GoogleMap): los efectos que necesitan mapRef no
  // vacío (p. ej. OFFER_ROUTE_PREVIEW) se re-ejecutan cuando cambia.
  const [mapReady, setMapReady] = useState(false);
  // OFFER_ROUTE_PREVIEW: estado del preview de oferta. Declarado aquí para
  // que los efectos de cámara (más abajo) puedan leerlo sin TDZ.
  const [offerPreview, setOfferPreview] = useState<OfferPreviewState | null>(null);
  const offerPreviewActive = offerPreview !== null;

  const navigatingWithRoute = Boolean(
    navTarget && mapsLoaded && driverHasLocation && roadRoute?.path
  );

  // Ref de ruta para usarla en el loop de cámara sin re-suscribirlo.
  const roadRouteRef = useRef<RoadRoute | null>(roadRoute);
  useEffect(() => {
    roadRouteRef.current = roadRoute;
  }, [roadRoute]);
  const legKey = navTarget ? `${navTarget.lat.toFixed(4)},${navTarget.lng.toFixed(4)}` : null;

  // Panel de diagnóstico de sensores (solo desarrollo/debug): muestra heading
  // del dispositivo vs GPS, velocidad, fuente de heading y estado de permisos.
  // Se oculta en producción o cuando no hay ruta activa.
  if (SHOW_SENSOR_DEBUG) sensorDebugVisible = Boolean(navigatingWithRoute);

  // El rumbo visual para el marcador se deriva de refs en cada render.
  currentLocationRef.current = currentLocation;
  // Refs sincronizados para el loop rAF: velocidad GPS suavizada y rumbo del
  // simulador (así el hot path nunca lee valores desactualizados del closure).
  movementSpeedLoopRef.current = movementSpeedRef.current;
  simSpeedLoopRef.current = sim.speed;
  simActiveLoopRef.current = sim.active;
  simHeadingLoopRef.current = sim.simHeading;

  // Fuera del modo seguimiento (exploración / vista completa), el marcador
  // refleja la posición REAL en lugar de quedarse congelado en la última
  // interpolación del loop.
  useEffect(() => {
    if (!followDriver && driverMarkerRef.current) {
      driverMarkerRef.current.setPosition(currentLocation);
      visualPosRef.current = currentLocation;
    }
  }, [followDriver, currentLocation]);

  // ── Resolvedor de TARGET HEADING ──
  // Los valores de sensor se leen vía refs para que el resolvedor (creado una
  // sola vez) siempre vea el estado actual sin recrearse ni recrear el loop.
  const gpsHeadingRef = useRef<number | null>(gpsHeading);
  gpsHeadingRef.current = gpsHeading;
  const deviceStateRef = useRef(deviceOrientation.state);
  deviceStateRef.current = deviceOrientation.state;

  const driveHeadingResolverRef = useRef<ReturnType<
    typeof createDriveHeadingResolver
  > | null>(null);
  if (driveHeadingResolverRef.current == null) {
    driveHeadingResolverRef.current = createDriveHeadingResolver({
      getSimHeading: () => ({
        active: simRef.current.active,
        simHeading: simRef.current.simHeading,
      }),
      getGpsHeading: () => gpsHeadingRef.current,
      getSpeedMps: () =>
        simRef.current.active
          ? SIM_BASE_METERS_PER_SECOND * simRef.current.speed
          : (movementSpeedRef.current ?? 0),
      getMovementHeading: () => movementHeadingRef.current,
      getDeviceHeading: () => deviceStateRef.current,
      getRouteGeometry: () => ({
        path: roadRouteRef.current?.path ?? null,
        vehiclePos: visualPosRef.current,
      }),
    });
  }

  const driveHeadingResolver = driveHeadingResolverRef.current;

  const resolveNavigationHeading = useCallback(
    () => driveHeadingResolver.resolve(),
    [driveHeadingResolver]
  );

  const headingResolverRef = useRef<() => number | null>(resolveNavigationHeading);
  headingResolverRef.current = resolveNavigationHeading;

  const stopHeadingAnimation = useCallback(() => {
    if (headingRafRef.current !== null) {
      cancelAnimationFrame(headingRafRef.current);
      headingRafRef.current = null;
    }
  }, []);

  // ── Lecturas de scroll del documento SIN forzar layout ──────────
  // Framer Motion (proyección de layout) y otros códigos leen
  // documentElement/body.scrollLeft/scrollTop en cada commit y pasada del
  // frame loop. Cada lectura con el getter nativo fuerza un layout
  // síncrono contra el DOM de Google Maps (que muta cientos de atributos
  // por frame durante la navegación). En esta pantalla el scroll del
  // documento es siempre 0 (mapa fijo a pantalla completa con overlays
  // absolutos; verificado en dispositivo), así que se cachean los offsets
  // y se sirven sin layout; se refrescan en scroll/resize por corrección.
  useEffect(() => {
    const doc = document.documentElement;
    const body = document.body;
    // Getters NATIVOS capturados del prototipo: refresh() debe leer el valor
    // real aunque los own-properties ya estén instalados.
    const nativeLeft = Object.getOwnPropertyDescriptor(Element.prototype, "scrollLeft")?.get;
    const nativeTop = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")?.get;
    const cached = { left: 0, top: 0 };
    const refresh = () => {
      // Se llama en scroll/resize: el layout ya está validado en ese punto,
      // así que leer con el getter nativo es barato.
      cached.left = (nativeLeft?.call(doc) ?? 0) || (nativeLeft?.call(body) ?? 0);
      cached.top = (nativeTop?.call(doc) ?? 0) || (nativeTop?.call(body) ?? 0);
    };
    refresh();
    const install = () => {
      for (const [el, prop] of [
        [doc, "scrollLeft"],
        [doc, "scrollTop"],
        [body, "scrollLeft"],
        [body, "scrollTop"],
      ] as const) {
        if (Object.prototype.hasOwnProperty.call(el, prop)) continue;
        Object.defineProperty(el, prop, {
          get: () => (prop === "scrollLeft" ? cached.left : cached.top),
          configurable: true,
        });
      }
    };
    const restore = () => {
      for (const [el, prop] of [
        [doc, "scrollLeft"],
        [doc, "scrollTop"],
        [body, "scrollLeft"],
        [body, "scrollTop"],
      ] as const) {
        delete (el as unknown as Record<string, unknown>)[prop];
      }
    };
    install();
    window.addEventListener("scroll", refresh, { passive: true, capture: true });
    window.addEventListener("resize", refresh, { passive: true });
    return () => {
      window.removeEventListener("scroll", refresh, { capture: true });
      window.removeEventListener("resize", refresh);
      restore();
    };
  }, []);

  const applyHeading = useCallback((deg: number) => {
    const norm = normalizeDeg(deg);
    visualHeadingRef.current = norm;
    // El icono del marcador lo rota el loop rAF de forma imperativa
    // (applyDriverMarkerIcon); aquí SOLO se actualiza el heading visual.
    // El CENTRO lo maneja el loop de seguimiento suave (smoothFollowLoop): la
    // cámara rota y se desliza a la vez, sin saltos ni re-anclas bruscas.
  }, []);

  /** Rotación suave hacia `target` (siempre por el arco más corto). */
  const startHeadingTween = useCallback(
    (target: number) => {
      const map = mapRef.current;
      if (!map) return;
      // H2: el loop de seguimiento es la ÚNICA fuente de verdad del heading
      // visual mientras está activo (lo suaviza cada frame). Arrancar aquí un
      // segundo rAF competiría por visualHeadingRef.current durante las curvas.
      if (followRafRef.current !== null) return;
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

  /**
   * Loop rAF de seguimiento fluido (navegación tipo GPS): interpola la
   * posición del VEHÍCULO y la del CENTRO de cámara hacia sus objetivos con
   * easing, de modo que no hay teletransportación: el mapa se desliza y rota
   * DEBAJO del conductor, que permanece en la zona inferior (70-75%).
   */
  const cancelFollowLoop = useCallback(() => {
    if (followRafRef.current !== null) {
      cancelAnimationFrame(followRafRef.current);
      followRafRef.current = null;
    }
  }, []);

  /**
   * Marca el próximo zoom_changed como generado por la propia cámara
   * (Centrar GPS, encuadres, zoom de navegación): el listener no debe
   * confundirlo con un gesto del usuario (que activaría exploración).
   */
  const markInternalZoom = useCallback(() => {
    internalZoomRef.current = true;
    if (internalZoomTimerRef.current) clearTimeout(internalZoomTimerRef.current);
    internalZoomTimerRef.current = setTimeout(() => {
      internalZoomRef.current = false;
    }, INTERNAL_ZOOM_GUARD_MS);
  }, []);

  const ensureFollowLoop = useCallback(() => {
    if (followRafRef.current !== null) return;
    // H2: al tomar el control, cancelar cualquier heading tween en vuelo para
    // que solo un rAF escriba visualHeadingRef.current (evita el doble tirón
    // del heading durante las curvas).
    stopHeadingAnimation();
    const step = () => {
      const map = mapRef.current;
      const target = followTargetRef.current;
      if (!map || !target) {
        followRafRef.current = null;
        return;
      }

      // Leer el heading fused cada frame para que los cambios de sensor se
      // reflejen inmediatamente en la cámara, sin depender de efectos externos.
      const targetHeading = headingResolverRef.current();
      let heading = visualHeadingRef.current ?? targetHeading ?? 0;
      if (targetHeading != null && visualHeadingRef.current != null) {
        // Suavizado progresivo: cada frame avanza hacia el target.
        const delta = shortestAngleDelta(targetHeading, heading);
        if (Math.abs(delta) > NAV_HEADING_SKIP_DEG) {
          heading = normalizeDeg(heading + delta * 0.22);
          visualHeadingRef.current = heading;
          // Rotación imperativa del icono (sin setState): en el loop, heading
          // del vehículo y de la cámara derivan del mismo valor visual, así
          // que la flecha permanece apuntando hacia arriba en pantalla.
          applyDriverMarkerIcon(driverMarkerRef.current, heading, heading);
        }
      } else if (targetHeading != null && visualHeadingRef.current == null) {
        // Primer frame o después de exitFollowMode: saltar al target.
        heading = targetHeading;
        visualHeadingRef.current = heading;
        applyDriverMarkerIcon(driverMarkerRef.current, heading, heading);
      }

      // 1) Interpolar la posición del vehículo hacia la posición GPS real.
      const cur = visualPosRef.current;
      const dist = haversineMeters(cur, target);
      let next = cur;

      if (dist < 0.5) {
        next = target;
      } else {
        const stepMeters = Math.max(
          POSITION_MIN_STEP_METERS,
          Math.min(dist, dist * POSITION_SMOOTH_FACTOR)
        );
        next = movePointAlong(cur, bearingBetween(cur, target), stepMeters);
      }
      visualPosRef.current = next;
      driverMarkerRef.current?.setPosition(next);

      // 2) Centro de cámara ANCLADO AL VEHÍCULO VISUAL + target adelantado:
      //    la cámara mira a un punto POR DELANTE del vehículo para que la
      //    carretera delante ocupe la mayor parte de la pantalla (comportamiento
      //    tipo Waze). El vehículo queda en el tercio inferior.
      const currentSim = simRef.current;
      const navHeadingForSim = currentSim.active && currentSim.simHeading != null
        ? currentSim.simHeading
        : null;
      const navHeading = navHeadingForSim ?? heading;

      // Calcular target de cámara: punto adelantado del vehículo en el heading
      // de navegación. Este es el punto geográfico QUE LA CÁMARA MIRA. Al
      // abrirse la cámara antes de un giro, el ancla se adelanta MÁS para que
      // el conductor no suba en pantalla y queden visibles el punto exacto de
      // la maniobra, el tramo previo y el tramo posterior al giro.
      const currentZoom = map.getZoom?.();
      const zoomNow = typeof currentZoom === "number" ? currentZoom : NAV_ZOOM_BASE;
      const aheadMeters = NAV_AHEAD_BASE * Math.pow(2, zoomNow - NAV_ZOOM_BASE);
      const desiredCenter = movePointAlong(next, navHeading, aheadMeters);

      // Suavizado angular de la cámara basado en delta time para que el giro sea
      // consistente a diferentes FPS y no salte instantáneamente ante cambios de
      // heading del simulador o de la ruta.
      const now = performance.now();
      const cam = visualCameraHeadingRef.current;
      const prevHeading = cam.current;
      if (prevHeading != null && navHeading != null) {
        const deltaDeg = shortestAngleDelta(navHeading, prevHeading);
        if (Math.abs(deltaDeg) > NAV_HEADING_SKIP_DEG) {
          const dtSec = Math.max(0.001, (now - (cam.lastTs ?? now)) / 1000);
          const maxDeg = Math.min(Math.abs(deltaDeg), MAX_HEADING_ROTATION_DEG_PER_SEC * dtSec);
          const sign = deltaDeg > 0 ? 1 : -1;
          const visualCameraHeading = normalizeDeg(prevHeading + sign * maxDeg);
          cam.current = visualCameraHeading;
          cam.lastTs = now;
          moveMapCamera(map, { center: desiredCenter, heading: visualCameraHeading, tilt: 0 });
        } else {
          cam.current = navHeading;
          cam.lastTs = now;
          moveMapCamera(map, { center: desiredCenter, heading: navHeading, tilt: 0 });
        }
      } else {
        if (navHeading != null) {
          cam.current = navHeading;
          cam.lastTs = now;
        }
        moveMapCamera(map, { center: desiredCenter, heading: navHeading ?? 0, tilt: 0 });
      }
      // ── ZOOM ADAPTATIVO SUAVE (frame a frame) ──
      // Objetivo por VELOCIDAD (más lejos al acelerar, más cerca al frenar)
      // y por MANIOBRA: al acercarse a un giro relevante la cámara se abre
      // GRADUALMENTE (punto del giro + tramo previo + posterior visibles) y
      // tras completarlo se recupera progresivamente el zoom de seguimiento.
      // El zoom REAL se interpola cada frame: transición animada sin saltos.
      {
        const loopSim = simRef.current;
        const speedMps = loopSim.active
          ? SIM_BASE_METERS_PER_SECOND * loopSim.speed
          : (movementSpeedLoopRef.current ?? 0);
        let target =
          NAV_ZOOM_SLOW - (speedMps / NAV_SPEED_REF_MPS) * (NAV_ZOOM_SLOW - NAV_ZOOM_FAST);
        target = Math.max(NAV_ZOOM_MIN, Math.min(NAV_ZOOM_MAX, target));
        const route = roadRouteRef.current;
        if (route?.path && route.path.length >= 2 && route.steps.length > 0) {
          const total = pathLengthMeters(route.path);
          const done = Math.min(Math.max(projectOntoPath(route.path, next), 0), total);
          // Localizar el step en curso (el que aún no termina).
          let accEnd = 0;
          let idx = route.steps.length - 1;
          for (let i = 0; i < route.steps.length; i++) {
            accEnd += route.steps[i].distanceMeters;
            if (accEnd > done) {
              idx = i;
              break;
            }
          }
          const stepEnd = accEnd;
          const distToTurn = Math.max(0, stepEnd - done);
          const curStep = route.steps[idx];
          const nextStep = route.steps[idx + 1];
          // Maniobra que estamos preparando: si el giro siguiente es
          // consecutivo, apreciar el CONJUNTO (no alternar cercano/lejano).
          const preparingNext =
            nextStep != null && distToTurn <= CONSECUTIVE_MANEUVER_METERS;
          const activeStep = preparingNext ? nextStep : curStep;
          const nextOfActive = preparingNext ? route.steps[idx + 2] : nextStep;
          // Relevancia = ángulo entre el rumbo ACTUAL y el rumbo POST-GIRO
          // del step activo. Giros leves no abren la cámara; retorno/glorieta
          // la abren más. (El bearing del step en curso contra sí mismo era
          // siempre 0: por eso nunca se abría.)
          if (activeStep != null) {
            const before = bearingBetween(activeStep.start, activeStep.end);
            const after =
              nextOfActive != null
                ? bearingBetween(nextOfActive.start, nextOfActive.end)
                : before;
            if (before != null && after != null) {
              const angle = Math.abs(shortestAngleDelta(after, before));
              const strength =
                angle >= TURN_ANGLE_STRONG_DEG
                  ? TURN_ZOOM_OUT_STRONG
                  : angle >= TURN_ANGLE_SIGNIFICANT_DEG
                    ? TURN_ZOOM_OUT
                    : 0;
              if (strength > 0) {
                // Perfil suave antes del giro (apertura gradual) y después
                // (recuperación progresiva del zoom de seguimiento).
                const rampIn = 1 - Math.min(1, distToTurn / TURN_AWARENESS_METERS);
                const past = Math.max(0, done - stepEnd);
                const rampOut = 1 - Math.min(1, past / TURN_RECOVERY_METERS);
                const openFactor = strength * Math.max(rampIn, rampOut);
                if (openFactor > 0) {
                  target = Math.max(NAV_ZOOM_MIN - 0.4, target - openFactor);
                }
              }
            }
          }
        }
        // Histéresis del objetivo: no recalcular para micro-variaciones.
        const lastTarget = targetZoomRef.current?.target ?? null;
        if (lastTarget == null || Math.abs(target - lastTarget) >= NAV_ZOOM_HYSTERESIS) {
          targetZoomRef.current = { target, ts: performance.now() };
        }
        // Persecución EXPONENCIAL del zoom (frame a frame): nunca hay salto;
        // la cámara se abre al aproximarse y se cierra al salir de la maniobra.
        const activeZoomTarget = targetZoomRef.current?.target ?? target;
        const zoomDelta = activeZoomTarget - zoomNow;
        if (Math.abs(zoomDelta) > NAV_ZOOM_EPSILON) {
          const stepZoom = zoomNow + zoomDelta * NAV_ZOOM_SMOOTH;
          const clamped = Math.max(
            NAV_ZOOM_MIN - 0.4,
            Math.min(NAV_ZOOM_MAX, stepZoom)
          );
          lastZoomRef.current = clamped;
          // El zoom programático necesita el guard: sin él, zoom_changed lo
          // interpretaría como gesto del usuario y cancelaría el seguimiento.
          markInternalZoom();
          moveMapCamera(map, { zoom: clamped });
        }
      }

      if (dist < 0.5) {
        const c = map.getCenter?.() as { lat(): number; lng(): number } | undefined;
        if (!c || haversineMeters({ lat: c.lat(), lng: c.lng() }, desiredCenter) < 1) {
          followRafRef.current = null;
          return;
        }
      }
      followRafRef.current = requestAnimationFrame(step);
    };
    followRafRef.current = requestAnimationFrame(step);
  }, [stopHeadingAnimation, markInternalZoom]);

  /** Sale del modo navegación/seguimiento (interacción manual del usuario). */
  const exitFollowMode = useCallback(() => {
    setFollowDriver(false);
    cancelFollowLoop();
    stopHeadingAnimation();
    visualHeadingRef.current = null;
    // Norte arriba: la flecha vuelve a rotación absoluta 0 (apunta al norte).
    applyDriverMarkerIcon(driverMarkerRef.current, 0, null);
    const map = mapRef.current;
    // Norte arriba y sin tilt: vista de exploración tras el gesto del usuario.
    if (map && map.getHeading?.()) {
      moveMapCamera(map, { heading: 0, tilt: 0 });
    }
  }, [cancelFollowLoop, stopHeadingAnimation]);

  const handleMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      setMapReady(true);
      // Solo dev: expone el mapa para probar en DevTools Console, p. ej.
      // __driveMap.getRenderingType() → "VECTOR" con el Map ID configurado.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __driveMap?: google.maps.Map }).__driveMap = map;
      }
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
    cancelFollowLoop();
    stopHeadingAnimation();
    mapListenersRef.current.forEach((listener) => listener.remove());
    mapListenersRef.current = [];
    mapRef.current = null;
    setMapReady(false);
    resetDriverMarkerIconBucket();
    resetDestinationPins();
    if (process.env.NODE_ENV !== "production") {
      delete (window as unknown as { __driveMap?: google.maps.Map }).__driveMap;
    }
    driverMarkerRef.current = null;
  }, [cancelFollowLoop, stopHeadingAnimation]);

  // Limpieza global al desmontar.
  useEffect(() => {
    return () => {
      cancelFollowLoop();
      stopHeadingAnimation();
      if (internalZoomTimerRef.current) clearTimeout(internalZoomTimerRef.current);
    };
  }, [cancelFollowLoop, stopHeadingAnimation]);

  // Rumbo + velocidad derivados por movimiento del GPS real (no aplica en
  // simulación: el simulador ya entrega una posición continua por geometría).
  useEffect(() => {
    if (sim.active) {
      movementPrevRef.current = null;
      movementHeadingRef.current = null;
      movementSpeedRef.current = null;
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
        const speedMps = dist / (elapsed / 1000);
        movementSpeedRef.current =
          movementSpeedRef.current == null
            ? speedMps
            : movementSpeedRef.current + (speedMps - movementSpeedRef.current) * 0.3;
      }
    }
  }, [currentLocation, sim.active]);

  // Al salir de una navegación con ruta (pedido entregado / ruta fallida):
  // restaurar norte arriba, zoom por defecto y centrar al repartidor.
  useEffect(() => {
    const map = mapRef.current;
    if (map && prevNavigatingRef.current && !navigatingWithRoute) {
      cancelFollowLoop();
      stopHeadingAnimation();
      visualHeadingRef.current = null;
      applyDriverMarkerIcon(driverMarkerRef.current, 0, null);
      moveMapCamera(map, { heading: 0, tilt: 0 });
      markInternalZoom();
      map.setZoom(DEFAULT_ZOOM);
      lastFollowPosRef.current = currentLocation;
      map.setCenter(currentLocation);
      setFollowDriver(true);
      setIsRecalculating(false);
    }
    prevNavigatingRef.current = navigatingWithRoute;
  }, [
    navigatingWithRoute,
    currentLocation,
    cancelFollowLoop,
    stopHeadingAnimation,
    markInternalZoom,
    mapsLoaded,
  ]);

  // ── Modo navegación (conductor en el tercio inferior, rumbo, ruta por delante)
  useEffect(() => {
    const map = mapRef.current;
    // OFFER_ROUTE_PREVIEW activo: la cámara pertenece al preview (sección 12,
    // NO seguir al repartidor); pausar el seguimiento hasta que termine.
    if (offerPreviewActive) {
      cancelFollowLoop();
      // Sección 7: SIN congelar al repartidor — el marcador continúa
      // actualizándose con GPS (este efecto corre en cada tick de
      // currentLocation); solo la cámara queda bajo control del preview.
      visualPosRef.current = currentLocation;
      driverMarkerRef.current?.setPosition(currentLocation);
      return;
    }
    if (!mapsLoaded || !map || !followDriver || !driverHasLocation) {
      // Sin seguimiento activo, el loop no debe seguir moviendo la cámara
      // (p. ej. tras encuadrar un tramo nuevo o explorar manualmente).
      cancelFollowLoop();
      return;
    }
    const withRoute = Boolean(
      navTarget && roadRoute?.path && roadRoute.path.length >= 2
    );

    if (!withRoute) {
      // Sin ruta: seguimiento simple con heading del dispositivo/GPS.
      // El marcador acompaña a la posición real y el mapa se orienta según
      // el heading disponible (GPS, movimiento o brújula) para que la
      // experiencia sea similar a un GPS aunque la ruta aún no esté lista.
      cancelFollowLoop();
      visualPosRef.current = currentLocation;
      driverMarkerRef.current?.setPosition(currentLocation);
      const target = headingResolverRef.current();
      if (target != null) {
        applyHeading(target);
        moveMapCamera(map, { heading: target, tilt: 0 });
      } else if (visualHeadingRef.current != null) {
        // Mantener el último heading conocido (no forzar norte arriba).
        moveMapCamera(map, { heading: visualHeadingRef.current, tilt: 0 });
      } else {
        moveMapCamera(map, { heading: 0, tilt: 0 });
      }
      const last = lastFollowPosRef.current;
      const dist = last ? haversineMeters(last, currentLocation) : Infinity;
      if (dist < DRIVER_CENTER_METERS) {
        // Ya cerca: solo actualizar marcador, no mover cámara.
        return;
      }
      lastFollowPosRef.current = currentLocation;
      map.setCenter(currentLocation);
      return;
    }

    // Seguimiento fluido: el loop rAF interpola vehículo y cámara (sin saltos).
    followTargetRef.current = currentLocation;
    ensureFollowLoop();

    // Iniciar tweens de rotación cuando el heading fused cambia significativamente.
    // El loop de seguimiento (ensureFollowLoop) ya aplica suavizado frame a frame,
    // pero este efecto asegura que los cambios grandes (p. ej. rotar el teléfono
    // 180°) se activen inmediatamente. No hace falta gatear por hasMotion porque
    // navigationHeading() ya decide cuándo usar brújula vs GPS.
    const target = headingResolverRef.current();
    if (target != null) {
      const current = visualHeadingRef.current;
      if (current == null || Math.abs(shortestAngleDelta(target, current)) > NAV_HEADING_SKIP_DEG) {
        startHeadingTween(target);
      }
    }

    // El zoom dinámico (velocidad + maniobras) vive DENTRO del loop de
    // seguimiento (ensureFollowLoop): se aplica frame a frame con transición
    // exponencial, sin saltos ni parpadeos.
  }, [
    mapsLoaded,
    followDriver,
    driverHasLocation,
    offerPreviewActive,
    currentLocation,
    roadRoute,
    navTarget,
    gpsHeading,
    sim.active,
    sim.speed,
    navHeadingForSim,
    guidance,
    ensureFollowLoop,
    cancelFollowLoop,
    startHeadingTween,
    markInternalZoom,
    applyHeading,
  ]);

  // ── Detección de desvío (fuera de ruta) ─────────────────────────
  // Si el repartidor se aleja de la geometría vial real más de OFF_ROUTE_METERS
  // durante varios ticks de GPS consecutivos, se recalcula la ruta desde su
  // posición actual hacia el mismo destino, manteniendo el modo de navegación.
  // El GPS ruidoso no dispara recálculos: hace falta persistencia.
  useEffect(() => {
    if (sim.active || !mapsLoaded || !driverHasLocation || !navTarget) {
      offRouteStreakRef.current = 0;
      return;
    }
    const path = roadRoute?.path;
    if (!path || path.length < 2) {
      offRouteStreakRef.current = 0;
      return;
    }
    // Solo importa el desvío LATERAL a la ruta (no el avance sobre ella) y
    // ya pasado el inicio del trayecto (evita falsos positivos al salir).
    const lateral = distanceToPathMeters(path, currentLocation);
    const pastStart = projectOntoPath(path, currentLocation) > 40;
    if (lateral > OFF_ROUTE_METERS && pastStart) {
      offRouteStreakRef.current += 1;
    } else {
      offRouteStreakRef.current = 0;
    }
    if (offRouteStreakRef.current >= OFF_ROUTE_CHECKS) {
      offRouteStreakRef.current = 0;
      setIsRecalculating(true);
      // force=true: ruta NUEVA aunque el origen siga cerca del anterior.
      getRoadRoute(currentLocation, navTarget, true).then((route) => {
        if (route) setRoadRoute(route);
        setIsRecalculating(false);
      });
    }
  }, [currentLocation, roadRoute, navTarget, mapsLoaded, driverHasLocation, sim.active]);

  // ── Encuadre inicial AL ASIGNARSE un viaje ──
  // BUG corregido: antes se hacía un fitBounds de toda la ruta (vista
  // alejada y genérica). Ahora la cámara prioriza el GPS real del repartidor
  // en modo seguimiento (heading-up, zoom de navegación). Si el GPS aún no
  // está disponible, se parte del último punto confiable (realLocation con
  // fallback al estado del backend) y el loop de seguimiento desliza la
  // cámara suavemente hacia adelante cuando llega la primera ubicación
  // válida — sin saltos ni recálculos visuales agresivos.
  const initialFocusDoneRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!mapsLoaded || !map || offerPreviewActive) return;
    if (!driverHasLocation || !navTarget) return;
    const orderNumber = activeOrder?.orderNumber ?? null;
    if (!orderNumber || initialFocusDoneRef.current === orderNumber) return;
    initialFocusDoneRef.current = orderNumber;
    lastFramedRouteRef.current = roadRoute;
    prevFramedLegKeyRef.current = legKey;
    // Prioridad #1: GPS real y actual del repartidor. La cámara arranca en
    // la posición real, orientada al rumbo conocido, con zoom de navegación.
    lastFollowPosRef.current = currentLocation;
    visualPosRef.current = currentLocation;
    driverMarkerRef.current?.setPosition(currentLocation);
    followTargetRef.current = currentLocation;
    lastZoomRef.current = null;
    markInternalZoom();
    moveMapCamera(map, { zoom: NAV_ZOOM_BASE });
    const target = headingResolverRef.current();
    if (target != null) {
      applyHeading(target);
      moveMapCamera(map, { heading: target, tilt: 0 });
    }
    // Seguimiento automático: la cámara acompaña al repartidor desde ya.
    setFollowDriver(true);
    if (roadRoute?.path && roadRoute.path.length >= 2) {
      ensureFollowLoop();
    }
    // La brújula se activa en segundo plano (iOS puede pedir permiso).
    if (deviceOrientation.state.available !== "available") {
      deviceOrientation.enable().catch(() => {});
    }
  }, [
    mapsLoaded,
    mapReady,
    offerPreviewActive,
    driverHasLocation,
    navTarget,
    activeOrder,
    currentLocation,
    roadRoute,
    legKey,
    ensureFollowLoop,
    applyHeading,
    markInternalZoom,
    deviceOrientation,
  ]);

  // ── OFFER_ROUTE_PREVIEW (secciones 1–9, 15–17) ─────────────────
  // Preview TEMPORAL del recorrido pickup → destino mientras la oferta está
  // en pantalla. AISLADO de la navegación real: nunca escribe navPhase,
  // navTarget, roadRoute ni el estado del pedido (sección 10).

  // offerPreview (estado visible por el render: polyline + marcadores
  // temporales) se declara arriba, junto a mapReady.
  // Ref espejo para que callbacks/respuestas asíncronas lean el valor fresco
  // sin recrearse (decisiones sobre rutas tardías, restauración, etc.).
  const offerPreviewRef = useRef<OfferPreviewState | null>(null);
  // Cancelación de la solicitud de ruta en vuelo (sección 16: sin callbacks
  // modificando el mapa después de que la oferta terminó).
  const offerRouteRequestRef = useRef<{ canceled: boolean } | null>(null);
  // "Sesión" de preview activa: evita restaurar la cámara entre ofertas
  // consecutivas (sección 8) y genera la clave de ignoración de rutas tardías.
  const offerPreviewSessionRef = useRef(0);
  // Contexto de cámara capturado para la SESIÓN de preview actual: sobrevive
  // al intercambio A→B dentro de la gracia (sección 8) para que la oferta B
  // herede el contexto original en lugar de recapturar.
  const offerSavedCameraRef = useRef<OfferPreviewCameraState | null>(null);
  // Ancla temporal para la gracia entre ofertas consecutivas (sección 8).
  const offerEndedAtRef = useRef(0);
  // orderNumber de la oferta que el repartidor ACEPTÓ (sección 4): suprime la
  // restauración de cámara; la navegación normal toma el control.
  const acceptedOfferOrderRef = useRef<string | null>(null);
  // Marca de tiempo del último gesto del usuario sobre el mapa (pan/zoom).
  const lastMapInteractionAtRef = useRef(0);

  useEffect(() => {
    offerPreviewRef.current = offerPreview;
  }, [offerPreview]);

  // Gesto manual durante el preview: la cámara deja de ser "autómata" y la
  // restauración pasa al fallback (posicionamiento ACTUAL + zoom drive).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onInteraction = () => {
      lastMapInteractionAtRef.current = Date.now();
    };
    const listeners = [
      map.addListener("dragstart", onInteraction),
      map.addListener("zoom_changed", () => {
        // Los zooms PROGRAMÁTICOS (encuadre del preview, cámara drive) no son
        // gestos del usuario: el guard internalZoomRef los excluye.
        if (!internalZoomRef.current) onInteraction();
      }),
    ];
    return () => {
      listeners.forEach((l) => l.remove());
    };
  }, [mapReady]);

  // Restaura la cámara al terminar la oferta SIN aceptación (secciones 6–7).
  // "current" es la ubicación GPS ACTUAL del repartidor (no la congelada al
  // llegar la oferta): si se movió durante el preview, el mapa regresa a su
  // posición presente con el CONTEXTO de cámara apropiado.
  const restoreCameraAfterOffer = useCallback(
    (current: RoutePoint, previous: OfferPreviewCameraState | null) => {
      const map = mapRef.current;
      if (!map) return;
      // Si el repartidor tocó el mapa durante el preview, no pisar su vista:
      // solo se recupera con el botón Centrar GPS.
      if (Date.now() - lastMapInteractionAtRef.current < OFFER_PREVIEW_CAMERA_GRACE_MS) {
        return;
      }
      // Contexto de cámara válido y modo de exploración intacto → restaurarlo
      // tal cual (center capturado; el repartidor se dibuja donde está).
      if (previous && !previous.followDriver) {
        markInternalZoom();
        moveMapCamera(map, {
          center: previous.center,
          zoom: previous.zoom,
          ...(previous.heading != null ? { heading: previous.heading } : {}),
          ...(previous.tilt != null ? { tilt: previous.tilt } : {}),
        });
        return;
      }
      // Fallback (también si estaba en navegación heading-up: el modo
      // seguimiento continúa activo y la cámara vuela sola a la posición
      // ACTUAL; ver efecto de navegación → no recentrar dos veces aquí).
      if (previous?.followDriver) {
        setFollowDriver(true);
        // Reanudar el seguimiento DESDE la posición ACTUAL del repartidor:
        // el loop interpola la cámara de vuelta sin salto brusco.
        followTargetRef.current = current;
        visualPosRef.current = current;
        driverMarkerRef.current?.setPosition(current);
        markInternalZoom();
        moveMapCamera(map, { zoom: NAV_ZOOM_BASE });
        ensureFollowLoop();
        return;
      }
      lastFollowPosRef.current = current;
      markInternalZoom();
      map.setZoom(DEFAULT_ZOOM);
      map.setCenter(current);
    },
    [markInternalZoom, ensureFollowLoop]
  );

  // Solicitud de ruta del preview (pickup → destino) con TODAS las guardas de
  // respuesta tardía (sección 15): oferta terminada, oferta reemplazada o
  // request cancelado → se ignora. El fallo NUNCA bloquea la oferta.
  const requestOfferPreviewRoute = useCallback(
    (pickup: RoutePoint, destination: RoutePoint, offerKey: string, session: number) => {
      const request = { canceled: false };
      offerRouteRequestRef.current = request;
      getRoadRoute(pickup, destination)
        .then((route) => {
          if (request.canceled) return;
          const live = offerPreviewRef.current;
          if (!live || live.offerKey !== offerKey) return; // oferta ya terminó
          if (session !== offerPreviewSessionRef.current) return; // reemplazada (sección 8)
          if (route && route.path.length >= 2) {
            setOfferPreview((prev) =>
              prev && prev.offerKey === offerKey ? { ...prev, route } : prev
            );
            const map = mapRef.current;
            if (map) {
              cancelFollowLoop();
              markInternalZoom();
              moveMapCamera(map, { heading: 0, tilt: 0 });
              frameOfferPreview(map, pickup, destination, route.path);
            }
          } else {
            // Routing falló: la oferta sigue funcionando (sección 15), el
            // mapa se queda con los marcadores y el encuadre por puntos.
            console.warn("OFFER_ROUTE_PREVIEW_FAILED", { orderNumber: live.orderNumber });
          }
        })
        .catch(() => {
          /* Sección 15: el fallo de routing nunca bloquea la oferta. */
        });
    },
    [cancelFollowLoop, markInternalZoom]
  );

  // Ciclo de vida del preview: entrada (nueva oferta / reemplazo),
  // expiración, rechazo y limpieza al desmontar (secciones 1, 5, 8, 9, 16).
  // La ACEPTACIÓN no restaura nada: el flujo normal de navegación toma el
  // control (sección 4) y este estado simplemente se destruye.
  useEffect(() => {
    if (!mapsLoaded) return;
    // `offer` se lee de state: el alias de render se declara más abajo.
    const currentOffer = state?.offer ?? null;
    const key = currentOffer ? currentOffer.offerId ?? currentOffer.orderNumber : null;

    // ── Oferta visible → activar / actualizar preview ──
    if (currentOffer && key) {
      const existing = offerPreviewRef.current;
      // Oferta ya en pantalla (ciclo de polling): no re-encuadrar (evita
      // resetear fitBounds en cada tick y no toca el temporizador, sección 14).
      if (existing && existing.offerKey === key) {
        // El mapa terminó de cargar DESPUÉS de la oferta: disparar el encuadre
        // y la ruta que quedaron pendientes (routeRequested evita repetirlos).
        if (
          mapReady &&
          !existing.routeRequested &&
          existing.pickup &&
          existing.destination
        ) {
          setOfferPreview((prev) =>
            prev && prev.offerKey === key ? { ...prev, routeRequested: true } : prev
          );
          const map = mapRef.current;
          if (map) {
            cancelFollowLoop();
            markInternalZoom();
            moveMapCamera(map, { heading: 0, tilt: 0 });
            frameOfferPreview(map, existing.pickup, existing.destination, null);
          }
          requestOfferPreviewRoute(
            existing.pickup,
            existing.destination,
            key,
            offerPreviewSessionRef.current
          );
        }
        return;
      }

      acceptedOfferOrderRef.current = null;
      const pickupValid = hasValidCoords(currentOffer.storeLat, currentOffer.storeLng);
      const destValid = hasValidCoords(currentOffer.destLat, currentOffer.destLng);
      const pickup = pickupValid ? { lat: currentOffer.storeLat, lng: currentOffer.storeLng } : null;
      const destination = destValid ? { lat: currentOffer.destLat, lng: currentOffer.destLng } : null;
      const orderNumber = currentOffer.orderNumber;

      // Contexto de cámara: capturado SOLO en la primera oferta de la sesión;
      // en reemplazo (oferta B tras A, sección 8) se conserva el original.
      const inGrace =
        offerEndedAtRef.current > 0 &&
        Date.now() - offerEndedAtRef.current <= OFFER_PREVIEW_CAMERA_GRACE_MS;
      const previousCamera = inGrace
        ? offerSavedCameraRef.current
        : captureOfferPreviewCamera(mapRef.current!, followDriver);
      offerSavedCameraRef.current = previousCamera;
      offerEndedAtRef.current = 0;
      offerPreviewSessionRef.current += 1;
      offerRouteRequestRef.current = { canceled: true }; // cancela ruta en vuelo de la oferta anterior
      const session = offerPreviewSessionRef.current;

      setOfferPreview({
        offerKey: key,
        orderNumber,
        pickup,
        destination,
        pickupLabel: currentOffer.mandadoOriginLabel ?? currentOffer.storeName,
        destinationLabel: currentOffer.mandadoDestinationLabel ?? currentOffer.destLabel,
        route: null,
        routeRequested: false,
        previousCamera,
        startedAt: Date.now(),
      });

      // Encuadre inicial POR PUNTOS (sección 1.5): A y B visibles de inmediato;
      // la ruta vial llega después y re-encuadra con la geometría real.
      const map = mapRef.current;
      if (map && mapReady) {
        cancelFollowLoop();
        markInternalZoom();
        moveMapCamera(map, { heading: 0, tilt: 0 });
        if (pickup && destination) frameOfferPreview(map, pickup, destination, null);
      }

      // Ruta del preview: pickup → destino (NUNCA driver → pickup, sección 11).
      // Reutiliza getRoadRoute + su caché; jamás una segunda implementación.
      if (pickup && destination && mapReady) {
        setOfferPreview((prev) =>
          prev && prev.offerKey === key ? { ...prev, routeRequested: true } : prev
        );
        requestOfferPreviewRoute(pickup, destination, key, session);
      }
      return;
    }

    // ── Sin oferta → terminar preview (expiró o se rechazó) ──
    const ending = offerPreviewRef.current;
    if (!ending) return;
    if (offerRouteRequestRef.current) offerRouteRequestRef.current.canceled = true;
    offerPreviewRef.current = null;
    setOfferPreview(null);
    offerEndedAtRef.current = Date.now();
    // ACEPTAR (sección 4): no restaurar nada; el flujo normal de navegación
    // ("Encuadre general de un tramo NUEVO" + cámara drive) toma el control.
    // Se exige CONFIRMACIÓN del backend (el pedido vive ya en state.orders):
    // si el POST de aceptación falló, la expiración restaura la cámara normal.
    const acceptedConfirmed =
      acceptedOfferOrderRef.current === ending.orderNumber &&
      Boolean(state?.orders?.some((o) => o.orderNumber === ending.orderNumber));
    acceptedOfferOrderRef.current = null;
    if (acceptedConfirmed) return;
    // Restauración con gracia: si la oferta vivió muy poco, la cámara apenas
    // se movió; animar de vuelta es un salto innecesario (sección 13).
    if (Date.now() - ending.startedAt < OFFER_PREVIEW_RESTORATION_MIN_MS) return;
    restoreCameraAfterOffer(currentLocation, ending.previousCamera);
  }, [state, mapsLoaded, mapReady, currentLocation, followDriver, cancelFollowLoop, markInternalZoom, restoreCameraAfterOffer, requestOfferPreviewRoute]);

  // ── Controles de cámara ─────────────────────────────────────────

  // Enciende el MODO NAVEGACIÓN heading-up (mismo comportamiento que
  // "Centrar GPS"): posición adelantada (zona inferior), rumbo del viaje,
  // tilt de navegación, zoom de conducción y seguimiento activo. La transición
  // es SUAVE: el loop de seguimiento interpola centro/tilt/zoom desde la vista
  // actual. NUNCA encuadra todo el viaje ni recalcula routing.
  //
  // Al entrar en navegación, se intenta activar la brújula del dispositivo si
  // no está ya activa (iOS puede requerir permiso explícito). No se fuerza la
  // solicitud si el dispositivo no tiene sensores (no hay nada que pedir).
  const enterFollowCamera = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const withRoute = Boolean(
      navTarget && roadRoute?.path && roadRoute.path.length >= 2
    );
    const target = headingResolverRef.current ? headingResolverRef.current() : null;
    if (target != null) {
      // Heading-up (mismo bearing que el puck) + tilt.
      // Si hay ruta, usar el tween suave; si no, aplicar de una vez para
      // que el mapa se oriente inmediatamente aunque la ruta no esté lista.
      if (withRoute) {
        startHeadingTween(target);
      } else {
        // Sin ruta todavía: aplicar heading directamente para no dejar el
        // mapa sin orientar (norte arriba) mientras se busca la ruta.
        applyHeading(target);
        moveMapCamera(map, { heading: target, tilt: 0 });
      }
    } else {
      cancelFollowLoop();
      stopHeadingAnimation();
      visualHeadingRef.current = null;
      applyDriverMarkerIcon(driverMarkerRef.current, 0, null);
      moveMapCamera(map, { heading: 0, tilt: 0 });
    }
    lastFollowPosRef.current = currentLocation;
    // El marcador parte de la posición real y el loop lleva el CENTRO hasta
    // el anclaje (conductor abajo) con transición fluida.
    visualPosRef.current = currentLocation;
    driverMarkerRef.current?.setPosition(currentLocation);
    followTargetRef.current = currentLocation;
    if (withRoute) {
      ensureFollowLoop();
      // NO se fuerza el zoom aquí: el objetivo de zoom de navegación se
      // persigue de forma GRADUAL dentro del loop (transición animada, sin
      // salto brusco desde la vista de exploración del usuario).
      lastZoomRef.current = null;
    }
    setFollowDriver(true);
    // Intentar activar brújula si no está disponible todavía (sin bloquear).
    if (deviceOrientation.state.available !== "available") {
      deviceOrientation.enable().catch(() => {});
    }
  }, [
    currentLocation,
    roadRoute,
    navTarget,
    ensureFollowLoop,
    cancelFollowLoop,
    startHeadingTween,
    stopHeadingAnimation,
    applyHeading,
    deviceOrientation,
  ]);

  // "Centrar GPS" = regresar al modo navegación heading-up si el usuario
  // arrastró el mapa y salió de él: no solo recentra, restaura rumbo + tilt.
  const handleCenterGps = useCallback(() => {
    // Intención explícita del usuario: la restauración del preview no debe
    // pisar esta vista cuando la oferta termine.
    lastMapInteractionAtRef.current = Date.now();
    // Al centrar, también intentar activar brújula si no lo está (iOS puede
    // requerir permiso explícito; la hook se encarga de pedirlo cuando sea
    // necesario sin mostrar un prompt innecesario).
    if (deviceOrientation.state.available !== "available") {
      deviceOrientation.enable().catch(() => {});
    }
    enterFollowCamera();
  }, [enterFollowCamera, deviceOrientation]);

  // ── Reanudación AUTOMÁTICA del seguimiento al volver a conducir ──
  // El repartidor exploró el mapa (seguimiento inactivo); al retomar la
  // marcha se re-engancha la cámara suavemente, sin aviso textual: solo el
  // mapa vuelve a seguirlo. El control manual sigue disponible sobre el
  // panel de datos.
  const autoResumeRef = useRef(0);
  useEffect(() => {
    if (followDriver || offerPreviewActive) return;
    if (!driverHasLocation) return;
    // Velocidad actual (m/s): GPS suavizada o simulador.
    const speedMps = sim.active
      ? SIM_BASE_METERS_PER_SECOND * sim.speed
      : (movementSpeedRef.current ?? 0);
    if (speedMps < MOVING_SPEED_MPS) return;
    if (Date.now() - autoResumeRef.current < 5000) return;
    autoResumeRef.current = Date.now();
    enterFollowCamera();
  }, [
    currentLocation,
    followDriver,
    offerPreviewActive,
    driverHasLocation,
    sim.active,
    sim.speed,
    enterFollowCamera,
  ]);

  // ── Contenido de la barra de navegación (etapa actual) ──────────

  const navContent = useMemo(() => {
    if (!navPhase || !activeOrder) return null;

    const pickupLabel = activeOrder.mandadoOriginLabel ?? activeOrder.storeName;
    const deliveryLabel = activeOrder.mandadoDestinationLabel ?? activeOrder.destLabel;
    const hasLegMetrics = navPhase === "to_pickup" || navPhase === "to_delivery";
    const arriving = arrivingActive;
    // Distancia RESTANTE calculada desde currentLocation sobre la geometría
    // real; la zona superior ya no muestra etapa ni tiempo de etapa.
    const progress =
      hasLegMetrics && guidance ? guidance.fractionCompleted : null;
    const address =
      navPhase === "to_delivery" || navPhase === "at_delivery" || navPhase === "done"
        ? deliveryLabel
        : pickupLabel;
    const arrivalManeuver: string | null = arriving ? "arrive" : null;
    const maneuver = arrivalManeuver ?? guidance?.maneuver ?? null;
    // Chip "en X m" solo para maniobras reales (giro/glorieta/llegada), no
    // para tramos rectos ni instrucciones genéricas.
    const isTurnLike =
      maneuver != null &&
      !["straight", "depart", "unknown", "arrive"].includes(maneuver);
    const distToManeuver = guidance?.distanceToManeuver ?? null;
    const maneuverDistance =
      isTurnLike &&
      distToManeuver != null &&
      distToManeuver > 0 &&
      distToManeuver < 2000
        ? `en ${formatMetersShort(distToManeuver)}`
        : null;
    // La línea secundaria muestra la CALLE de la maniobra ("Av. Emiliano
    // Zapata") cuando existe. La dirección completa del destino vive SOLO en
    // el sheet (fila colapsada / detalles): ningún dato se repite en pantalla.
    const maneuverStreet =
      !arriving && isTurnLike && guidance?.street ? guidance.street : null;
    const sub = maneuverStreet;

    // Fase 4 — variante visual del panel: acción en el punto, llegada
    // inminente o maniobra. Cambiar de variante = transición de etapa
    // (evento raro, fuera del hot path rAF/heading).
    const variant: "maneuver" | "arriving" | "action" =
      navPhase === "at_pickup" || navPhase === "at_delivery" || navPhase === "done"
        ? "action"
        : arriving
          ? "arriving"
          : "maneuver";
    // Instrucción IMPERATIVA corta (la vialidad vive en `sub`); la instrucción
    // completa sigue disponible en el sheet expandido.
    const shortMain = guidance?.instruction
      ? shortInstructionInSpanish(guidance.instruction, guidance.maneuver)
      : null;
    // Distancia glanceable removida: ahora el panel la calcula directo de
    // guidance (ver prop glanceDistance del DriveTripSheet).

    // Zona superior = SOLO instrucciones giro por giro. La etapa del viaje
    // ("En ruta a recolección", tiempos de etapa, folio) NO se muestra sobre
    // el mapa: esos datos viven en el panel inferior.
    switch (navPhase) {
      case "to_pickup":
        return {
          main: arriving
            ? pickupLabel
            : shortMain ?? guidance?.instruction ?? "Dirígete a la recolección",
          sub,
          progress,
          maneuver,
          maneuverDistance,
          recalculating: isRecalculating,
          waiting: !guidance && sim.active,
          variant,
        };
      case "at_pickup":
        return {
          main: "Estás en el punto de recolección",
          sub: address,
          progress: null,
          maneuver: "arrive",
          maneuverDistance: null,
          recalculating: isRecalculating,
          waiting: false,
          variant: "action" as const,
        };
      case "to_delivery":
        return {
          main: arriving
            ? deliveryLabel
            : shortMain ?? guidance?.instruction ?? "Dirígete a la entrega",
          sub,
          progress,
          maneuver,
          maneuverDistance,
          recalculating: isRecalculating,
          waiting: !guidance && sim.active,
          variant,
        };
      case "at_delivery":
        return {
          main: "Estás en el destino",
          sub: address,
          progress: null,
          maneuver: "arrive",
          maneuverDistance: null,
          recalculating: isRecalculating,
          waiting: false,
          variant: "action" as const,
        };
      case "done":
        return {
          main: "✓ Viaje completado",
          sub: address,
          progress: null,
          maneuver: null,
          maneuverDistance: null,
          recalculating: isRecalculating,
          waiting: false,
          variant: "action" as const,
        };
      default:
        return null;
    }
  }, [navPhase, activeOrder, guidance, sim.active, isRecalculating, arrivingActive]);

  // ── Actions ──────────────────────────────────────────────────────

  const handleSession = useCallback(
    async (action: "connect" | "disconnect" | "stop_offers" | "resume_offers") => {
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

  // Cambia la intención de disponibilidad: aplica YA en la UI (tarjeta de fin
  // de ruta) y persiste en backend; el servicio activo nunca se altera.
  const commitOffersStopped = useCallback(
    (stopped: boolean) => {
      setStopOffersIntent(stopped);
      void handleSession(stopped ? "stop_offers" : "resume_offers").finally(() =>
        setStopOffersIntent(null)
      );
    },
    [handleSession]
  );

  const handleAction = useCallback(
    async (action: string, orderNumber: string) => {
      // Navigation actions encienden la cámara heading-up del mapa in-app.
      // La navegación ocurre dentro de /drive con Google Maps API; no se abre
      // aplicación externa (Google Maps / Apple Maps).
      if (action === "navigate_pickup" || action === "navigate_delivery") {
        enterFollowCamera();
        return;
      }

      // Backend actions
      setActionLoading(orderNumber);
      setStageActionError(null);
      try {
        const res = await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, orderNumber }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setStageActionError(data?.error ?? "No se pudo completar la acción.");
        }
        await refetch();
      } finally {
        setActionLoading(null);
      }
    },
    [enterFollowCamera, refetch]
  );

  /**
   * Acción de la etapa actual del pedido activo (recogí / entregué).
   * Devuelve true si la acción se confirmó (el deslizador lo usa para su
   * feedback de éxito/fallo). Al entregar, snapshot local para la pantalla
   * de finalización (la orden sale del backend en el refetch).
   */
  const postDriverAction = useCallback(
    async (action: string, orderNumber: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, orderNumber }),
        });
        if (res.ok) return { ok: true };
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, error: data?.error ?? "No se pudo completar la acción." };
      } catch {
        return { ok: false, error: "No se pudo completar la acción." };
      }
    },
    []
  );

  // ── Simulador: completar el pedido REAL (solo dev/staging) ────────
  // Al llegar a cada punto, el simulador ejecuta las MISMAS acciones de
  // servidor que el flujo real, para que el pedido quede realmente
  // completado (no es un estado de mentira del cliente):
  //
  //   mandado     at_pickup   → pickup_arrival + picked_up
  //               at_delivery → destination_arrival + delivered
  //   restaurante at_pickup   → (sin acción: la recolección es navegación)
  //               at_delivery → destination_arrival + delivered
  //
  // El plan NO se fija por la etapa simulada: se deriva del estado REAL del
  // pedido (ver simActionPlanFor) para no repetir pasos ya hechos (un mandado
  // ya recogido no vuelve a pedir pickup_arrival).
  //
  // Secuencial (cada acción espera a la anterior porque el servidor valida el
  // estado intermedio) y una sola vez por pedido+etapa. Si el servidor
  // rechaza (p. ej. la entrega requiere NIP), se muestra el error TAL CUAL y
  // se detiene: nunca se finge un éxito que el backend no confirmó.
  const simCommittedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!sim.active || !simCommitOrders || !activeOrder) return;
    const stage = sim.stage;
    if (stage !== "at_pickup" && stage !== "at_delivery") return;
    const plan = simActionPlanFor(activeOrder, stage);
    if (plan.length === 0) return;

    const orderNumber = activeOrder.orderNumber;
    const key = `${orderNumber}:${stage}`;
    if (simCommittedRef.current.has(key)) return;
    simCommittedRef.current.add(key);

    let cancelled = false;
    void (async () => {
      for (const action of plan) {
        const result = await postDriverAction(action, orderNumber);
        if (cancelled) return;
        if (!result.ok) {
          // El servidor rechazó la acción real (p. ej. entrega con NIP
          // expirado): se DETIENE la simulación y se muestra el error tal
          // cual. Dejar la simulación "completada" pintaría un éxito que el
          // backend nunca confirmó — el pedido seguiría pendiente.
          simRef.current.stop();
          setStageActionError(
            `Simulador · ${result.error ?? "no se pudo completar la acción."}`
          );
          return;
        }
      }
      if (plan[plan.length - 1] === "delivered") {
        // Snapshot ANTES del refetch: con la entrega confirmada la orden deja
        // de aparecer en /api/driver/state.
        setLastDelivered({ order: activeOrder, at: Date.now() });
      }
      await refetch();
    })();

    return () => {
      cancelled = true;
    };
  }, [sim.active, sim.stage, simCommitOrders, activeOrder, postDriverAction, refetch]);

  // Al detener la simulación se limpian las marcas de acciones ya ejecutadas:
  // un nuevo intento (tras resolver el bloqueo, p. ej. regenerar el NIP) vuelve
  // a ejecutar las acciones reales en lugar de saltárselas.
  useEffect(() => {
    if (!sim.active) simCommittedRef.current.clear();
  }, [sim.active]);

  // Con "Completar pedido real" encendido, llegar a "done" con el pedido AÚN
  // activo significa que la entrega real no se confirmó (p. ej. NIP rechazado):
  // se detiene la simulación para no dejar una pantalla de viaje "completado"
  // que el servidor nunca aprobó. Si la entrega sí se confirmó, la orden
  // desaparece y el simulador se detiene solo.
  useEffect(() => {
    if (sim.active && sim.stage === "done" && simCommitOrders) {
      simRef.current.stop();
    }
  }, [sim.active, sim.stage, simCommitOrders]);

  // Cerrar la confirmación de finalización y volver a la pantalla de espera (o
  // a la siguiente oferta) sin esperar los 60 s automáticos. Si el simulador
  // terminó su viaje, también se detiene: su estado "completado" no debe
  // quedarse pegado sobre el mapa.
  const dismissDonePanel = useCallback(() => {
    setLastDelivered(null);
    const current = simRef.current;
    if (current.active && current.stage === "done") current.stop();
  }, []);

  const handleStageAction = useCallback(async (): Promise<boolean> => {
    // Con "Completar pedido real" apagado el simulador solo muestra estados;
    // nunca muta el pedido real.
    if (sim.active && !simCommitOrders) {
      setStageActionError("Desactiva el simulador para confirmar la acción real.");
      return false;
    }
    if (!activeOrder || !orderAction) return false;
    const stageActions = new Set(["picked_up", "delivered"]);
    if (!stageActions.has(orderAction.action)) return false;

    setActionLoading(activeOrder.orderNumber);
    setStageActionError(null);
    try {
      let result = await postDriverAction(orderAction.action, activeOrder.orderNumber);
      // Auto-recuperación: si el deslizaje ganó la carrera a la geocerca y
      // la llegada aún no estaba marcada (guarda "Acción no válida en estado
      // …"), marca la llegada y reintenta UNA vez la confirmación. Las demás
      // guardas (NIP requerido, bloqueado, expirado) se respetan tal cual.
      if (
        !result.ok &&
        result.error?.includes("Acción no válida en estado")
      ) {
        const arriveAction =
          orderAction.action === "picked_up" ? "pickup_arrival" : "destination_arrival";
        const arrival = await postDriverAction(arriveAction, activeOrder.orderNumber);
        if (arrival.ok) {
          result = await postDriverAction(orderAction.action, activeOrder.orderNumber);
        }
      }
      if (!result.ok) {
        setStageActionError(result.error ?? "No se pudo completar la acción.");
        return false;
      }
      if (orderAction.action === "delivered") {
        // Snapshot ANTES del refetch: con la entrega confirmada la orden
        // deja de aparecer en /api/driver/state.
        setLastDelivered({ order: activeOrder, at: Date.now() });
      }
      await refetch();
      return true;
    } finally {
      setActionLoading(null);
    }
  }, [activeOrder, orderAction, postDriverAction, refetch, sim.active, simCommitOrders]);

  /**
   * Entrega con NIP (Entrega segura): valida server-side con el mismo gate
   * que WhatsApp webhook. Devuelve true si la entrega se confirmó.
   */
  const handlePinSubmit = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!activeOrder) return false;
      setStageActionError(null);
      if (sim.active && !simCommitOrders) {
        setStageActionError("Desactiva el simulador para confirmar la entrega real.");
        return false;
      }
      setActionLoading(activeOrder.orderNumber);
      try {
        const res = await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "delivered_with_pin",
            orderNumber: activeOrder.orderNumber,
            pin,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setStageActionError(data?.error ?? "No se pudo confirmar la entrega.");
          return false;
        }
        // Snapshot ANTES del refetch: con la entrega confirmada la orden deja
        // de aparecer en /api/driver/state. Sin esto, la entrega CON NIP
        // (mandados con Entrega segura) nunca mostraba el panel de
        // finalización ni la evaluación del cliente.
        setLastDelivered({ order: activeOrder, at: Date.now() });
        await refetch();
        return true;
      } catch {
        setStageActionError("No se pudo confirmar la entrega.");
        return false;
      } finally {
        setActionLoading(null);
      }
    },
    [activeOrder, refetch, sim.active, simCommitOrders]
  );

  /**
   * Cancela el pedido activo con el motivo elegido en la hoja de cancelación.
   * El motivo se valida y persiste server-side en la propia orden
   * (`order.cancellation`) + bitácora de eventos; al confirmarse, el refetch
   * retira el pedido de la lista del repartidor.
   */
  const handleCancelOrder = useCallback(
    async ({
      reason,
      note,
    }: {
      reason: string;
      note: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!activeOrder) return { ok: false, error: "No hay un pedido activo." };
      if (sim.active) {
        return { ok: false, error: "Desactiva el simulador para cancelar el pedido real." };
      }
      try {
        const res = await fetch("/api/driver/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "cancel_order",
            orderNumber: activeOrder.orderNumber,
            reason,
            note,
          }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          return { ok: false, error: data?.error ?? "No se pudo cancelar el pedido." };
        }
        await refetch();
        // El pedido ya no está asignado al repartidor: se cierra la Hoja de
        // ruta que quedaba detrás (la hoja de motivos se cierra sola con ok).
        setRouteSheetOpen(false);
        return { ok: true };
      } catch {
        return { ok: false, error: "No se pudo cancelar el pedido." };
      }
    },
    [activeOrder, refetch, sim.active]
  );

  const handleOffer = useCallback(
    async (action: "accept" | "reject", orderNumber: string) => {
      // Mark that user initiated an action → suppress expiration detection
      actionJustCompletedRef.current = true;
      if (action === "accept") {
        // ACEPTAR (sección 4): suprime la restauración de cámara cuando el
        // preview muera; la navegación normal toma el control.
        acceptedOfferOrderRef.current = orderNumber;
      }
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

  // ── Gate fail-closed de la oferta (all-or-nothing) ────────────────
  // La tarjeta se muestra SOLO si el servidor confirmó la presentación
  // (offerStatus "active" ⇒ deadline de 14 s ya fijado) y el deadline es un
  // timestamp parseable: así el temporizador mostrado SIEMPRE es el correcto.
  // Cualquier otro caso (pending_delivery, sin deadline, fecha corrupta) NO
  // renderiza nada: ni "Preparando…", ni spinner, ni un contador inventado.
  // Mientras el ACK viaja (~1 ciclo de polling) el repartidor ve el estado de
  // reposo, nunca un estado intermedio mentiroso.
  const offerRenderable =
    offer !== null &&
    offer.offerStatus === "active" &&
    typeof offer.offerExpiresAt === "string" &&
    offer.offerExpiresAt.length > 0 &&
    Number.isFinite(new Date(offer.offerExpiresAt).getTime());

  // ── TU RUTA: datos derivados (sin hooks) ──────────────────────────
  // Paradas de "Tu ruta": máx. 2. La actual (Recoger/Entregar, "Ahora") y,
  // solo si existe un siguiente servicio asignado, la futura ("Después").
  // Direcciones CORTAS: nunca el detalle completo ni producto ni importe.
  const currentStopIsPickup = navPhase === "to_pickup" || navPhase === "at_pickup";
  const nextServiceOrder = orders.length > 1 ? orders[1] : null;
  // Derivación SIN hook (los early returns ya pasaron: nada de useMemo aquí).
  const routeStops: RouteStop[] = [];
  if (activeOrder) {
    routeStops.push({
      kind: currentStopIsPickup ? "pickup" : "delivery",
      label: currentStopIsPickup ? "Recoger" : "Entregar",
      shortAddress: shortAddress(
        currentStopIsPickup
          ? activeOrder.storeAddress ??
              activeOrder.mandadoOriginLabel ??
              activeOrder.storeName
          : activeOrder.mandadoDestinationLabel ?? activeOrder.destLabel
      ),
      status: "Ahora",
    });
    if (nextServiceOrder) {
      routeStops.push({
        kind: "pickup",
        label: "Siguiente servicio",
        shortAddress: shortAddress(
          nextServiceOrder.mandadoOriginLabel ?? nextServiceOrder.storeName
        ),
        status: "Después",
      });
    }
  }

  // Vehículo EN MOVIMIENTO: ≥ 2 m/s (≈ 7 km/h) según velocidad GPS suavizada.
  // En movimiento se permite CONSULTAR "Tu ruta", pero no cambiar la
  // disponibilidad (seguridad al conducir).
  const vehicleMoving =
    !sim.active &&
    movementSpeedRef.current != null &&
    movementSpeedRef.current >= MOVING_SPEED_MPS;

  // Confirmación de finalización (unos segundos) o viaje activo.
  // IMPORTANTE: la pantalla "Entrega completada" del PROPIO simulador solo se
  // pinta cuando la simulación es solo-vista (toggle apagado). Con
  // "Completar pedido real" encendido, la única finalización legítima es la
  // que confirma el SERVIDOR (lastDelivered, tras `delivered` aceptado): si la
  // entrega real falla (p. ej. NIP expirado) NO se pinta un éxito falso.
  const donePanelVisible =
    Boolean(lastDelivered) || (sim.active && navPhase === "done" && !simCommitOrders);
  // SERVICIO ACTIVO manda: con orden activa la hoja de viaje SIEMPRE se
  // muestra, aunque la sesión de disponibilidad haya expirado. La UI nunca
  // asume "sin sesión → desconectado" si existe una orden activa.
  const showingTripSheet = !donePanelVisible && orders.length > 0;

  // ── Main UI ──────────────────────────────────────────────────────

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-[#0d1526]">
      {/* Panel de diagnóstico de sensores (debug, oculto en producción). */}
      {sensorDebugVisible && (
        <div className="absolute left-3 top-[calc(env(safe-area-inset-top)+5rem)] z-40 rounded-lg bg-black/70 px-3 py-2 text-[11px] leading-5 text-white/80 shadow-lg backdrop-blur-sm">
          <div className="font-semibold text-white/90">SENSORS</div>
          <div className="mt-0.5">
            <span className="text-white/60">Device heading:</span>
            <span className="font-mono text-white/90">
              {deviceOrientation.state.available === "unavailable"
                ? "N/A"
                : `${deviceOrientation.state.heading.toFixed(1)}°`}
            </span>
          </div>
          <div className="mt-0.5">
            <span className="text-white/60">GPS heading:</span>
            <span className="font-mono text-white/90">
              {gpsHeading != null ? `${gpsHeading.toFixed(1)}°` : "N/A"}
            </span>
          </div>
          <div className="mt-0.5">
            <span className="text-white/60">GPS speed:</span>
            <span className="font-mono text-white/90">
              {(movementSpeedRef.current != null
                ? `${(movementSpeedRef.current * 3.6).toFixed(1)}`
                : sim.active
                  ? `${(SIM_BASE_METERS_PER_SECOND * sim.speed * 3.6).toFixed(1)}`
                  : "0.0")} km/h
            </span>
          </div>
          <div className="mt-0.5">
            <span className="text-white/60">Heading source:</span>
            <span className="font-mono text-white/90">
              {deviceOrientation.state.available === "available" &&
              deviceOrientation.state.permission === "granted" &&
              (gpsHeading == null || movementSpeedRef.current == null || movementSpeedRef.current < 2)
                ? "device"
                : gpsHeading != null
                  ? "gps"
                  : movementHeadingRef.current != null
                    ? "motion"
                    : "geometry"}
            </span>
          </div>
          <div className="mt-0.5 flex gap-2">
            <span className="text-white/60">Sensor:</span>
            <span className="font-mono text-white/90">
              {deviceOrientation.state.available}
            </span>
            <span className="text-white/60">Perm:</span>
            <span className="font-mono text-white/90">
              {deviceOrientation.state.permission}
            </span>
          </div>
        </div>
      )}

      {/* Map — pantalla completa como fondo; los overlays flotan encima */}
      <div className="absolute inset-0">
        {mapsLoaded ? (
          <GoogleMap
            mapContainerStyle={containerStyle}
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            options={mapOptions}
            onLoad={handleMapLoad}
            onUnmount={handleMapUnmount}
            /* Marca el paneo para no confundirlo con un toque simple. */
            onDragEnd={() => {
              mapDraggedAtRef.current = Date.now();
            }}
            /* CIERRE DE "TU RUTA" AL TOCAR EL MAPA: el evento lo emite el
               propio mapa (sin capa invisible encima), así que después de
               cerrar los gestos de pan/zoom/tap funcionan con normalidad. */
            onClick={() => {
              if (Date.now() - mapDraggedAtRef.current < 300) return;
              // Primero cierra la capa superior (Hoja de ruta); si no está
              // abierta, colapsa el panel de pedido.
              if (routeSheetOpen) {
                setRouteSheetOpen(false);
                return;
              }
              if (tripSheetExpanded) setTripSheetCollapseToken((n) => n + 1);
            }}
          >
            {/* Driver marker: flecha de navegación que se rota según rumbo.
                La posición se controla imperativamente (setPosition) desde el
                loop de seguimiento suave para interpolar entre ticks de GPS y
                evitar la "teletransportación" del vehículo.

                La rotación del icono es RELATIVA AL MAPA (F1) y se aplica de
                forma IMPERATIVA con marker.setIcon() desde el loop rAF
                (applyDriverMarkerIcon), reutilizando iconos pre-generados por
                buckets de 10°. Aquí solo se fija el icono inicial (flecha
                arriba): ningún setState de heading en el hot path. */}
            <Marker
              position={initialDriverPosRef.current}
              onLoad={(marker) => {
                driverMarkerRef.current = marker;
                // Marcador nuevo: forzar la primera aplicación del icono.
                resetDriverMarkerIconBucket();
              }}
              onUnmount={() => {
                driverMarkerRef.current = null;
                resetDriverMarkerIconBucket();
              }}
              icon={getDriverIconBuckets()?.[0]}
            />

            {/* Store marker — pines pre-generados por variante (Fase 4);
                el swap standard→arriving es solo cambio de referencia en el
                evento de etapa (misma filosofía que los buckets de H1). */}
            {activeOrder &&
              (() => {
                const pins = getDestinationPinVariants();
                if (!pins) return null;
                const storeArriving = navPhase === "to_pickup" && arrivingActive;
                return (
                  <Marker
                    position={{ lat: activeOrder.storeLat, lng: activeOrder.storeLng }}
                    icon={storeArriving ? pins.store.arriving.icon : pins.store.standard.icon}
                    label={{
                      text: activeOrder.storeName,
                      className:
                        storeArriving ? pins.store.arriving.labelClass : pins.store.standard.labelClass,
                    }}
                  />
                );
              })()}

            {/* Destination marker */}
            {activeOrder &&
              (() => {
                const pins = getDestinationPinVariants();
                if (!pins) return null;
                const destArriving =
                  (navPhase === "to_delivery" && arrivingActive) ||
                  navPhase === "at_delivery";
                return (
                  <Marker
                    position={{ lat: activeOrder.destLat, lng: activeOrder.destLng }}
                    icon={destArriving ? pins.dest.arriving.icon : pins.dest.standard.icon}
                    label={{
                      text: "Entrega",
                      className:
                        destArriving ? pins.dest.arriving.labelClass : pins.dest.standard.labelClass,
                    }}
                  />
                );
              })()}

            {/* Route line: SOLO la geometría vial real de Google Directions.
                Nunca se dibuja una línea recta entre los dos puntos: si no
                hay ruta (API caída o todavía cargando), no se dibuja nada y
                el mapa sigue funcionando con los marcadores. */}
            {roadRoute?.path && (
              <Polyline
                path={roadRoute.path}
                options={{
                  strokeColor: ROUTE_BLUE,
                  strokeWeight: 4,
                  strokeOpacity: 0.7,
                  geodesic: true,
                }}
              />
            )}

            {/* OFFER_ROUTE_PREVIEW — capa temporal de la oferta: ruta vial
                A → B (pickup → destino, sección 11) + marcadores temporales.
                NUNCA es la ruta de navegación: vive solo mientras la oferta
                está en pantalla y se desmonta sola al terminar (secciones 3,
                5, 9, 16). */}
            {offerPreview?.route?.path && (
              <>
                <Polyline
                  path={offerPreview.route.path}
                  options={{
                    strokeColor: "#FFFFFF",
                    strokeWeight: 7,
                    strokeOpacity: 0.9,
                    geodesic: true,
                    zIndex: 1,
                  }}
                />
                <Polyline
                  path={offerPreview.route.path}
                  options={{
                    strokeColor: OFFER_PREVIEW_COLOR,
                    strokeWeight: 4,
                    strokeOpacity: 0.95,
                    geodesic: true,
                    zIndex: 2,
                  }}
                />
              </>
            )}
            {offerPreview?.pickup &&
              (() => {
                const pins = getDestinationPinVariants();
                if (!pins) return null;
                return (
                  <Marker
                    position={offerPreview.pickup}
                    icon={pins.store.standard.icon}
                    label={{
                      text: offerPreview.pickupLabel,
                      className: pins.store.standard.labelClass,
                    }}
                  />
                );
              })()}
            {offerPreview?.destination &&
              (() => {
                const pins = getDestinationPinVariants();
                if (!pins) return null;
                return (
                  <Marker
                    position={offerPreview.destination}
                    icon={pins.dest.standard.icon}
                    label={{
                      text: offerPreview.destinationLabel,
                      className: pins.dest.standard.labelClass,
                    }}
                  />
                );
              })()}
          </GoogleMap>
        ) : (
          <div className="flex h-full items-center justify-center bg-[#0d1526]">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        )}

        {/* Herramienta de desarrollo: simular viaje (solo dev/staging). */}
        {mapsLoaded && (
          <DriveSimPanel
              visible={DRIVE_SIM_ENABLED && connected && Boolean(activeOrder) && mapsLoaded}
              canStart={sim.canStart}
              active={sim.active}
              running={sim.running}
              finished={sim.finished}
              stageLabel={sim.stageLabel}
              speed={sim.speed}
              waitingForRoute={sim.waitingForRoute}
              routeDiagnostic={simRouteDiag}
              onStart={sim.start}
              onPause={sim.pause}
              onResume={sim.resume}
              onRestart={sim.restart}
              onStop={sim.stop}
              onSpeed={sim.setSpeed}
              onSkipPickup={sim.skipToPickup}
              onSkipDelivery={sim.skipToDelivery}
              onJumpNear={() => sim.jumpNearDestination(1000)}
              commitOrders={simCommitOrders}
              onToggleCommit={() => setSimCommitOrders((value) => !value)}
            />
          )}
      </div>        {/* Barra compacta + tarjeta de maniobra (turn-by-turn) — flotan sobre
          el mapa en la parte superior. La posición respeta el notch/isla
          dinámica con env(safe-area-inset-top). */}
      {/* En "done" NO hay barra superior: sin estado, folio ni etiqueta SIM.
          La confirmación limpia de finalización vive solo en el panel inferior. */}
      {navContent && navPhase && navPhase !== "done" && !navContent.variant.startsWith("action") && (
        <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30">
          <DriveNavBar
            mainText={navContent.main}
            subText={navContent.sub}
            progress={navContent.progress}
            maneuver={navContent.maneuver}
            maneuverDistance={navContent.maneuverDistance}
            recalculating={navContent.recalculating}
            waitingForRoute={navContent.waiting}
            variant={navContent.variant}
          />
        </div>
      )}

      {/* Overlay inferior ANCLADO AL VIEWPORT (fixed bottom-0): controles de
          cámara + hoja del pedido. Con viaje activo, el contenedor toma la
          altura COLAPSADA de la hoja para que los controles queden justo
          encima; la hoja expandida crece por encima sin despegarse nunca del
          borde inferior. */}
      <div
        className="fixed inset-x-0 bottom-0 z-30"
        style={
          showingTripSheet && tripSheetCollapsedHeight != null
            ? { height: tripSheetCollapsedHeight }
            : undefined
        }
      >
        {/* RECENTR — único control de cámara, ubicado sobre el panel de datos
            del viaje: discreto y accesible, NO bloquea la ruta ni las
            instrucciones. Aparece solo cuando el repartidor exploró el mapa
            (seguimiento inactivo); el seguimiento también se recupera solo al
            volver a conducir. */}
        {mapsLoaded && (
          <div className="absolute right-3 bottom-2 z-10">
            <AnimatePresence>
              {!followDriver && (
                <motion.button
                  key="recenter-btn"
                  initial={{ opacity: 0, scale: 0.9, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 8 }}
                  transition={{ duration: DRIVE_MOTION_DURATION.fast, ease: DRIVE_MOTION_EASE.enter }}
                  onClick={handleCenterGps}
                  aria-label="Centrar navegación"
                  title="Centrar navegación"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-[#09193B] shadow-lg ring-1 ring-black/10 transition hover:bg-gray-50 active:scale-95"
                >
                  <LocateFixed className="h-5 w-5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Confirmación de finalización (unos segundos) o viaje activo.
            En "done" el panel inferior muestra SOLO: icono verde +
            "Entrega completada" + resumen mínimo (folio una vez, secundario). */}
        {donePanelVisible ? (
          <div className="relative border-t border-black/[0.06] bg-white shadow-2xl safe-area-bottom">
            <div className="mx-auto mt-3 h-1 w-10 bg-gray-300" />
            <div className="px-4 pb-6 pt-3">
              <DriveOrderDetails
                order={lastDelivered?.order ?? (activeOrder as DriverOrder)}
                stage="done"
                loading={false}
                error={null}
                onPrimaryAction={async () => true}
                onPinSubmit={async () => false}
              />
              {/* Evaluación del cliente (solo con entrega REAL confirmada por
                  el servidor; la vista del simulador no evalúa). */}
              {lastDelivered && (
                <div className="mt-3">
                  <RatingSection
                    orderNumber={lastDelivered.order.orderNumber}
                    role="driver"
                    endpoint="/api/driver/rating"
                    onEngaged={() => setRatingEngaged(true)}
                  />
                </div>
              )}
              {/* Salida explícita: sin esto la tarjeta solo se iba sola a los
                  60 s o al llegar una oferta nueva. */}
              <button
                type="button"
                onClick={dismissDonePanel}
                className="mt-3 w-full border-2 border-gray-200 py-3.5 text-sm font-black uppercase tracking-wide text-[#09193B] transition active:bg-gray-50"
              >
                Listo, esperar otro viaje
              </button>
            </div>
          </div>
        ) : orders.length > 0 ? (
          (() => {
            const order = orders[0];
            return (
              <DriveTripSheet
                order={order}
                stage={navPhase}
                actionLoading={actionLoading === order.orderNumber}
                actionError={stageActionError}
                onStageAction={handleStageAction}
                onPinSubmit={handlePinSubmit}
                onOpenRoute={() => setRouteSheetOpen(true)}
                hidden={routeSheetOpen || cancelSheetOpen}
                collapseToken={tripSheetCollapseToken}
                arriving={arrivingActive}
                onCollapsedHeightChange={setTripSheetCollapsedHeight}
                onExpandedChange={setTripSheetExpanded}
                entityLabel={
                  navPhase === "to_pickup" || navPhase === "at_pickup"
                    ? order.mandadoOriginLabel ?? order.storeName
                    : order.customerName ?? order.mandadoDestinationLabel ?? order.destLabel
                }
                entityKind={
                  navPhase === "to_pickup" || navPhase === "at_pickup" ? "pickup" : "delivery"
                }
                glanceDistance={
                  (navPhase === "to_pickup" || navPhase === "to_delivery") && guidance
                    ? formatMetersShort(guidance.remaining)
                    : null
                }
              >
                {orders.slice(1).map((extra) => (
                  <OrderCard
                    key={extra.orderNumber}
                    order={extra}
                    loading={actionLoading === extra.orderNumber}
                    onAction={(action) => handleAction(action, extra.orderNumber)}
                  />
                ))}
              </DriveTripSheet>
            );
          })()
        ) : (
          <div className="relative border-t border-black/[0.06] bg-white shadow-2xl safe-area-bottom">
            <div className="mx-auto mt-3 h-1 w-10 bg-gray-300" />

            <div className="max-h-[50vh] overflow-y-auto px-4 pb-6 pt-2">
              {/* Not connected → Fuera de servicio (sesión abierta al iniciar) */}
              {!connected && (
                <div className="py-4 text-center">
                  {/* Solo UI/UX: acceso al Home del repartidor. */}
                  <button
                    onClick={() => setHomeOpen(true)}
                    className="mx-auto mb-3 flex h-10 items-center gap-2 border border-gray-200 px-4 text-sm font-bold text-[#09193B] transition active:bg-gray-50"
                  >
                    <HomeIcon className="h-4 w-4" />
                    Inicio
                  </button>
                  <h2 className="text-lg font-bold text-[#09193B]">
                    Fuera de servicio
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    No recibirás nuevos pedidos
                  </p>

                  <button
                    onClick={() => handleSession("connect")}
                    disabled={actionLoading === "session"}
                    className="mt-4 w-full bg-[#EB1902] py-4 text-lg font-black uppercase tracking-wide text-white transition hover:bg-[#850C22] active:scale-[0.99]"
                  >
                    {actionLoading === "session" ? (
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    ) : (
                      "COMENZAR A RECIBIR"
                    )}
                  </button>
                </div>
              )}

              {/* Connected → Offer. Gate fail-closed: solo se pinta con el
                  temporizador oficial (active + deadline válido); mientras la
                  oferta está en pending_delivery NO se muestra nada. */}
              {connected && offerRenderable && offer && (
                <OfferCard
                  offer={offer}
                  loading={!!actionLoading?.startsWith("offer-")}
                  onAccept={() => handleOffer("accept", offer.orderNumber)}
                  onReject={() => handleOffer("reject", offer.orderNumber)}
                />
              )}

              {/* Connected → No orders, no offer: estado claro arriba
                  (Disponible / Recibiendo pedidos) y UNA acción: dejar de
                  recibir pedidos (= terminar la sesión, sin orden activa). */}
              {connected && orders.length === 0 && !offerRenderable && (
                <div className="py-6 text-center">
                  {/* Solo UI/UX: acceso al Home del repartidor. */}
                  <button
                    onClick={() => setHomeOpen(true)}
                    className="mx-auto mb-3 flex h-10 items-center gap-2 border border-gray-200 px-4 text-sm font-bold text-[#09193B] transition active:bg-gray-50"
                  >
                    <HomeIcon className="h-4 w-4" />
                    Inicio
                  </button>
                  <div className="flex flex-col items-center gap-1">
                    <span className="flex items-center gap-2 text-base font-bold text-[#09193B]">
                      <span className="h-2 w-2 rounded-full bg-green-500" />
                      Disponible
                    </span>
                    <span className="text-sm text-gray-500">
                      Recibiendo pedidos
                    </span>
                  </div>
                  <div className="mt-3">
                    <SearchingStatusMessage />
                  </div>
                  <button
                    onClick={() => handleSession("stop_offers")}
                    disabled={actionLoading === "session"}
                    className="mt-5 rounded-xl border border-gray-200 px-6 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-50"
                  >
                    {actionLoading === "session" ? (
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    ) : (
                      "Dejar de recibir pedidos"
                    )}
                  </button>
                </div>
              )}

              {/* Connected → Dejar de recibir pedidos (cuando hay oferta).
                  Sin orden activa, la intención equivale a terminar la sesión:
                  el backend libera las ofertas vigentes y queda offline. */}
              {connected && offer && (
                <button
                  onClick={() => handleSession("stop_offers")}
                  disabled={actionLoading === "session"}
                  className="mt-3 w-full rounded-xl border border-gray-200 py-2 text-xs font-medium text-gray-400 transition hover:bg-gray-50"
                >
                  Dejar de recibir pedidos
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── HOJA DE RUTA (capa independiente sobre el panel de pedido) ────
          Se abre solo con "Ver ruta", cubre por completo el panel (nunca
          comparte superficie con "Recoge tu pedido") y termina tras su
          propio contenido. Cierra con "×", swipe down o toque en el mapa. */}
      <DriveRouteSheet
        open={routeSheetOpen}
        onClose={() => setRouteSheetOpen(false)}
        stops={routeStops}
        stopped={stopOffersIntent ?? state?.aceptaNuevasOfertas === false}
        onStopOffers={() => {
          // Agrega la tarjeta de fin de ruta al instante (sin confirmación).
          commitOffersStopped(true);
          showUndoToast("Dejarás de recibir pedidos al terminar", () =>
            commitOffersStopped(false)
          );
        }}
        onResumeOffers={() => {
          // La "×" elimina la tarjeta de inmediato y deja disponible.
          commitOffersStopped(false);
          showUndoToast("Seguirás recibiendo pedidos", () => commitOffersStopped(true));
        }}
        moving={vehicleMoving}
        coverHeight={tripSheetCollapsedHeight}
        onRequestCancel={() => setCancelSheetOpen(true)}
      />

      {/* ── HOJA DE CANCELACIÓN (segundo nivel del menú ⋮ de "Tu ruta") ──
          Capa independiente por encima de la Hoja de ruta: registra el motivo
          elegido en la orden (order.cancellation) y refresca el estado al
          confirmar. */}
      {/* ── HOME DEL REPARTIDOR (solo UI/UX) ─────────────────────────
          Capa a pantalla completa con acceso de regreso al mapa/conexión y
          las secciones Notificaciones y Wallet (placeholders, sin función).
          Se abre con el botón "Inicio" del panel inferior. */}
      <DriveHome
        open={homeOpen}
        onClose={() => setHomeOpen(false)}
        connected={connected}
        onConnect={() => handleSession("connect")}
        connecting={actionLoading === "session"}
      />

      <DriveCancelOrderSheet
        open={cancelSheetOpen}
        onClose={() => setCancelSheetOpen(false)}
        orderNumber={orders[0]?.orderNumber ?? null}
        onConfirm={handleCancelOrder}
        coverHeight={tripSheetCollapsedHeight}
      />

      {/* ── HOJA DE CANCELACIÓN (segundo nivel del menú ⋮) ───────────────
          Capa independiente, igual que "Tu ruta": el panel de pedido queda
          cubierto mientras está abierta. Registra el motivo elegido en la
          orden (order.cancellation) y refresca el estado al confirmar. */}
      <DriveCancelOrderSheet
        open={cancelSheetOpen}
        onClose={() => setCancelSheetOpen(false)}
        orderNumber={orders[0]?.orderNumber ?? null}
        onConfirm={handleCancelOrder}
        coverHeight={tripSheetCollapsedHeight}
      />

      {/* Toast temporal con Deshacer (resultado de la elección). */}
      <AnimatePresence>
        {routeToast && (
          <motion.div
            key="route-toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className="fixed left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 bg-gray-950/95 px-4 py-2.5 text-sm font-bold text-white shadow-xl ring-1 ring-white/10 backdrop-blur"
            style={{ bottom: (tripSheetCollapsedHeight ?? 88) + 12 }}
            role="status"
          >
            <span>{routeToast.message}</span>
            <button
              onClick={() => {
                clearRouteToastTimer();
                routeToast.undo();
                setRouteToast(null);
              }}
              className="text-[#ff8a75] underline underline-offset-2"
            >
              Deshacer
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Searching status message ───────────────────────────────────────

// Frase de estado única del panel inferior. Rota cada pocos segundos con
// fade-out + fade-in (crossfade percibido) sin mover el layout, y respeta
// `prefers-reduced-motion` cambiando el texto sin animación.
const SEARCHING_MESSAGES = [
  "Estamos buscando pedidos cerca de ti",
  "Te avisaremos cuando haya un pedido disponible",
  "Mantente atento a nuevas solicitudes",
  "Buscando oportunidades en tu zona",
] as const;

const SEARCHING_MESSAGE_INTERVAL_MS = 4000;
const SEARCHING_MESSAGE_FADE_MS = 220;

function SearchingStatusMessage() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const interval = window.setInterval(() => {
      if (reducedMotionRef.current) {
        setIndex((i) => (i + 1) % SEARCHING_MESSAGES.length);
        return;
      }
      setVisible(false);
    }, SEARCHING_MESSAGE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (visible) return;
    const timer = window.setTimeout(() => {
      setIndex((i) => (i + 1) % SEARCHING_MESSAGES.length);
      setVisible(true);
    }, SEARCHING_MESSAGE_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  return (
    <div className="flex min-h-14 items-center justify-center px-2">
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={`text-base font-semibold leading-snug text-[#09193B] transition-opacity motion-reduce:transition-none ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        style={{ transitionDuration: `${SEARCHING_MESSAGE_FADE_MS}ms` }}
      >
        {SEARCHING_MESSAGES[index]}
      </p>
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
  // El contador se ancla a un deadline ABSOLUTO derivado del servidor
  // (`offerExpiresAt`) y se convierte al reloj del teléfono UNA sola vez por
  // oferta (offerId + expiresAt). Mientras el polling reciba la MISMA oferta,
  // el deadline no cambia y el temporizador continúa: nunca se reinicia a 15 s
  // por una respuesta nueva.
  //
  // Gate fail-closed (ver offerRenderable en la página): esta tarjeta SOLO se
  // monta con offerStatus "active" y deadline válido — el estado intermedio
  // "Preparando…" (pending_delivery) ya no existe en la UI.
  const offerKey = `${offer.offerId ?? offer.orderNumber}|${offer.offerExpiresAt}`;
  const deadlineRef = useRef<{ key: string; at: number } | null>(null);

  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!offer.offerExpiresAt) {
      deadlineRef.current = null;
      setTimeLeft(0);
      return;
    }
    const expiresMs = new Date(offer.offerExpiresAt).getTime();
    if (!Number.isFinite(expiresMs)) {
      setTimeLeft(0);
      return;
    }
    // Ancla única: traduce el deadline del servidor al reloj del cliente con el
    // desfase medido en la PRIMERA observación de esta oferta.
    if (!deadlineRef.current || deadlineRef.current.key !== offerKey) {
      const serverNowMs = offer.serverNow ? new Date(offer.serverNow).getTime() : Date.now();
      const skewMs = Number.isFinite(serverNowMs) ? serverNowMs - Date.now() : 0;
      deadlineRef.current = { key: offerKey, at: expiresMs - skewMs };
    }
    const deadlineAt = deadlineRef.current.at;
    const update = () => setTimeLeft(Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
    // Depende del deadline derivado (offerId + expiresAt), nunca del `serverNow`
    // que cambia en cada polling: el tick no se reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerKey]);

  const timeLabel =
    timeLeft >= 60
      ? `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, "0")}`
      : `${timeLeft}s`;
  const urgent = timeLeft <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      className="border border-[#09193B]/15 bg-white"
    >
      {/* CABECERA: título + cuenta regresiva secundaria + X (rechazar) */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-amber-50 px-4 py-2.5">
        <span className="text-xs font-black uppercase tracking-widest text-amber-600">
          Nueva oferta
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-black tabular-nums ${
              urgent ? "text-red-500" : "text-amber-600"
            }`}
          >
            {timeLabel}
          </span>
          <button
            onClick={onReject}
            disabled={loading}
            aria-label="Rechazar oferta"
            title="Rechazar oferta"
            className="flex h-7 w-7 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 active:scale-90 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* CUERPO: folio → punto de inicio → métricas del viaje */}
      <div className="px-4 pb-4 pt-3">
        <p className="text-lg font-black text-[#09193B]">
          #{shortOrderCode(offer.orderNumber)}
        </p>

        <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
          Punto de inicio
        </p>
        <p className="mt-0.5 flex items-start gap-1.5 text-sm font-semibold text-[#09193B]">
          <Store className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span className="leading-snug">
            {offer.mandadoOriginLabel ?? offer.storeName}
          </span>
        </p>
        {offer.destLabel && (
          <p className="mt-0.5 text-xs text-gray-400">{offer.destLabel}</p>
        )}

        <div className="mt-3 flex items-center gap-4 border-y border-gray-100 py-2 text-sm">
          {offer.routeKm != null && (
            <span className="font-black tabular-nums text-[#09193B]">
              {offer.routeKm} km
            </span>
          )}
          {offer.etaMinutes != null && (
            <span className="font-black tabular-nums text-[#09193B]">
              {offer.etaMinutes} min
            </span>
          )}
          <span className="text-gray-500">{offer.paymentLabel}</span>
          {offer.totalPrice > 0 && (
            <span className="ml-auto font-black tabular-nums text-[#09193B]">
              ${offer.totalPrice.toFixed(2)}
            </span>
          )}
        </div>

        {/* ÚNICA acción primaria: ACEPTAR (color principal de ElMenu) */}
        <button
          onClick={onAccept}
          disabled={loading}
          className="mt-3 flex w-full items-center justify-center bg-[#EB1902] py-3.5 text-sm font-black uppercase tracking-wide text-white transition hover:bg-[#850C22] active:scale-[0.99] disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Aceptar"
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
    <div className="mt-3 border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-bold text-[#09193B]">
          #{shortOrderCode(order.orderNumber)}
        </p>
        <span className="bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">
          {order.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
        </span>
      </div>

      <div className="mt-2 space-y-1">
        {/* Recolección (etapa actual mientras el pedido no se ha recogido) */}
        <div
          className={`border-l-4 px-3 py-2 ${
            action === "navigate_pickup"
              ? "border-l-orange-400 bg-orange-50"
              : "border-l-gray-200 bg-gray-50"
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
          className={`border-l-4 px-3 py-2 ${
            action === "navigate_delivery"
              ? "border-l-red-400 bg-red-50"
              : action === "navigate_pickup"
                ? "border-l-gray-200 bg-gray-50 opacity-70"
                : "border-l-gray-200 bg-gray-50"
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
        <p className="mt-2 bg-gray-50 px-3 py-2 text-xs text-gray-500 line-clamp-2">
          📝 {order.mandadoDetails}
        </p>
      )}

      <button
        onClick={() => onAction(action)}
        disabled={loading}
        className="mt-3 flex w-full items-center justify-center gap-2 bg-[#09193B] py-3 text-sm font-black text-white transition hover:bg-[#0d2347] active:scale-[0.99] disabled:opacity-50"
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
