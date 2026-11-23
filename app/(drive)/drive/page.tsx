"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth, SignIn } from "@clerk/nextjs";
import type {
  Map as MapboxMapInstance,
  Marker as MapboxMarker,
  StyleSpecification,
} from "mapbox-gl";
import {
  MapboxMap,
  type MapboxMapHandle,
  type MapboxMapLine,
  type MapboxMapMarker,
} from "@/components/map/MapboxMap";
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
import { RatingSection } from "@/components/ratings/RatingSection";
import {
  destinationPinHtml,
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
import { useWakeLock } from "@/hooks/useWakeLock";
import { useDeviceOrientation } from "@/hooks/useDeviceOrientation";
import {
  TraceRecorder,
  nearestPointOnPath,
  nearestPointOnPathByProgress,
} from "@/lib/drive/trace-recorder";
import { stageActionFor } from "@/lib/drive/stage-action";
import { createRouteDirectionTracker } from "@/lib/drive/route-direction";
import {
  applyGpsFix,
  courseAgeMs,
  effectiveCourseHeading,
  effectiveMovementSpeedMps,
  effectiveSpeedMps,
  hasValidSpeed,
  initialSpeedHeadingState,
} from "@/lib/drive/speed-heading";
import {
  anchorYForBand,
  AUTO_REENTER_MS,
  applyCameraCommand,
  computeAnchorPadding,
  computeAnchorPaddingForBand,
  PUCK_ANCHOR_FRACTION,
  shouldExitFollowOnMapEvent,
  type AnchorPadding,
  type CameraSink,
} from "@/lib/drive/camera-controller";
import {
  computeFollowFrame,
  metersPerPixelAt,
  NAV_HEADING_SKIP_DEG,
  NAV_ZOOM_BASE,
} from "@/lib/drive/follow-frame";
import { useOfferAlertSound } from "@/hooks/useOfferAlertSound";
import { shortOrderCode, shortAddress } from "@/lib/dispatch/dispatch-format";
import {
  bearingBetween,
  distanceToPathMeters,
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
  DRIVE_MAP_STYLE_URL,
  OFFER_PREVIEW_COLOR,
  ROUTE_BLUE,
  loadDriveMapStyle,
} from "@/lib/drive/map-styles";
import { createDriveHeadingResolver } from "@/lib/drive/heading-resolver";
import {
  computeGuidance,
  nextGuidanceState,
  type GuidanceState,
} from "@/lib/drive/guidance";

// ── Map config ─────────────────────────────────────────────────────

// El estilo del mapa vive en lib/drive/map-styles.ts (estilo de Mapbox, con
// rotación heading-up y tilt nativos: no hace falta Map ID ni mapa vectorial).
const DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };

/**
 * Marcas de arranque (Fase 4-C): se exportan en la traza como medidas de
 * `performance`. No cambian lógica; sirven para saber qué ocupa el primer
 * segundo (montaje, estilo de Mapbox, ruta, primer render, primer fix bueno).
 */
function markDrive(name: string): void {
  if (typeof performance === "undefined" || typeof performance.mark !== "function") return;
  try {
    performance.mark(`drive:${name}`);
  } catch {
    /* performance no disponible */
  }
}
function measureDrive(name: string, start: string, end: string): void {
  if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
  try {
    performance.measure(`drive:${name}`, `drive:${start}`, `drive:${end}`);
  } catch {
    /* faltan marcas */
  }
}

// ── Camera (navegación tipo GPS) ───────────────────────────────────
// Aire alrededor del trayecto al encuadrar (fracción del tamaño del encuadre).
const CAMERA_PADDING = 0.15;
// Sin ruta activa, recentrar al repartidor solo si se movió al menos esto.
const DRIVER_CENTER_METERS = 20;
// Zoom por defecto del mapa (sin navegación).
const DEFAULT_ZOOM = 15;
// Anclaje visual del conductor en pantalla al encuadrar sin navegación
// (fracción desde arriba; el anclaje de navegación 70–75 % vive en
// lib/drive/camera-controller.ts → PUCK_ANCHOR_FRACTION).
const NAV_DRIVER_SCREEN_FRACTION = 0.72;
// Suavizado de rotación del heading tween (fuera del loop): interpolación
// por el ángulo más corto hacia el rumbo objetivo.
const NAV_HEADING_SMOOTH = 0.16;
// NOTA: la geometría/zoom/umbrales del loop de cámara y la derivación de
// rumbo-velocidad viven en módulos puros testeados en Node:
// lib/drive/follow-frame.ts (zoom, adelanto, suavizados, anclaje) y
// lib/drive/speed-heading.ts (velocidad/curso). Un solo origen de verdad:
// aquí solo se importan NAV_ZOOM_BASE y NAV_HEADING_SKIP_DEG.

// Desvío: distancia lateral a la geometría y ticks consecutivos antes de
// recalcular la ruta (anti-jitter del GPS).
const OFF_ROUTE_METERS = 60;
const OFF_ROUTE_CHECKS = 4;
// Persistencia temporal mínima del desvío antes de recalcular (ms).
const OFF_ROUTE_MIN_MS = 3_000;
// Fixes con peor precisión que esto no cuentan como evidencia de desvío.
const OFF_ROUTE_MAX_ACCURACY_M = 60;
// Ventana para ignorar zoom_changed generado por la propia cámara.
const INTERNAL_ZOOM_GUARD_MS = 900;
// Anticipar la siguiente maniobra cuando falte menos que esto para el giro.
const NEXT_MANEUVER_METERS = 120;
// Tras recorrerse este desplazamiento real sobre la ruta, la instrucción
// inicial ("depart" / "Comienza tu viaje") deja paso a la primera maniobra.
const DEPART_ADVANCE_METERS = 40;
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
const OFFER_PREVIEW_CAMERA_MARGIN = { top: 72, right: 64, bottom: 320, left: 64 } as const;
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
const ICON_BUCKET_DEG = 10;
const ICON_BUCKET_COUNT = 360 / ICON_BUCKET_DEG;

// El HTML del marcador se construye UNA vez (flecha apuntando arriba): la
// rotación ya no requiere un icono por ángulo porque el propio marcador de
// Mapbox gira con marker.setRotation().
const DRIVER_MARKER_ID = "drive-driver-marker";
const DRIVER_MARKER_HTML = `<img src="${driverArrowIcon(0)}" width="${ICON_SIZE_PX}" height="${ICON_SIZE_PX}" alt="" style="display:block" />`;
let lastDriverIconBucket: number | null = null;

/**
 * Aplica la rotación del marcador del conductor de forma IMPERATIVA.
 * Igual que el render anterior (driverArrowIconRelativeToMap): la rotación
 * del icono es relativa al mapa; sin heading de mapa (exploración), absoluta.
 * No-op si el ángulo sigue en el mismo bucket de 10° (no toca el marcador).
 */
function applyDriverMarkerIcon(
  marker: MapboxMarker | null,
  driverHeadingDeg: number,
  mapHeadingDeg: number | null
): void {
  if (!marker) return;
  const relative =
    mapHeadingDeg == null
      ? normalizeDeg(driverHeadingDeg)
      : shortestAngleDelta(driverHeadingDeg, mapHeadingDeg);
  const bucket =
    Math.round(normalizeDeg(relative) / ICON_BUCKET_DEG) % ICON_BUCKET_COUNT;
  if (bucket === lastDriverIconBucket) return;
  lastDriverIconBucket = bucket;
  // Mapbox gira en sentido antihorario; el rumbo se mide en sentido horario.
  marker.setRotation(-(bucket * ICON_BUCKET_DEG));
}

/** Mueve el marcador del conductor sin re-renderizar (hot path del rAF). */
function setDriverMarkerPosition(marker: MapboxMarker | null, position: RoutePoint): void {
  marker?.setLngLat([position.lng, position.lat]);
}

/** Marca el bucket como desconocido (remount del marcador / reset). */
function resetDriverMarkerIconBucket(): void {
  lastDriverIconBucket = null;
}

/**
 * Fase 6-A1: distancia del centro del puck a la PUNTA de la flecha, en px.
 * El SVG mide 44 px con la flecha de (0,-8.5) en su viewBox centrado; se
 * dibuja a 44 px, así que 8.5 px de viewBox = 8.5 px de pantalla.
 */
const ARROW_TIP_PX = 8.5;

/**
 * Punta de la flecha en px del contenedor, con la MISMA cuantización de 10°
 * que `applyDriverMarkerIcon` aplica al marcador: la medición corresponde a
 * lo que está pintado, no a un rumbo ideal.
 */
function driverArrowTipPx(
  puckPx: { x: number; y: number },
  driverHeadingDeg: number | null,
  mapBearingDeg: number | null
): { x: number; y: number } | null {
  if (driverHeadingDeg == null || !Number.isFinite(driverHeadingDeg)) return null;
  const relative =
    mapBearingDeg == null
      ? normalizeDeg(driverHeadingDeg)
      : shortestAngleDelta(driverHeadingDeg, mapBearingDeg);
  const bucket =
    Math.round(normalizeDeg(relative) / ICON_BUCKET_DEG) % ICON_BUCKET_COUNT;
  const theta = (bucket * ICON_BUCKET_DEG) * (Math.PI / 180);
  return {
    x: puckPx.x + ARROW_TIP_PX * Math.sin(theta),
    y: puckPx.y - ARROW_TIP_PX * Math.cos(theta),
  };
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
function getMapViewport(map: MapboxMapInstance): {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
} | null {
  const bounds = map.getBounds();
  if (!bounds) return null;
  return {
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLng: bounds.getWest(),
    maxLng: bounds.getEast(),
  };
}

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Diferencia dirigida y mínima entre dos ángulos: 350° → 5° = +15°. */
function shortestAngleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

/**
 * Distancia numérica (m) de la etiqueta renderizada «en 350 m» / «en 1.2 km».
 * Fase 3-D: sirve para contrastar lo MOSTRADO con la distancia real a la
 * maniobra en la traza.
 */
function parseDistanceLabelMeters(label: string | null): number | null {
  if (!label) return null;
  const match = label.match(/([\d.]+)\s*(km|m)\b/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(match[2].toLowerCase() === "km" ? value * 1000 : value);
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
function aheadCameraPoint(map: MapboxMapInstance, driver: RoutePoint, headingDeg: number): RoutePoint {
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

type DriveCamera = {
  center?: { lat: number; lng: number };
  heading?: number | null;
  tilt?: number | null;
  zoom?: number;
  /** Anclaje por `padding` (jumpTo ignora `offset` en mapbox-gl 3.33). */
  padding?: AnchorPadding;
};

/** Último padding aplicado al mapa (para reaplicarlo si cambia el layout). */
let lastAppliedPadding: AnchorPadding | null = null;

/**
 * Aplica la cámara en UNA llamada (center/bearing/pitch/zoom/padding a la
 * vez): evita los saltos y la doble animación de mover cada propiedad por
 * separado. Acepta cámara PARCIAL (solo zoom, solo heading, ...).
 */
function moveMapCamera(map: MapboxMapInstance, camera: DriveCamera): void {
  const center = camera.center ? [camera.center.lng, camera.center.lat] as [number, number] : null;
  const bearing = camera.heading != null ? normalizeDeg(camera.heading) : null;
  const pitch = camera.tilt != null ? camera.tilt : null;
  const zoom = typeof camera.zoom === "number" ? camera.zoom : null;

  let changed = false;
  // El padding de anclaje también cuenta como cambio: si solo cambió la
  // geometría de la pantalla (hoja expandida, rotación), el frame debe
  // reaplicarlo aunque center/bearing/zoom no cambien.
  if (camera.padding) {
    const p = camera.padding;
    if (
      lastAppliedPadding == null ||
      lastAppliedPadding.top !== p.top ||
      lastAppliedPadding.bottom !== p.bottom
    ) {
      changed = true;
    }
  }
  if (center) {
    const current = map.getCenter();
    changed ||= haversineMeters(
      { lat: current.lat, lng: current.lng },
      { lat: center[1], lng: center[0] }
    ) > 0.35;
  }
  if (bearing != null) {
    const delta = Math.abs(shortestAngleDelta(bearing, map.getBearing()));
    changed ||= delta > 0.12;
  }
  if (pitch != null) {
    changed ||= Math.abs(pitch - map.getPitch()) > 0.1;
  }
  if (zoom != null) {
    changed ||= Math.abs(zoom - map.getZoom()) > 0.01;
  }
  if (!changed) return;

  if (camera.padding) lastAppliedPadding = camera.padding;
  map.jumpTo({
    ...(center ? { center } : {}),
    ...(bearing != null ? { bearing } : {}),
    ...(pitch != null ? { pitch } : {}),
    ...(zoom != null ? { zoom } : {}),
    // `padding`, NO `offset`: jumpTo ignora offset (mapbox-gl 3.33).
    ...(camera.padding ? { padding: camera.padding } : {}),
  });
}

// Caché del offset: se lee del DOM (clientHeight + getBoundingClientRect) en
// cada actualización de cámara (30/s) — cachearlo evita lecturas de layout
// forzadas por frame. Se recalcula cuando cambian las alturas implicadas
// (hoja inferior desplegada/colapsada, rotación del dispositivo, resize).
// Fase 1-E: el anclaje debe ser el 70–75 % del ÁREA VISIBLE (entre la barra
// superior y el panel inferior) en TODOS los modos, y recalcularse cuando
// cambian las alturas (hoja expandida/colapsada, rotación, teclado, barra de
// Safari). Un contador de época invalidado por ResizeObserver/visualViewport
// evita leer layout en cada frame (30/s) sin quedarse con valores viejos.
let driveLayoutEpoch = 0;
function notifyDriveLayoutChanged(): void {
  driveLayoutEpoch += 1;
}

let cachedBand: {
  epoch: number;
  container: number;
  containerHeight: number;
  top: number;
  bottom: number;
  /** Y del ancla (px desde el borde superior del contenedor). */
  anchorY: number;
  /** Padding de anclaje derivado (jumpTo/easeTo). */
  padding: AnchorPadding;
} = {
  epoch: -1,
  container: 0,
  containerHeight: 0,
  top: 0,
  bottom: 0,
  anchorY: 0,
  padding: { top: 0, bottom: 0 },
};

/**
 * Banda visible (px) del mapa —entre barra superior y panel inferior— y su
 * ancla al 72.5 % del área visible. Cacheado por época: leer rects en cada
 * frame de cámara (30/s) forzaba layout.
 */
function readDriveVisibleBand(map: MapboxMapInstance): {
  containerHeight: number;
  top: number;
  bottom: number;
  anchorY: number;
  padding: AnchorPadding;
} {
  const containerHeight =
    map.getContainer()?.clientHeight || window.innerHeight || 0;
  if (
    cachedBand.epoch !== driveLayoutEpoch ||
    cachedBand.container !== containerHeight
  ) {
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const bottomRect = document
      .getElementById("drive-bottom-overlay")
      ?.getBoundingClientRect();
    const topRect = document
      .getElementById("drive-top-overlay")
      ?.getBoundingClientRect();
    const visibleTop = topRect ? Math.min(containerHeight, Math.max(0, topRect.bottom)) : 0;
    const visibleBottom = bottomRect
      ? Math.min(containerHeight, Math.max(visibleTop, bottomRect.top))
      : Math.min(containerHeight, viewportHeight);
    cachedBand = {
      epoch: driveLayoutEpoch,
      container: containerHeight,
      containerHeight,
      top: visibleTop,
      bottom: visibleBottom,
      anchorY: anchorYForBand(visibleTop, visibleBottom, PUCK_ANCHOR_FRACTION),
      padding: computeAnchorPaddingForBand(
        containerHeight,
        visibleTop,
        visibleBottom,
        PUCK_ANCHOR_FRACTION
      ),
    };
  }
  return cachedBand;
}

/** Padding de anclaje vigente (70–75 % del área visible). */
function getDriveAnchorPadding(map: MapboxMapInstance): AnchorPadding {
  return readDriveVisibleBand(map).padding;
}

/**
 * SINK ÚNICO de cámara (Fase 1-B/G): adapta el contrato del controlador al
 * mapa real. Todo movimiento de cámara del seguimiento pasa por aquí y por
 * `applyCameraCommand`; `stop()` garantiza una sola animación a la vez.
 */
function createDriveCameraSink(map: MapboxMapInstance): CameraSink {
  return {
    jumpTo: (cmd) => {
      moveMapCamera(map, {
        ...(cmd.center ? { center: cmd.center } : {}),
        ...(cmd.heading != null ? { heading: cmd.heading } : {}),
        ...(cmd.padding ? { padding: cmd.padding } : {}),
        ...(cmd.zoom != null ? { zoom: cmd.zoom } : {}),
        ...(cmd.pitch != null ? { tilt: cmd.pitch } : {}),
      });
    },
    easeTo: (cmd) => {
      if (cmd.center) {
        map.easeTo({
          center: [cmd.center.lng, cmd.center.lat],
          ...(cmd.heading != null ? { bearing: cmd.heading } : {}),
          ...(cmd.zoom != null ? { zoom: cmd.zoom } : {}),
          ...(cmd.pitch != null ? { pitch: cmd.pitch } : {}),
          ...(cmd.padding ? { padding: cmd.padding } : {}),
          duration: 450,
          essential: true,
        });
      }
    },
    stop: () => map.stop(),
  };
}

/**
 * OFFER_ROUTE_PREVIEW — captura el estado de cámara ACTUAL para poder
 * restaurarlo cuando la oferta termine sin aceptación (sección 6). Si la
 * cámara aún no es legible (mapa recién montado) devuelve null y la
 * restauración cae al fallback: ubicación ACTUAL del repartidor + zoom drive.
 */
function captureOfferPreviewCamera(
  map: MapboxMapInstance,
  followDriver: boolean
): OfferPreviewCameraState | null {
  const center = map.getCenter();
  const zoom = map.getZoom();
  if (!center || typeof zoom !== "number") return null;
  return {
    center: { lat: center.lat, lng: center.lng },
    zoom,
    heading: map.getBearing(),
    tilt: map.getPitch(),
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
  map: MapboxMapInstance,
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
    [
      [minLng - lngPad, minLat - latPad],
      [maxLng + lngPad, maxLat + latPad],
    ],
    {
      padding: OFFER_PREVIEW_CAMERA_MARGIN,
      maxZoom: OFFER_PREVIEW_CAMERA_MAX_ZOOM,
      bearing: 0,
      pitch: 0,
      duration: 0,
    }
  );
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
  const mountMarkedRef = useRef(false);
  if (!mountMarkedRef.current) {
    mountMarkedRef.current = true;
    markDrive("mount");
  }

  // El sondeo solo arranca cuando Clerk confirma la sesión: sin sesión no se
  // llama /api/driver/state (evita los 401 repetidos en la subdominio Drive).
  // Grabador de trazas reales (Fase 0 — SOLO staging, ausente en
  // producción): buffer en memoria + muestreo de cámara a 5 Hz + export JSON
  // desde el panel de diagnóstico. No altera la navegación.
  const TRACE_REC_ENABLED = getDeploymentEnvironment() !== "production";
  const traceRecorderRef = useRef<TraceRecorder | null>(null);
  if (TRACE_REC_ENABLED && traceRecorderRef.current == null) {
    traceRecorderRef.current = new TraceRecorder();
  }
  const { state, loading, error: stateError, refetch } = useDriverState({
    enabled: isSignedIn === true,
  });
  const {
    location: gpsLocation,
    heading: gpsHeading,
    accuracy: gpsAccuracy,
    speed: gpsSpeed,
  } = useDriverLocation(state?.connected ?? false, {
      onRawSample: (sample) => {
        traceRecorderRef.current?.recordGps({ t: Date.now(), ...sample });
      },
    });
  const gpsAccuracyRef = useRef<number | null>(null);
  gpsAccuracyRef.current = gpsAccuracy;
  // Fase 3-B: ¿ya hubo un fix con accuracy ≤ 20 m? Antes del primero, un fix
  // pobre no mueve la posición visual.
  const firstGoodFixSeenRef = useRef(false);
  if (gpsAccuracy != null && gpsAccuracy <= 20) firstGoodFixSeenRef.current = true;
  // Fase 6-A3: instante del último fix ≤20 m (se marca al RECIBIR el fix) y de
  // la confirmación de recolección desde la UI. Solo diagnóstico de traza.
  const lastGoodFixAtRef = useRef<number | null>(null);
  const pickupConfirmedAtRef = useRef<number | null>(null);
  // Fase 4-B: la primera posición visual que NO vino de GPS se reemplaza por
  // el primer fix ≤50 m (snap) y se refina al primer ≤20 m. La guía no calcula
  // progreso hasta ese fix bueno; cámara y resolvedor comparten la posición
  // visual (no dos posiciones distintas en el arranque).
  const gpsSeedRef = useRef(false);
  const navigationPositionReadyRef = useRef(false);
  const [navigationPositionReady, setNavigationPositionReady] = useState(false);

  // Brújula física del dispositivo (DeviceOrientationEvent). NO pide permiso
  // automáticamente: se activa solo cuando el repartidor comienza navegación
  // o pulsa "Centrar navegación", con explicación previa si es necesario.
  const deviceOrientation = useDeviceOrientation();

  // Panel de diagnóstico de sensores (solo staging/debug): muestra heading
  // del dispositivo vs GPS, velocidad, fuente de heading, estado de permisos
  // y los controles del grabador de trazas reales (Fase 0). Ausente en
  // producción y cuando no hay ruta activa.
  // (declarado después de navigatingWithRoute para evitar TDZ)
  let sensorDebugVisible = false;
  const SHOW_SENSOR_DEBUG = getDeploymentEnvironment() !== "production";



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
  // Fase 1-H: el panel de diagnóstico arranca COLAPSADO (antes tapaba ~1/3
  // del mapa). Se abre con su botón; solo existe en staging.
  const [sensorPanelOpen, setSensorPanelOpen] = useState(false);
  // Fase 4-D: límite de aplicación de cámara configurable SOLO en staging
  // (33 ms por defecto; 16 ms para la prueba A/B de 60 Hz). El valor activo
  // queda registrado en cada bucket de `perf` de la traza.
  const [cameraIntervalMs, setCameraIntervalMs] = useState<16 | 33>(33);
  const cameraIntervalRef = useRef<16 | 33>(33);
  cameraIntervalRef.current = cameraIntervalMs;
  // Fase 6-A2 (solo staging): con el A/B activo el puck se dibuja en el GPS
  // CRUDO (sin interpolación) para separar el desfase de POSICIÓN del de
  // rumbo/render. No cambia la navegación: la cámara y la guía siguen usando
  // la posición visual.
  const [rawPuckDebug, setRawPuckDebug] = useState(false);
  const rawPuckDebugRef = useRef(false);
  rawPuckDebugRef.current = rawPuckDebug;
  // Fase 6-A4: último tramo de la polilínea donde cayó el puck, para buscar
  // el punto más cercano POR PROGRESO (no globalmente, que salta de eje).
  const routeProgressSegRef = useRef<number | null>(null);
  // Fase 7: proyector POSICIÓN + RUMBO. El del loop decide qué punto se dibuja
  // y a qué punto se ancla la cámara; el otro mide la traza, con estado
  // independiente para que el muestreo a 5 Hz no mueva la referencia del loop.
  const routeDirectionRef = useRef(createRouteDirectionTracker());
  const traceRouteDirectionRef = useRef(createRouteDirectionTracker());
  /** Fase 7-D: el frame más reciente dibujó el puck sobre la ruta. */
  const puckRouteSnappedRef = useRef(false);
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
  // Mapa listo (onLoad de <MapboxMap>): los efectos que necesitan mapRef no
  // vacío (p. ej. OFFER_ROUTE_PREVIEW) se re-ejecutan cuando cambia.
  const [mapReady, setMapReady] = useState(false);
  // Estilo de MARCA (streets-v12 recoloreado con la paleta de navegación).
  // Mientras se resuelve se muestra el loader del mapa.
  const [driveStyle, setDriveStyle] = useState<StyleSpecification | null>(null);
  const [driveStyleReady, setDriveStyleReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    markDrive("style-request");
    loadDriveMapStyle().then((style) => {
      if (cancelled) return;
      markDrive("style-ready");
      measureDrive("style", "style-request", "style-ready");
      setDriveStyle(style);
      setDriveStyleReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  // Alias histórico: antes indicaba que el script de Google Maps había
  // cargado. Con Mapbox el mapa se carga solo y expone `mapReady`.
  const mapsLoaded = mapReady;
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

  // Posición VISUAL del vehículo: la interpolada por el loop rAF de seguimiento
  // (la que dibuja el puck y ancla la cámara). Es la única referencia de
  // navegación para guidance/cámara; el GPS crudo solo alimenta el objetivo
  // hacia el que interpola. Declarada aquí (antes de guidance) a propósito.
  // Fase 3-A: estado con histéresis de la tarjeta (depart que no regresa y
  // maniobra ejecutada que no se repite). Se reinicia al cambiar la ruta.
  const guidanceTrackerRef = useRef<{ state: GuidanceState; legKey: string | null } | null>(
    null
  );
  const visualPosRef = useRef<RoutePoint>(currentLocation);

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
        // castigar la API mientras el fallo esté cacheado).
        if (route) setRoadRoute(route);
      });
      return;
    }

    if (!driverHasLocation) return;
    let cancelled = false;
    markDrive("route-request");
    getRoadRoute(currentLocation, navTarget).then((route) => {
      if (!cancelled) {
        markDrive("route-ready");
        measureDrive("route", "route-request", "route-ready");
        setRoadRoute(route);
      }
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
    // Fase 4-B: sin un fix ≤20 m no hay progreso ni distancia de maniobra. La
    // tarjeta muestra «Dirígete…» (o «Comienza tu viaje») y el zoom por
    // maniobra queda inhibido; antes se proyectaba DEFAULT_CENTER a 398 m.
    if (!sim.active && !navigationPositionReady) return null;
    const total = pathLengthMeters(roadRoute.path);
    if (total <= 0) return null;
    // POSICIÓN ÚNICA DE NAVEGACIÓN: la guidance se calcula sobre la posición
    // VISUAL (la misma que dibuja el puck y sigue la cámara), no sobre el GPS
    // crudo. Antes, con GPS directo, la tarjeta podía decir "en 0 m" mientras
    // el cruce aún se veía 150–200 m por delante en pantalla.
    const navPosition = visualPosRef.current;
    const done = Math.min(Math.max(projectOntoPath(roadRoute.path, navPosition), 0), total);
    const remaining = Math.max(0, total - done);
    const duration = roadRoute.durationSeconds;
    const remainingSeconds =
      duration != null ? Math.max(0, duration * (remaining / total)) : null;

    // Tarjeta (Fase 3-A): la SEMÁNTICA vive en lib/drive/guidance.ts —
    // próxima maniobra siempre, distancia real, maniobra ejecutada que no
    // vuelve e histéresis de «Comienza tu viaje». Aquí solo se proyecta la
    // posición visual y se normaliza el idioma.
    const routeKey = `${Math.round(total)}|${roadRoute.steps.length}|${roadRoute.steps[0]?.distanceMeters ?? 0}|${roadRoute.steps.at(-1)?.distanceMeters ?? 0}`;
    // Fase 3.1-G: el estado de la tarjeta pertenece al VIAJE (etapa), no a la
    // geometría. La identidad de la etapa es el destino: un recálculo a mitad
    // de camino conserva `departed` (no reaparece «Comienza tu viaje») y la
    // distancia se recalcula sobre la ruta nueva; cambiar de etapa o de
    // pedido empieza de cero.
    const legKey = `${roadRoute.destination.lat.toFixed(5)},${roadRoute.destination.lng.toFixed(5)}`;
    const current = guidanceTrackerRef.current;
    const sameLeg = current != null && current.legKey === legKey;
    let tracker = current;
    if (tracker == null || !sameLeg || tracker.state.routeKey !== routeKey) {
      tracker = {
        legKey,
        state: nextGuidanceState(sameLeg && current ? current.state : null, routeKey),
      };
      guidanceTrackerRef.current = tracker;
    }
    const g = computeGuidance(tracker.state, roadRoute.steps, total, done);
    const shownStep =
      g.shownStepIndex != null ? roadRoute.steps[g.shownStepIndex] ?? null : null;
    return {
      total,
      remaining,
      remainingSeconds,
      // Siempre en español: capa de normalización sobre el texto de Google.
      instruction: shownStep
        ? instructionInSpanish(shownStep.instruction, shownStep.maneuver)
        : null,
      maneuver: g.maneuver,
      // Calle donde ocurre la maniobra ("Av. Panamericana") o null.
      street: shownStep ? streetFromInstruction(shownStep.instruction) : null,
      // Metros REALES hasta la maniobra mostrada (sobre la ruta).
      distanceToManeuver: g.distanceToManeuver,
      // Paso activo de la ruta (para registrar la etapa en la traza).
      stepIndex: g.stepIndex,
      fractionCompleted: g.fractionCompleted,
    };
  }, [roadRoute, currentLocation, gpsAccuracy, sim.active, navigationPositionReady]);

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
  const mapRef = useRef<MapboxMapInstance | null>(null);
  const firstMapRenderMarkedRef = useRef(false);
  const firstFollowFrameMarkedRef = useRef(false);
  // El handle permite además acceder a los marcadores por id (rotación del
  // conductor sin re-renderizar).
  const mapHandleRef = useRef<MapboxMapHandle | null>(null);
  const mapListenersRef = useRef<Array<{ remove: () => void }>>([]);
  const lastFollowPosRef = useRef<RoutePoint | null>(null);
  const lastFramedRouteRef = useRef<RoadRoute | null>(null);
  const prevNavigatingRef = useRef(false);
  const prevFramedLegKeyRef = useRef<string | null>(null);
  const currentLocationRef = useRef<RoutePoint>(currentLocation);
  const movementHeadingRef = useRef<number | null>(null);
  const movementSpeedRef = useRef<number | null>(null);
  // Fase 1-C: derivación robusta de velocidad/rumbo (módulo puro
  // lib/drive/speed-heading.ts). Alimenta movementHeadingRef/
  // movementSpeedRef en cada fix GPS.
  const speedHeadingRef = useRef(initialSpeedHeadingState());
  // Refs espejo para el loop rAF (lecturas frescas sin recrear el callback).
  const movementSpeedLoopRef = useRef<number | null>(null);
  const simSpeedLoopRef = useRef(1);
  const simActiveLoopRef = useRef(false);
  const simHeadingLoopRef = useRef<number | null>(null);
  const movementPrevRef = useRef<{ pos: RoutePoint; ts: number } | null>(null);
  const visualHeadingRef = useRef<number | null>(null);
  const visualCameraHeadingRef = useRef<{ current: number | null; lastTs?: number }>({ current: null });
  // Zoom calculado en el frame ANTERIOR por el bloque de zoom adaptativo: se
  // aplica junto con center+heading en el MISMO jumpTo (antes eran dos
  // jumpTo por frame = doble invalidación de render de Mapbox).
  const pendingZoomRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  const internalZoomRef = useRef(false);
  const internalZoomTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seguimiento suave tipo GPS: el marcador y la cámara se interpolan entre
  // ticks de GPS vía rAF (nunca se teletransportan). El marcador se mueve por
  // ref (setPosition) para no re-renderizar la página a 60 fps.
  const initialDriverPosRef = useRef(currentLocation);
  const driverMarkerRef = useRef<MapboxMarker | null>(null);
  const centerOnGpsRef = useRef(false);
  // Fase 1-A: instante del gesto REAL que sacó del seguimiento (única causa
  // de reentrada temporizada). Sin gesto, nunca se re-entra solo.
  const gestureExitAtRef = useRef<number | null>(null);
  // Fase 1-B: latido del loop persistente (performance.now() del último
  // tick) y último error capturado (el loop ya no muere en silencio).
  const followLoopHeartbeatRef = useRef<number | null>(null);
  /** Marca de tiempo del rAF anterior (fluidez, Fase 3-C). */
  const lastRafTsRef = useRef<number>(0);
  const followLoopErrorRef = useRef<string | null>(null);
  // Fase 2-A: guarda de anclaje (puck medido vs ancla esperada).
  const anchorMismatchSinceRef = useRef<number | null>(null);
  const anchorMismatchLoggedRef = useRef(false);

  // ── Centrado del mapa en el repartidor (offset de la hoja inferior) ──
  // El mapa ocupa toda la pantalla pero la tarjeta inferior tapa la zona baja:
  // el centro "puro" del contenedor quedaría bajo la hoja. El offset coloca al
  // conductor en el centro del ÁREA VISIBLE (~72%), que es donde Waze/Google
  // Maps lo dejan al navegar.
  const centerOnDriver = useCallback(
    (options: { duration?: number; zoom?: number; heading?: number | null } = {}) => {
      const map = mapRef.current;
      if (!map) return;
      const position = currentLocationRef.current;

      // Fase 1-G: una sola animación (parar la anterior) y el anclaje
      // 70–75 % del área visible en todos los modos.
      map.stop();
      map.easeTo({
        center: [position.lng, position.lat],
        ...(options.zoom != null ? { zoom: options.zoom } : {}),
        // Anclaje por padding (Fase 2-A): `offset` se ignora en jumpTo y no
        // da la misma geometría que el padding en el área visible.
        padding: getDriveAnchorPadding(map),
        bearing: options.heading ?? 0,
        pitch: 0,
        duration: options.duration ?? 450,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
        essential: true,
      });
      visualPosRef.current = position;
      lastFollowPosRef.current = position;
      setDriverMarkerPosition(driverMarkerRef.current, position);
    },
    []
  );

  // ── Primer encuadre en el repartidor ─────────────────────────────
  // Sin pedido activo NUNCA corre el loop de seguimiento: si el mapa arranca
  // en su centro por defecto el puck del conductor quedaba fuera de vista (y
  // se dibujaba incluso por encima de la tarjeta inferior). El primer vuelo se
  // hace una sola vez, en cuanto hay GPS válido y el mapa está listo; después
  // el usuario es libre de explorar.
  const initialCenteredRef = useRef(false);
  useEffect(() => {
    if (initialCenteredRef.current || !mapReady || !driverHasLocation) return;
    initialCenteredRef.current = true;
    centerOnDriver({ duration: 0, zoom: DEFAULT_ZOOM });
  }, [mapReady, driverHasLocation, centerOnDriver]);
  const followTargetRef = useRef<RoutePoint | null>(null);
  // Fase 5-A: hora del último fix que movió el objetivo. La estima entre
  // fixes la usa para extrapolar solo mientras el fix es reciente (≤1.5 s).
  const followTargetTsRef = useRef<number | null>(null);
  const setFollowTargetNow = useCallback((point: RoutePoint | null) => {
    const prev = followTargetRef.current;
    // Solo una POSICIÓN NUEVA renueva la hora del fix: este efecto también se
    // reejecuta por cambios de rumbo/ruta, y no debe prolongar la extrapolación
    // cuando el GPS lleva rato sin entregar un fix.
    if (
      point == null ||
      prev == null ||
      prev.lat !== point.lat ||
      prev.lng !== point.lng
    ) {
      followTargetTsRef.current = point ? performance.now() : null;
    }
    followTargetRef.current = point;
  }, []);
  // Fase 5-A: memoria del frame (dt real, fix ya integrado y corrección
  // pendiente). Vive en refs porque el loop rAF no re-renderiza.
  const followFrameTsRef = useRef<number | null>(null);
  const followFrameFixTsRef = useRef<number | null>(null);
  const followCorrectionRef = useRef<{ meters: number; bearing: number | null }>({
    meters: 0,
    bearing: null,
  });

  // Fase 4-B: una sola posición de arranque para guía, resolvedor y cámara.
  // El gate acepta como SEMILLA el primer fix ≤50 m cuando aún no hay ninguno
  // aceptado; aquí se hace el snap visual (antes la semilla era DEFAULT_CENTER
  // a 398 m y el puck saltaba al llegar el primer fix ≤20 m en T6).
  useEffect(() => {
    if (sim.active || !realLocation) return;
    const acc = gpsAccuracy;
    if (
      !gpsSeedRef.current &&
      acc != null &&
      acc <= 50
    ) {
      // Solo un fix ≤50 m cuenta como semilla; un fix peor no reemplaza el
      // DEFAULT_CENTER ni bloquea el snap del primer fix aceptado.
      gpsSeedRef.current = true;
      markDrive("gps-seed");
      visualPosRef.current = realLocation;
      setFollowTargetNow(realLocation);
      lastFollowPosRef.current = realLocation;
      setDriverMarkerPosition(driverMarkerRef.current, realLocation);
    }
    if (
      !navigationPositionReadyRef.current &&
      acc != null &&
      acc <= 20
    ) {
      navigationPositionReadyRef.current = true;
      setNavigationPositionReady(true);
      markDrive("first-good-fix");
      measureDrive("first-good-fix", "mount", "first-good-fix");
      // Refinamiento inicial: el primer fix ≤20 m sustituye la semilla.
      visualPosRef.current = realLocation;
      setFollowTargetNow(realLocation);
      lastFollowPosRef.current = realLocation;
      setDriverMarkerPosition(driverMarkerRef.current, realLocation);
    }
  }, [realLocation, gpsAccuracy, sim.active]);

  // Fase 6-A3: sello del último fix ≤20 m (el que habilita la guía).
  useEffect(() => {
    if (sim.active || gpsAccuracy == null || gpsAccuracy > 20) return;
    lastGoodFixAtRef.current = Date.now();
  }, [realLocation, gpsAccuracy, sim.active]);

  useEffect(() => {
    traceRecorderRef.current?.setCameraInterval(cameraIntervalMs);
  }, [cameraIntervalMs]);

  const followRafRef = useRef<number | null>(null);
  const lastZoomRef = useRef<number | null>(null);
  // Objetivo de zoom vigente (histéresis): el loop persigue este valor de
  // forma exponencial frame a frame (transición suave, sin saltos).
  const targetZoomRef = useRef<{ target: number; ts: number } | null>(null);
  // Desvío: racha de ticks fuera de la geometría antes de recalcular.
  const offRouteStreakRef = useRef(0);
  const offRouteSinceRef = useRef<number | null>(null);
  const [followDriver, setFollowDriver] = useState(true);
  // Ancla de cámara adelantada al zoom base (m se multiplica por 2^(Δzoom)):
  // mantiene al conductor en el tercio inferior en cualquier nivel de zoom,
  // incluida la apertura antes de maniobras.
  const NAV_AHEAD_BASE = 90;
  const [isRecalculating, setIsRecalculating] = useState(false);
  // OFFER_ROUTE_PREVIEW: estado del preview de oferta. Declarado aquí para
  // que los efectos de cámara (más abajo) puedan leerlo sin TDZ.
  const [offerPreview, setOfferPreview] = useState<OfferPreviewState | null>(null);
  const offerPreviewActive = offerPreview !== null;

  const navigatingWithRoute = Boolean(
    navTarget && mapsLoaded && driverHasLocation && roadRoute?.path
  );

  // Pantalla encendida mientras la app está abierta (no solo al navegar).
  useWakeLock(true);

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
      setDriverMarkerPosition(driverMarkerRef.current, currentLocation);
      visualPosRef.current = currentLocation;
    }
  }, [followDriver, currentLocation]);

  // ── Resolvedor de TARGET HEADING ──
  // Los valores de sensor se leen vía refs para que el resolvedor (creado una
  // sola vez) siempre vea el estado actual sin recrearse ni recrear el loop.
  const gpsHeadingRef = useRef<number | null>(gpsHeading);
  gpsHeadingRef.current = gpsHeading;
  const gpsSpeedRef = useRef<number | null>(gpsSpeed);
  gpsSpeedRef.current = gpsSpeed;
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
      // Fase 4-A: curso con su edad real. El resolvedor lo usa fresco (≤3 s
      // de movimiento confirmado), como caducado o lo sustituye por el
      // segmento de ruta / coords.heading fresco.
      getCourseHeading: () => {
        const st = speedHeadingRef.current;
        return { heading: st.courseHeading, ageMs: courseAgeMs(st, Date.now()) };
      },
      getMovementSpeedMps: () =>
        effectiveMovementSpeedMps(speedHeadingRef.current, Date.now()),
      getCoordsSpeedMps: () => gpsSpeedRef.current,
      getDeviceHeading: () => deviceStateRef.current,
      getRouteGeometry: () => ({
        path: roadRouteRef.current?.path ?? null,
        // Fase 4-B: la MISMA posición que dibuja el puck y proyecta la guía.
        // Antes el resolvedor usaba el GPS crudo y la cámara la visual, así
        // que en el arranque podían discrepar cientos de metros.
        vehiclePos: visualPosRef.current,
      }),
      // Fase 2-B: 8 m / 1000 ms para el bearing entre ticks (antes 5 m /
      // 500 ms: con GPS de 26 m de precisión eso era ruido, no movimiento).
      minMovementMeters: 8,
      minMovementMs: 1_000,
    });
  }

  const driveHeadingResolver = driveHeadingResolverRef.current;

  const resolveNavigationHeading = useCallback(
    () => driveHeadingResolver.resolve(),
    [driveHeadingResolver]
  );

  const headingResolverRef = useRef<() => number | null>(resolveNavigationHeading);
  headingResolverRef.current = resolveNavigationHeading;

  // ── Instrumentación Fase 0 (staging): muestreo de cámara + transiciones ──
  // El muestreo (5 Hz) es INDEPENDIENTE del loop rAF de seguimiento: graba
  // aunque el loop muera, para evidenciar congelamientos y huecos.
  const followDriverRef = useRef(followDriver);
  useEffect(() => {
    followDriverRef.current = followDriver;
    if (TRACE_REC_ENABLED) {
      traceRecorderRef.current?.recordFollow(followDriver, navigatingWithRoute);
    }
  }, [followDriver, navigatingWithRoute, TRACE_REC_ENABLED]);

  // Fase 3.1-E: la traza lleva la ruta ACTIVA (polilínea + steps) para poder
  // reproducir la tarjeta con la geometría real y no con la del simulador.
  useEffect(() => {
    if (!TRACE_REC_ENABLED) return;
    const rec = traceRecorderRef.current;
    if (!rec) return;
    if (!roadRoute || roadRoute.path.length < 2) {
      rec.setRoute(null);
      routeProgressSegRef.current = null;
      routeDirectionRef.current.reset();
      traceRouteDirectionRef.current.reset();
      return;
    }
    // Ruta nueva ⇒ el progreso anterior no sirve como ventana de búsqueda.
    routeProgressSegRef.current = null;
    routeDirectionRef.current.reset();
    traceRouteDirectionRef.current.reset();
    rec.setRoute({
      destination: roadRoute.destination,
      distanceMeters: roadRoute.distanceMeters,
      durationSeconds: roadRoute.durationSeconds,
      steps: roadRoute.steps,
      path: roadRoute.path,
    });
  }, [roadRoute, TRACE_REC_ENABLED]);

  // Fase 1-D: registra cada transición de etapa con la distancia a la próxima
  // maniobra (sin cambiar la lógica de "Comienza tu viaje").
  // Solo se registra cuando cambia lo que ve el repartidor (etapa, paso,
  // maniobra o texto): la distancia cambia en cada fix y anotarla siempre
  // llenaba la traza con 35 filas idénticas en 41 s (T3).
  const lastPhaseKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!TRACE_REC_ENABLED || !navPhase) return;
    const key = [
      navPhase,
      guidance?.stepIndex ?? "-",
      guidance?.maneuver ?? "-",
      guidance?.instruction ?? "-",
    ].join("|");
    if (lastPhaseKeyRef.current === key) return;
    lastPhaseKeyRef.current = key;
    traceRecorderRef.current?.recordPhase(
      navPhase,
      guidance?.distanceToManeuver ?? null,
      {
        stepIndex: guidance?.stepIndex ?? null,
        maneuverType: guidance?.maneuver ?? null,
        instruction: guidance?.instruction ?? null,
        // Fase 6-A3: sin fix ≤20 m reciente la posición visual (y la guía)
        // se congelan; y la confirmación de recolección cambia la etapa.
        fixWithin20mRecent:
          lastGoodFixAtRef.current != null && Date.now() - lastGoodFixAtRef.current <= 5_000,
        msSinceFix20m:
          lastGoodFixAtRef.current != null ? Date.now() - lastGoodFixAtRef.current : null,
        pickupConfirmed: pickupConfirmedAtRef.current != null,
      }
    );
  }, [
    navPhase,
    guidance?.distanceToManeuver,
    guidance?.stepIndex,
    guidance?.maneuver,
    guidance?.instruction,
    TRACE_REC_ENABLED,
  ]);

  useEffect(() => {
    if (!TRACE_REC_ENABLED || !navigatingWithRoute || !mapReady) return;
    const id = setInterval(() => {
      const map = mapRef.current;
      const rec = traceRecorderRef.current;
      if (!map || !rec) return;
      const center = map.getCenter();
      const vehicle = visualPosRef.current;
      const mapBearing = map.getBearing();
      const resolverState = driveHeadingResolverRef.current?.state ?? null;
      const dbg = resolverState?.debug ?? null;
      const driverHeading = visualHeadingRef.current;
      const routePath = roadRouteRef.current?.path ?? null;

      // ── Fase 6-A1: desfase flecha ↔ ruta en PÍXELES ──
      // Se mide desde la PUNTA de la flecha (no desde el centro del puck) y
      // se busca la ruta desde ahí: en recta el valor es ≈0 y el número mide
      // desviación lateral, no el avance propio de la punta.
      const measureArrow = (pos: RoutePoint) => {
        const puck = map.project([pos.lng, pos.lat]);
        const tip = driverArrowTipPx(puck, driverHeading, mapBearing);
        if (!tip || !routePath) {
          return {
            puck,
            tip,
            nearestPx: null as { x: number; y: number } | null,
            offsetPx: null as number | null,
          };
        }
        const tipPos = map.unproject([tip.x, tip.y]);
        const near = nearestPointOnPath(routePath, tipPos.lat, tipPos.lng);
        if (!near) return { puck, tip, nearestPx: null as { x: number; y: number } | null, offsetPx: null as number | null };
        const nearestPx = map.project([near.lng, near.lat]);
        return {
          puck,
          tip,
          nearestPx,
          offsetPx: Math.hypot(tip.x - nearestPx.x, tip.y - nearestPx.y),
        };
      };
      type ArrowMeasure = ReturnType<typeof measureArrow>;

      // Fase 6-A2: qué posición se DIBUJA (visual normal / GPS crudo en A/B).
      // La medición se guarda SIEMPRE de las dos, para poder comparar aunque
      // el A/B esté apagado.
      const rawTarget = followTargetRef.current;
      const drawnRaw = rawPuckDebugRef.current && rawTarget != null;
      const drawn = drawnRaw ? rawTarget : vehicle;
      let puckPx: { x: number; y: number } | null = null;
      let rawPuckPx: { x: number; y: number } | null = null;
      let visualMeasure: ArrowMeasure | null = null;
      let rawMeasure: ArrowMeasure | null = null;
      try {
        puckPx = map.project([drawn.lng, drawn.lat]);
        visualMeasure = measureArrow(vehicle);
        if (rawTarget) {
          rawPuckPx = map.project([rawTarget.lng, rawTarget.lat]);
          rawMeasure = measureArrow(rawTarget);
        }
      } catch {
        puckPx = null;
        rawPuckPx = null;
        visualMeasure = null;
        rawMeasure = null;
      }
      const puckPxX = puckPx?.x ?? null;
      const puckPxY = puckPx?.y ?? null;
      // La guarda de anclaje mide SIEMPRE el puck visual (el ancla pertenece
      // a la cámara de seguimiento, no al A/B de dibujo).
      const anchorPuckY = visualMeasure?.puck.y ?? null;
      // Fase 7-D: referencia de ruta del SENTIDO DE MARCHA (posición + rumbo)
      // medida dos veces: sobre el GPS crudo (error de carril real) y sobre el
      // puck dibujado (corrección aplicada). El tracker de la traza es propio
      // para no alterar la ventana de progreso del loop de seguimiento.
      const traceHeading = resolverState?.acceptedHeading ?? null;
      const traceNow = Date.now();
      const rawFix = followTargetRef.current ?? vehicle;
      const gpsHit = routePath
        ? traceRouteDirectionRef.current.project(
            routePath,
            rawFix,
            traceHeading,
            traceNow
          )
        : null;
      const puckHit = routePath
        ? traceRouteDirectionRef.current.project(
            routePath,
            vehicle,
            traceHeading,
            traceNow
          )
        : null;
      const nearest = gpsHit;
      // Medición GLOBAL (sin filtro de rumbo): sigue siendo la referencia para
      // detectar que la búsqueda global saltaría de eje.
      const globalNearest = routePath
        ? nearestPointOnPath(routePath, vehicle.lat, vehicle.lng)
        : null;
      // Fase 6-A4: la misma distancia buscando SOLO por progreso.
      const progressHit = routePath
        ? nearestPointOnPathByProgress(
            routePath,
            vehicle.lat,
            vehicle.lng,
            routeProgressSegRef.current
          )
        : null;
      if (progressHit) routeProgressSegRef.current = progressHit.segmentIndex;
      // Escala REAL de pantalla (px/m): 10 m al norte proyectados junto al
      // puck. No depende de la fórmula de tiles (256 vs 512) ni del pitch
      // (que se registra aparte): convierte el desfase de px a metros.
      let screenPxPerMeter: number | null = null;
      try {
        const a = map.project([vehicle.lng, vehicle.lat]);
        const b = map.project([vehicle.lng, vehicle.lat + 10 / 110_540]);
        const px = Math.hypot(a.x - b.x, a.y - b.y);
        if (px > 0) screenPxPerMeter = px / 10;
      } catch {
        screenPxPerMeter = null;
      }
      // Banda visible: el requisito es 70–75 % del ÁREA VISIBLE (no de la
      // altura total del contenedor). Se registra para medirlo en el arnés.
      const band = readDriveVisibleBand(map);
      // ── Guarda de anclaje (Fase 2-A, solo staging) ──
      // Si el puck MEDIDO (map.project) se desvía >5 % de la altura del
      // ancla durante >2 s, se registra un evento en la traza: el anclaje
      // dejó de aplicarse (p. ej. si Mapbox ignora el padding en un build).
      if (anchorPuckY != null && band.containerHeight > 0) {
        const deviation = Math.abs(anchorPuckY - band.anchorY) / band.containerHeight;
        if (deviation > 0.05) {
          if (anchorMismatchSinceRef.current == null) {
            anchorMismatchSinceRef.current = Date.now();
          }
          const lastsForMs = Date.now() - anchorMismatchSinceRef.current;
          if (lastsForMs > 2_000 && !anchorMismatchLoggedRef.current) {
            anchorMismatchLoggedRef.current = true;
            rec.recordAnchorMismatch({
              puckPxY: anchorPuckY,
              anchorPxY: band.anchorY,
              deviationFraction: deviation,
              lastsForMs,
              paddingTop: band.padding.top,
              paddingBottom: band.padding.bottom,
            });
          }
        } else {
          anchorMismatchSinceRef.current = null;
          anchorMismatchLoggedRef.current = false;
        }
      }
      rec.recordCamera({
        t: Date.now(),
        centerLat: center.lat,
        centerLng: center.lng,
        bearing: map.getBearing(),
        zoom: map.getZoom(),
        followDriver: followDriverRef.current,
        loopAlive: followRafRef.current != null,
        resolverSource: dbg?.source ?? null,
        // Se lee el rumbo ACEPTADO por el resolvedor, no se vuelve a llamar a
        // resolve(): hacerlo desde el muestreo (5 Hz) ejecutaba efectos
        // laterales fuera de cadencia (avanzaba anclas y el límite angular).
        resolvedHeading: resolverState?.acceptedHeading ?? null,
        visualHeading: visualHeadingRef.current,
        speedMps: movementSpeedRef.current,
        compassHeading:
          deviceStateRef.current.available === "available"
            ? deviceStateRef.current.heading
            : null,
        compassAvailable: deviceStateRef.current.available,
        puckPxY,
        puckPxX,
        puckSource: drawnRaw ? "raw" : "visual",
        arrowTipPxX: visualMeasure?.tip?.x ?? null,
        arrowTipPxY: visualMeasure?.tip?.y ?? null,
        routeNearestPxX: visualMeasure?.nearestPx?.x ?? null,
        routeNearestPxY: visualMeasure?.nearestPx?.y ?? null,
        arrowOffsetPx: visualMeasure?.offsetPx ?? null,
        rawPuckPxX: rawPuckPx?.x ?? null,
        rawPuckPxY: rawPuckPx?.y ?? null,
        rawArrowOffsetPx: rawMeasure?.offsetPx ?? null,
        routeNearestLat: nearest?.lat ?? null,
        routeNearestLng: nearest?.lng ?? null,
        routeOffsetMeters: nearest?.distanceMeters ?? null,
        routeSegmentBearingDeg: nearest?.bearingDeg ?? null,
        routeHeadingDeltaDeg: nearest?.headingDeltaDeg ?? null,
        routeSameDirection: nearest?.sameDirection ?? null,
        puckRouteSnapped: puckRouteSnappedRef.current,
        puckRouteOffsetMeters: puckHit?.distanceMeters ?? null,
        routeOppositeSwitchCount: traceRouteDirectionRef.current.rejections,
        pitch: map.getPitch(),
        screenPxPerMeter,
        arrowOffsetMeters:
          visualMeasure?.offsetPx != null && screenPxPerMeter
            ? visualMeasure.offsetPx / screenPxPerMeter
            : null,
        routeOffsetProgressMeters: progressHit?.distanceMeters ?? null,
        routeNearestSegmentIndex:
          nearest?.segmentIndex ?? progressHit?.segmentIndex ?? null,
        // Solo cuenta como salto de eje si la global encontró otra línea
        // >1 m más cercana MIENTRAS el seguimiento por progreso sigue a nivel
        // de carril (≤8 m): una re-adquisición del GPS no es un salto de eje.
        routeNearestAxisJump:
          globalNearest != null && progressHit != null
            ? progressHit.distanceMeters <= 8 &&
              globalNearest.distanceMeters + 1 < progressHit.distanceMeters
            : null,
        containerHeight: band.containerHeight,
        visibleTopPx: band.top,
        visibleBottomPx: band.bottom,
        vehicleLat: vehicle.lat,
        vehicleLng: vehicle.lng,
      });
    }, 200);
    return () => clearInterval(id);
  }, [navigatingWithRoute, mapReady, TRACE_REC_ENABLED]);

  // Fase 1-E: el anclaje 70–75 % depende de las alturas REALES (tarjeta
  // superior, panel inferior, barra de Safari, teclado). Se invalida la caché
  // del offset cuando cambian (ResizeObserver + visualViewport + resize), sin
  // leer layout en cada frame.
  useEffect(() => {
    if (!mapReady) return;
    const container = mapRef.current?.getContainer() ?? null;
    const top = document.getElementById("drive-top-overlay");
    const bottom = document.getElementById("drive-bottom-overlay");
    const observer = new ResizeObserver(() => notifyDriveLayoutChanged());
    if (container) observer.observe(container);
    if (top) observer.observe(top);
    if (bottom) observer.observe(bottom);
    window.visualViewport?.addEventListener("resize", notifyDriveLayoutChanged);
    window.addEventListener("resize", notifyDriveLayoutChanged);
    window.addEventListener("orientationchange", notifyDriveLayoutChanged);
    notifyDriveLayoutChanged();
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener("resize", notifyDriveLayoutChanged);
      window.removeEventListener("resize", notifyDriveLayoutChanged);
      window.removeEventListener("orientationchange", notifyDriveLayoutChanged);
    };
  }, [mapReady, tripSheetCollapsedHeight, tripSheetExpanded]);

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
    // Fase 5-A: al reanudar no debe aplicarse un dt enorme del parón (la
    // estima avanzaría varios metros en un cuadro). El primer cuadro nuevo usa
    // `frameScale`.
    followFrameTsRef.current = null;
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

  /**
   * Loop rAF de seguimiento PERSISTENTE (Fase 1-B).
   *
   * - Se reprograma al INICIO de cada tick: nunca muere (ni con target nulo,
   *   ni al converger en el objetivo, ni por una excepción).
   * - La matemática del frame vive en `computeFollowFrame` (puro, testeable
   *   en Node): posición/rumbo/zoom/anclaje.
   * - La cámara se escribe por el ÚNICO camino (`applyCameraCommand` sobre el
   *   sink del mapa) — ningún otro punto del seguimiento llama jumpTo/easeTo.
   * - Latido (`followLoopHeartbeatRef`) y último error quedan registrados para
   *   la traza: si el loop se detuviera, se ve en los datos.
   */
  const ensureFollowLoop = useCallback(() => {
    if (followRafRef.current !== null) return;
    // Al tomar el control, cancelar cualquier heading tween en vuelo para que
    // solo un rAF escriba visualHeadingRef.current.
    stopHeadingAnimation();
    let lastCameraUpdateTs = 0;
    const step = (ts: number) => {
      followRafRef.current = requestAnimationFrame(step);
      followLoopHeartbeatRef.current = Date.now();
      try {
        stepBody(ts);
      } catch (err) {
        // Una excepción (mapa desmontado, dato raro) NO mata el seguimiento
        // en silencio: se registra y el loop sigue vivo.
        followLoopErrorRef.current = String(err);
        if (process.env.NODE_ENV !== "production") {
          console.warn("[drive] follow loop error", err);
        }
      }
    };
    const stepBody = (ts: number) => {
      if (!firstFollowFrameMarkedRef.current) {
        firstFollowFrameMarkedRef.current = true;
        markDrive("follow-first-frame");
        measureDrive("first-follow-frame", "mount", "follow-first-frame");
      }
      // Fase 3-C: intervalo real entre cuadros del loop (p50/p95/máx por
      // segundo en la traza). Se mide el rAF, no el trabajo: si el hilo está
      // saturado el intervalo sube aunque el loop haga lo mismo.
      if (TRACE_REC_ENABLED) {
        traceRecorderRef.current?.recordRafInterval(ts - lastRafTsRef.current);
      }
      lastRafTsRef.current = ts;
      const map = mapRef.current;
      const target = followTargetRef.current;
      // Sin mapa/target todavía: el loop sigue vivo y espera.
      if (!map || !target) return;
      if (ts - lastCameraUpdateTs < cameraIntervalRef.current) return;
      const frameDtMs =
        lastCameraUpdateTs === 0
          ? cameraIntervalRef.current
          : ts - lastCameraUpdateTs;
      const frameScale = Math.min(
        4,
        Math.max(0.5, frameDtMs / cameraIntervalRef.current)
      );
      lastCameraUpdateTs = ts;
      const speedForFrame = simRef.current.active
        ? SIM_BASE_METERS_PER_SECOND * simRef.current.speed
        : (movementSpeedLoopRef.current ?? 0);
      const prevPos = visualPosRef.current;

      const frame = computeFollowFrame(
        {
          vehiclePos: prevPos,
          visualHeading: visualHeadingRef.current,
          cameraHeading: visualCameraHeadingRef.current.current,
          cameraHeadingTs: visualCameraHeadingRef.current.lastTs ?? null,
          zoomTarget: targetZoomRef.current?.target ?? null,
          frameTs: followFrameTsRef.current,
          fixTs: followFrameFixTsRef.current,
          correctionMeters: followCorrectionRef.current.meters,
          correctionBearing: followCorrectionRef.current.bearing,
        },
        {
          now: performance.now(),
          frameScale,
          mapZoom: map.getZoom(),
          target,
          targetHeading: headingResolverRef.current(),
          simHeading:
            simRef.current.active && simRef.current.simHeading != null
              ? simRef.current.simHeading
              : null,
          speedMps: speedForFrame,
          route: roadRouteRef.current
            ? {
                path: roadRouteRef.current.path,
                steps: roadRouteRef.current.steps,
              }
            : null,
          anchorY: readDriveVisibleBand(map).anchorY,
          containerHeightPx: readDriveVisibleBand(map).containerHeight,
          pendingZoom: pendingZoomRef.current,
          accuracy: gpsAccuracyRef.current,
          firstGoodFixSeen: firstGoodFixSeenRef.current,
          navigationReady: sim.active || navigationPositionReadyRef.current,
          mapBearing: map.getBearing?.() ?? 0,
          fixTs: followTargetTsRef.current,
          // Fase 7-B: el target se proyecta al carril del sentido de marcha.
          routeDirection: routeDirectionRef.current,
        }
      );

      followFrameTsRef.current = frame.state.frameTs ?? null;
      followFrameFixTsRef.current = frame.state.fixTs ?? null;
      followCorrectionRef.current = {
        meters: frame.state.correctionMeters ?? 0,
        bearing: frame.state.correctionBearing ?? null,
      };
      visualPosRef.current = frame.state.vehiclePos;
      puckRouteSnappedRef.current = frame.routeSnapped;
      visualHeadingRef.current = frame.state.visualHeading;
      visualCameraHeadingRef.current.current = frame.state.cameraHeading;
      visualCameraHeadingRef.current.lastTs =
        frame.state.cameraHeadingTs ?? undefined;
      if (frame.state.zoomTarget != null) {
        targetZoomRef.current = {
          target: frame.state.zoomTarget,
          ts: performance.now(),
        };
      }
      pendingZoomRef.current = frame.pendingZoom;
      if (frame.pendingZoom != null) {
        lastZoomRef.current = frame.pendingZoom;
        // El zoom programático necesita el guard: sin él, zoom_changed lo
        // interpretaría como gesto del usuario.
        markInternalZoom();
      }
      // Fase 6-A2 (solo staging): con el A/B activo el puck se dibuja en el
      // GPS CRUDO. La cámara y la guía siguen usando la posición visual.
      const rawTargetForPuck = followTargetRef.current;
      setDriverMarkerPosition(
        driverMarkerRef.current,
        rawPuckDebugRef.current && rawTargetForPuck != null
          ? rawTargetForPuck
          : frame.state.vehiclePos
      );
      if (frame.headingChanged && frame.state.visualHeading != null) {
        // Flecha relativa al rumbo de la CÁMARA (que ahora sigue el rumbo
        // real de navegación): la desviación puck↔ruta desaparece.
        applyDriverMarkerIcon(
          driverMarkerRef.current,
          frame.state.visualHeading,
          frame.state.visualHeading
        );
      }

      // Fase 5-B: uniformidad por cuadrado — píxeles desplazados en esta
      // aplicación de cámara y cuánto se esperaba (v·dt). El muestreo a 5 Hz
      // no lo detectaba: mide el centro cada 200 ms y una ráfaga de 250 ms
      // cae dentro de una muestra.
      if (TRACE_REC_ENABLED) {
        const movedM = haversineMeters(prevPos, frame.state.vehiclePos);
        const mpp = Math.max(
          0.01,
          metersPerPixelAt(map.getZoom(), prevPos.lat)
        );
        traceRecorderRef.current?.recordCameraApply({
          movedPx: movedM / mpp,
          speedMps: speedForFrame,
          expectedStepPx: (speedForFrame * frameDtMs) / 1000 / mpp,
        });
      }
      // ÚNICO camino de escritura de cámara del seguimiento.
      applyCameraCommand(createDriveCameraSink(map), {
        center: frame.command.center,
        heading: frame.command.bearing,
        padding: frame.command.padding,
        ...(frame.command.zoom != null ? { zoom: frame.command.zoom } : {}),
        pitch: 0,
        origin: "programmatic",
      });
    };
    followRafRef.current = requestAnimationFrame(step);
  }, [stopHeadingAnimation, markInternalZoom]);

  /** Sale del modo navegación/seguimiento (interacción manual del usuario). */
  const exitFollowMode = useCallback(() => {
    setFollowDriver(false);
    centerOnGpsRef.current = false;
    cancelFollowLoop();
    stopHeadingAnimation();
    visualHeadingRef.current = null;
    // Norte arriba: la flecha vuelve a rotación absoluta 0 (apunta al norte).
    applyDriverMarkerIcon(driverMarkerRef.current, 0, null);
    const map = mapRef.current;
    // Norte arriba y sin tilt: vista de exploración tras el gesto del usuario.
    if (map && map.getBearing?.()) {
      moveMapCamera(map, { heading: 0, tilt: 0 });
    }
  }, [cancelFollowLoop, stopHeadingAnimation]);

  const handleMapLoad = useCallback(
    (map: MapboxMapInstance) => {
      mapRef.current = map;
      markDrive("map-load");
      // Mapa nuevo ⇒ padding nuevo (el mapa anterior pudo tenerlo aplicado).
      lastAppliedPadding = null;
      setMapReady(true);
      // Solo dev: expone el mapa para probar en DevTools Console.
      if (process.env.NODE_ENV !== "production") {
        (window as unknown as { __driveMap?: MapboxMapInstance }).__driveMap = map;
      }
      mapListenersRef.current.forEach((listener) => listener.remove());

      // Fase 1-A: SOLO un gesto REAL del usuario saca del seguimiento.
      // En mapbox-gl 3.33, `jumpTo`/`easeTo` disparan dragstart/rotatestart/
      // zoomstart/movestart/pitchstart PROGRAMÁTICOS. La versión anterior
      // salía de FOLLOWING en cualquiera de ellos: cada update de cámara con
      // rotación ejecutaba exitFollowMode (traza T1: 17 ciclos entrar→salir
      // en 57 s, 0/176 eventos con originalEvent).
      const exitOnRealGesture = (type: string) => (e?: { originalEvent?: unknown }) => {
        const isGesture = e?.originalEvent != null;
        if (TRACE_REC_ENABLED) {
          // Etiqueta el origen (gesto vs programático) en la traza.
          traceRecorderRef.current?.recordMapEvent(`${type}:exit-check`, isGesture);
        }
        if (!shouldExitFollowOnMapEvent({ type: "dragstart", isGesture })) return;
        // Guard de zoom programático (Centrar GPS / encuadres / Ver viaje).
        if (type === "zoomstart" && internalZoomRef.current) return;
        gestureExitAtRef.current = Date.now();
        exitFollowMode();
      };
      const onDragStart = exitOnRealGesture("dragstart");
      const onRotateStart = exitOnRealGesture("rotatestart");
      const onZoomStart = exitOnRealGesture("zoomstart");
      const onMoveStart = exitOnRealGesture("movestart");
      const onPitchStart = exitOnRealGesture("pitchstart");
      const onZoom = (e?: { originalEvent?: unknown }) => {
        if (e?.originalEvent == null) return;
        if (internalZoomRef.current) return;
        onZoomStart(e);
      };
      // Fin del arrastre: un paneo NO debe contar como toque simple (no
      // cierra "Tu ruta").
      const onDragEnd = () => {
        mapDraggedAtRef.current = Date.now();
      };
      map.on("dragstart", onDragStart as never);
      map.on("dragend", onDragEnd);
      map.on("rotatestart", onRotateStart as never);
      map.on("zoomstart", onZoomStart as never);
      map.on("movestart", onMoveStart as never);
      map.on("pitchstart", onPitchStart as never);
      map.on("zoom", onZoom as never);
      // Instrumentación Fase 0 (staging): registra TODOS los eventos de
      // cámara con su `originalEvent` (gesto real vs programático) — evidencia
      // de si un gesto programático saca de seguimiento. Solo observa.
      const recMap = map as unknown as {
        on: (type: string, handler: (e: { originalEvent?: unknown }) => void) => unknown;
        off: (type: string, handler: (e: { originalEvent?: unknown }) => void) => unknown;
      };
      const recTypes = [
        "dragstart",
        "dragend",
        "rotatestart",
        "rotateend",
        "zoomstart",
        "zoomend",
        "movestart",
        "moveend",
        "pitchstart",
        "pitchend",
      ] as const;
      // Fase 3-C: `render` de Mapbox por segundo (se agrega, no se guarda uno
      // por evento: son ~60/s). Explica si la fluidez la limita el loop o el
      // propio render del mapa.
      const onRender = () => {
        traceRecorderRef.current?.recordMapRender();
        if (!firstMapRenderMarkedRef.current) {
          firstMapRenderMarkedRef.current = true;
          markDrive("map-first-render");
          measureDrive("first-render", "mount", "map-first-render");
        }
      };
      if (TRACE_REC_ENABLED) recMap.on("render", onRender);
      const recHandlers = TRACE_REC_ENABLED
        ? recTypes.map((type) => {
            const handler = (e: { originalEvent?: unknown }) =>
              traceRecorderRef.current?.recordMapEvent(type, e?.originalEvent != null);
            recMap.on(type, handler);
            return { type, handler };
          })
        : [];
      mapListenersRef.current = [
        { remove: () => map.off("dragstart", onDragStart as never) },
        { remove: () => map.off("dragend", onDragEnd) },
        { remove: () => map.off("rotatestart", onRotateStart as never) },
        { remove: () => map.off("zoomstart", onZoomStart as never) },
        { remove: () => map.off("movestart", onMoveStart as never) },
        { remove: () => map.off("pitchstart", onPitchStart as never) },
        { remove: () => map.off("zoom", onZoom as never) },
        ...recHandlers.map(({ type, handler }) => ({
          remove: () => recMap.off(type, handler),
        })),
        { remove: () => recMap.off("render", onRender) },
      ];
    },
    [exitFollowMode]
  );

  // El mapa avisa "listo" antes de crear los marcadores: cuando el marcador
  // del conductor ya existe se conecta la ref con su instancia para moverlo y
  // rotarlo sin re-renderizar.
  useEffect(() => {
    if (!mapReady) return;
    const driverMarker = mapHandleRef.current?.marker(DRIVER_MARKER_ID) ?? null;
    driverMarkerRef.current = driverMarker;
    if (driverMarker) {
      resetDriverMarkerIconBucket();
      applyDriverMarkerIcon(driverMarker, 0, null);
    }
  }, [mapReady]);

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
      delete (window as unknown as { __driveMap?: MapboxMapInstance }).__driveMap;
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

  // Velocidad + rumbo derivados del GPS real (Fase 1-C: módulo puro
  // lib/drive/speed-heading.ts). Sustituye el umbral 2 m / 250 ms, que a
  // ritmo de caminata NUNCA se cumplía y dejaba velocidad/rumbo pegados a
  // los primeros fixes espurios (traza T1: 1784 → 617 → 433 m/s).
  // No aplica en simulación: el simulador ya entrega posición continua.
  useEffect(() => {
    if (sim.active) {
      movementPrevRef.current = null;
      speedHeadingRef.current = initialSpeedHeadingState();
      movementHeadingRef.current = null;
      movementSpeedRef.current = null;
      return;
    }
    const now = Date.now();
    speedHeadingRef.current = applyGpsFix(
      speedHeadingRef.current,
      {
        pos: currentLocation,
        ts: now,
        coordsSpeed: gpsSpeed,
        accuracy: gpsAccuracy,
      },
      gpsHeading
    );
    const state = speedHeadingRef.current;
    movementSpeedRef.current = effectiveSpeedMps(state, now);
    // Fase 4-A: solo un curso FRESCO (movimiento confirmado ≤3 s) actualiza el
    // rumbo de movimiento; el valor caducado queda como respaldo del resolvedor.
    const course = effectiveCourseHeading(state, now);
    if (course != null) movementHeadingRef.current = course;
  }, [currentLocation, gpsSpeed, gpsAccuracy, gpsHeading, sim.active]);

  // Caducidad de la velocidad: sin fix nuevo en 3 s, la velocidad vuelve a 0
  // (parado = sin movimiento; evita que el zoom/auto-resume crean que sigue
  // en marcha con el último valor).
  useEffect(() => {
    const id = setInterval(() => {
      if (sim.active) return;
      const now = Date.now();
      const next = effectiveSpeedMps(speedHeadingRef.current, now);
      if (movementSpeedRef.current !== next) movementSpeedRef.current = next;
    }, 500);
    return () => clearInterval(id);
  }, [sim.active]);

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
      moveMapCamera(map, { zoom: DEFAULT_ZOOM });
      lastFollowPosRef.current = currentLocation;
      moveMapCamera(map, { center: currentLocation });
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
      setDriverMarkerPosition(driverMarkerRef.current, currentLocation);
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
      // Fase 3-B: antes del primer fix bueno (accuracy ≤ 20 m) un fix pobre no
      // mueve ni la cámara ni el puck (T4: 79 m ⇒ 50.2 m de salto en 1.6 s).
      if (!firstGoodFixSeenRef.current && (gpsAccuracyRef.current ?? 0) > 20) return;
      // Sin ruta: seguimiento simple con heading del dispositivo/GPS.
      // El marcador acompaña a la posición real y el mapa se orienta según
      // el heading disponible (GPS, movimiento o brújula) para que la
      // experiencia sea similar a un GPS aunque la ruta aún no esté lista.
      cancelFollowLoop();
      visualPosRef.current = currentLocation;
      setDriverMarkerPosition(driverMarkerRef.current, currentLocation);
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
      // Fase 1-B: único camino de escritura de cámara (antes: map.setCenter
      // directo, un segundo escritor fuera del controlador). Con el anclaje
      // 70–75 % del área visible también en este modo (Fase 1-E).
      moveMapCamera(map, {
        center: currentLocation,
        padding: getDriveAnchorPadding(map),
      });
      return;
    }

    // Seguimiento fluido: el loop rAF estima vehículo y cámara entre fixes.
    setFollowTargetNow(currentLocation);
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
  // Se recalcula la ruta solo con evidencia SOSTENIDA de desvío real:
  //  - distancia lateral > umbral adaptativo a la precisión GPS
  //    (max(OFF_ROUTE_METERS, accuracy * 1.5)): un fix con accuracy de 80 m
  //    no puede disparar un recálculo por estar "a 70 m de la ruta".
  //  - persistencia temporal >= OFF_ROUTE_MIN_MS (3 s), no solo N ticks
  //    (ticks de 250 ms hacían que 4 checks fueran ~1 s).
  //  - fixes con accuracy > OFF_ROUTE_MAX_ACCURACY_M no cuentan como
  //    evidencia (se ignoran, ni suman ni resetean la racha).
  useEffect(() => {
    if (sim.active || !mapsLoaded || !driverHasLocation || !navTarget) {
      offRouteStreakRef.current = 0;
      offRouteSinceRef.current = null;
      return;
    }
    const path = roadRoute?.path;
    if (!path || path.length < 2) {
      offRouteStreakRef.current = 0;
      offRouteSinceRef.current = null;
      return;
    }
    const accuracy = gpsAccuracyRef.current;
    if (accuracy != null && accuracy > OFF_ROUTE_MAX_ACCURACY_M) return;
    const lateral = distanceToPathMeters(path, currentLocation);
    const pastStart = projectOntoPath(path, currentLocation) > 40;
    const threshold = Math.max(OFF_ROUTE_METERS, (accuracy ?? 40) * 1.5);
    const now = Date.now();
    if (lateral > threshold && pastStart) {
      offRouteStreakRef.current += 1;
      if (offRouteSinceRef.current == null) offRouteSinceRef.current = now;
    } else {
      offRouteStreakRef.current = 0;
      offRouteSinceRef.current = null;
    }
    const sustainedMs =
      offRouteSinceRef.current != null ? now - offRouteSinceRef.current : 0;
    if (
      offRouteStreakRef.current >= OFF_ROUTE_CHECKS &&
      sustainedMs >= OFF_ROUTE_MIN_MS
    ) {
      offRouteStreakRef.current = 0;
      offRouteSinceRef.current = null;
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
    setDriverMarkerPosition(driverMarkerRef.current, currentLocation);
    setFollowTargetNow(currentLocation);
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
    // Fase 1-F: con ruta activa NO se solicita DeviceOrientation (iOS muestra
    // el aviso de movimiento y orientación). La brújula solo se activa por
    // acción explícita en el panel de diagnóstico (staging).
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
    const onZoom = () => {
      // Los zooms PROGRAMÁTICOS (encuadre del preview, cámara drive) no son
      // gestos del usuario: el guard internalZoomRef los excluye.
      if (!internalZoomRef.current) onInteraction();
    };
    map.on("dragstart", onInteraction);
    map.on("zoom", onZoom);
    return () => {
      map.off("dragstart", onInteraction);
      map.off("zoom", onZoom);
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
        setFollowTargetNow(current);
        visualPosRef.current = current;
        setDriverMarkerPosition(driverMarkerRef.current, current);
        markInternalZoom();
        moveMapCamera(map, { zoom: NAV_ZOOM_BASE });
        ensureFollowLoop();
        return;
      }
      lastFollowPosRef.current = current;
      markInternalZoom();
      moveMapCamera(map, { zoom: DEFAULT_ZOOM });
      moveMapCamera(map, { center: current });
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
      // Sin ruta activa: el botón DEBE recentrar al repartidor dentro del
      // área visible (encima de la tarjeta), con norte arriba y sin tilt.
      cancelFollowLoop();
      stopHeadingAnimation();
      visualHeadingRef.current = null;
      applyDriverMarkerIcon(driverMarkerRef.current, 0, null);
      centerOnDriver({ duration: 450 });
    }
    lastFollowPosRef.current = currentLocation;
    // El marcador parte de la posición real y el loop lleva el CENTRO hasta
    // el anclaje (conductor abajo) con transición fluida.
    visualPosRef.current = currentLocation;
    setDriverMarkerPosition(driverMarkerRef.current, currentLocation);
    setFollowTargetNow(currentLocation);
    if (withRoute) {
      ensureFollowLoop();
      // NO se fuerza el zoom aquí: el objetivo de zoom de navegación se
      // persigue de forma GRADUAL dentro del loop (transición animada, sin
      // salto brusco desde la vista de exploración del usuario).
      lastZoomRef.current = null;
    }
    setFollowDriver(true);
    // Fase 1-F: NO se solicita permiso de brújula al entrar en seguimiento.
  }, [
    currentLocation,
    roadRoute,
    navTarget,
    ensureFollowLoop,
    cancelFollowLoop,
    startHeadingTween,
    stopHeadingAnimation,
    applyHeading,
    centerOnDriver,
  ]);

  // "Centrar GPS" = regresar al modo navegación heading-up si el usuario
  // arrastró el mapa y salió de él: no solo recentra, restaura rumbo + tilt.
  const handleCenterGps = useCallback(() => {
    // Intención explícita del usuario: la restauración del preview no debe
    // pisar esta vista cuando la oferta termine.
    lastMapInteractionAtRef.current = Date.now();
    centerOnGpsRef.current = true;
    // Fase 1-G: idempotente — se corta cualquier animación en vuelo antes de
    // iniciar la única animación de recentrado (sin apilar toques).
    mapRef.current?.stop();
    // El gesto es intención explícita del usuario: reinicia el temporizador
    // de la única reentrada temporizada (el usuario acaba de pedir seguir).
    gestureExitAtRef.current = null;
    // Fase 1-F: sin pedir permiso de brújula al centrar.
    enterFollowCamera();
  }, [enterFollowCamera]);

  // ── Reanudación del seguimiento: SIN temporizador por velocidad ──
  // Fase 1-A: la reanudación automática cada ≤5 s al "volver a conducir" era
  // el motor del ciclo entrar→matar→entrar (la cámara programática disparaba
  // rotatestart y mataba el follow, y la velocidad lo resucitaba). Ahora el
  // seguimiento solo se recupera por: inicio de navegación, botón de
  // localizar, o UN ÚNICO temporizador tras un gesto real del usuario
  // (AUTO_REENTER_MS = 30 s, ver lib/drive/camera-controller.ts).
  useEffect(() => {
    if (followDriver || offerPreviewActive || !driverHasLocation) return;
    const exitTs = gestureExitAtRef.current;
    if (exitTs == null) return; // sin gesto real: nunca re-entrar solo
    const remaining = AUTO_REENTER_MS - (Date.now() - exitTs);
    if (remaining <= 0) {
      gestureExitAtRef.current = null;
      enterFollowCamera();
      return;
    }
    const timer = setTimeout(() => {
      gestureExitAtRef.current = null;
      enterFollowCamera();
    }, remaining);
    return () => clearTimeout(timer);
  }, [
    followDriver,
    offerPreviewActive,
    driverHasLocation,
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

  // Fase 3-D: lo que la tarjeta RENDERIZA (texto + «en X m»), no lo que
  // calcula guidance. En T4 veía «en 360 m» con el giro a ~60 m: sin esta
  // fila no se puede contrastar el valor mostrado con la distancia real.
  const lastCardKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!TRACE_REC_ENABLED || !navContent) return;
    const label = navContent.maneuverDistance ?? null;
    const key = `${navContent.main}|${label ?? "-"}`;
    if (lastCardKeyRef.current === key) return;
    lastCardKeyRef.current = key;
    traceRecorderRef.current?.recordCard({
      instruction: navContent.main ?? null,
      distanceLabel: label,
      shownDistanceM: parseDistanceLabelMeters(label),
      maneuver: navContent.maneuver ?? null,
      realDistanceToManeuverM:
        guidance?.distanceToManeuver != null
          ? Math.round(guidance.distanceToManeuver)
          : null,
    });
  }, [navContent, guidance?.distanceToManeuver, TRACE_REC_ENABLED]);

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
    if (!activeOrder) return false;
    // Fase 6-B: la etapa que el repartidor VE manda. Dentro de la geocerca
    // navPhase ya es at_pickup/at_delivery, pero `orderAction` solo cambia con
    // el siguiente sondeo (≤10 s): exigir orderAction.action dejaba el
    // deslizador sin efecto durante esa ventana. Se usa la MISMA transición
    // de servidor (picked_up/delivered), sin botones nuevos.
    const stageAction = stageActionFor(navPhase, orderAction?.action, activeOrder.serviceKind);
    if (!stageAction) return false;

    setActionLoading(activeOrder.orderNumber);
    setStageActionError(null);
    try {
      let result = await postDriverAction(stageAction, activeOrder.orderNumber);
      // Auto-recuperación: si el deslizaje ganó la carrera a la geocerca y
      // la llegada aún no estaba marcada (guarda "Acción no válida en estado
      // …"), marca la llegada y reintenta UNA vez la confirmación. Las demás
      // guardas (NIP requerido, bloqueado, expirado) se respetan tal cual.
      if (
        !result.ok &&
        result.error?.includes("Acción no válida en estado")
      ) {
        const arriveAction =
          stageAction === "picked_up" ? "pickup_arrival" : "destination_arrival";
        const arrival = await postDriverAction(arriveAction, activeOrder.orderNumber);
        if (arrival.ok) {
          result = await postDriverAction(stageAction, activeOrder.orderNumber);
        }
      }
      if (!result.ok) {
        setStageActionError(result.error ?? "No se pudo completar la acción.");
        return false;
      }
      if (stageAction === "picked_up") {
        // Fase 6-A3: sello de la confirmación que se ve en la traza.
        pickupConfirmedAtRef.current = Date.now();
      }
      if (stageAction === "delivered") {
        // Snapshot ANTES del refetch: con la entrega confirmada la orden
        // deja de aparecer en /api/driver/state.
        setLastDelivered({ order: activeOrder, at: Date.now() });
      }
      await refetch();
      return true;
    } finally {
      setActionLoading(null);
    }
  }, [activeOrder, orderAction, navPhase, postDriverAction, refetch, sim.active, simCommitOrders]);

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

  // ── Marcadores y capas del mapa (Mapbox) ─────────────────────────
  // La posición del conductor se mueve de forma IMPERATIVA con las refs. Las
  // props de capas se memorizan para que los ticks del simulador/GPS no vuelvan
  // a procesar la geometría estática de las rutas en Mapbox.
  const pinVariants = getDestinationPinVariants();
  const mapMarkers = useMemo<MapboxMapMarker[]>(() => {
    const markers: MapboxMapMarker[] = [
      {
        id: DRIVER_MARKER_ID,
        lat: initialDriverPosRef.current.lat,
        lng: initialDriverPosRef.current.lng,
        html: DRIVER_MARKER_HTML,
        anchor: "center",
        zIndex: 60,
      },
    ];

    if (activeOrder) {
      const storeArriving = navPhase === "to_pickup" && arrivingActive;
      markers.push({
        id: "drive-store-pin",
        lat: activeOrder.storeLat,
        lng: activeOrder.storeLng,
        html: destinationPinHtml(
          storeArriving ? pinVariants.store.arriving : pinVariants.store.standard,
          activeOrder.storeName
        ),
        anchor: "bottom",
        zIndex: 20,
      });

      const destArriving =
        (navPhase === "to_delivery" && arrivingActive) || navPhase === "at_delivery";
      markers.push({
        id: "drive-destination-pin",
        lat: activeOrder.destLat,
        lng: activeOrder.destLng,
        html: destinationPinHtml(
          destArriving ? pinVariants.dest.arriving : pinVariants.dest.standard,
          "Entrega"
        ),
        anchor: "bottom",
        zIndex: 20,
      });
    }

    if (offerPreview?.pickup) {
      markers.push({
        id: "offer-pickup-pin",
        lat: offerPreview.pickup.lat,
        lng: offerPreview.pickup.lng,
        html: destinationPinHtml(pinVariants.store.standard, offerPreview.pickupLabel),
        anchor: "bottom",
        zIndex: 20,
      });
    }
    if (offerPreview?.destination) {
      markers.push({
        id: "offer-destination-pin",
        lat: offerPreview.destination.lat,
        lng: offerPreview.destination.lng,
        html: destinationPinHtml(pinVariants.dest.standard, offerPreview.destinationLabel),
        anchor: "bottom",
        zIndex: 20,
      });
    }
    return markers;
  }, [activeOrder, navPhase, arrivingActive, offerPreview, pinVariants]);

  // Route line: SOLO la geometría vial real de Directions. Nunca se dibuja una
  // línea recta entre los dos puntos: si no hay ruta, no se dibuja nada.
  const mapLines = useMemo<MapboxMapLine[]>(() => {
    const lines: MapboxMapLine[] = [];
    if (roadRoute?.path) {
      lines.push({
        id: "drive-road-route",
        points: roadRoute.path,
        color: ROUTE_BLUE,
        width: 4,
        opacity: 0.7,
      });
    }

    // OFFER_ROUTE_PREVIEW — capa temporal de la oferta: ruta vial A → B +
    // marcadores temporales. NUNCA es la ruta de navegación.
    if (offerPreview?.route?.path) {
      lines.push({
        id: "offer-route-casing",
        points: offerPreview.route.path,
        color: "#FFFFFF",
        width: 7,
        opacity: 0.9,
      });
      lines.push({
        id: "offer-route",
        points: offerPreview.route.path,
        color: OFFER_PREVIEW_COLOR,
        width: 4,
        opacity: 0.95,
      });
    }
    return lines;
  }, [roadRoute, offerPreview]);

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
      {/* Panel de diagnóstico de sensores (solo staging): COLAPSADO por
          defecto para no tapar el mapa; se abre con el chip SENSORS. */}
      {sensorDebugVisible && !sensorPanelOpen && (
        <button
          type="button"
          aria-label="Abrir panel de diagnóstico"
          onClick={() => setSensorPanelOpen(true)}
          className="fixed left-3 top-1/2 z-40 -translate-y-1/2 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-white/70 shadow backdrop-blur-sm"
        >
          SENSORS{" "}
          {/* Fase 5-D: el hash del build se ve SIN abrir el panel ni exportar
              traza, para confirmar en el iPhone qué build está sirviendo
              staging. */}
          <span className="font-mono text-white/90">
            · {TraceRecorder.buildCommit().slice(0, 8)}
          </span>
        </button>
      )}
      {sensorDebugVisible && sensorPanelOpen && (
        <div className="fixed left-3 top-1/2 z-40 max-h-[70dvh] -translate-y-1/2 overflow-y-auto rounded-lg bg-black/70 px-3 py-2 text-[11px] leading-5 text-white/80 shadow-lg backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-white/90">SENSORS</span>
            <button
              type="button"
              aria-label="Cerrar panel de diagnóstico"
              onClick={() => setSensorPanelOpen(false)}
              className="rounded bg-white/15 px-1.5 text-[10px] font-semibold text-white"
            >
              ×
            </button>
          </div>
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
            <span className="font-mono text-white/90">              {/* Fase 2-C: velocidad VÁLIDA o "—". Un valor imposible se
                  descarta (antes se recortaba a 70 m/s y el panel mostraba
                  252 km/h antes del primer fix). */}
              {sim.active
                ? `${(SIM_BASE_METERS_PER_SECOND * sim.speed * 3.6).toFixed(1)} km/h`
                : hasValidSpeed(speedHeadingRef.current, Date.now())
                  ? `${((movementSpeedRef.current ?? 0) * 3.6).toFixed(1)} km/h`
                  : "—"}
            </span>
            <span className="ml-1 text-white/50">
              ({movementHeadingRef.current == null
                ? "rumbo N/A"
                : `${Math.round(movementHeadingRef.current)}°`})
            </span>
          </div>
          <div className="mt-0.5">
            <span className="text-white/60">Heading source:</span>
            <span className="font-mono text-white/90">
              {(() => {
                const dbg = driveHeadingResolverRef.current?.state.debug;
                if (dbg) {
                  // La brújula NUNCA controla la cámara si ya hay rumbo GPS:
                  // "device" solo puede aparecer en la adquisición inicial.
                  return dbg.source;
                }
                return gpsHeading != null
                  ? "gps"
                  : movementHeadingRef.current != null
                    ? "motion"
                    : "geometry";
              })()}
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
          {deviceOrientation.state.available === "permission_required" && (
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                disabled={deviceOrientation.state.permission === "denied"}
                onClick={() => {
                  void deviceOrientation.enable();
                }}
                className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-40"
              >
                Activar brújula
              </button>
              <span
                className={`text-[10px] font-semibold ${
                  deviceOrientation.state.permission === "denied"
                    ? "text-red-300"
                    : "text-white/60"
                }`}
              >
                {deviceOrientation.state.permission === "denied"
                  ? "Denegada: actívala en Ajustes de Safari"
                  : "Sin permiso (pendiente)"}
              </span>
            </div>
          )}
          {deviceOrientation.state.available === "available" &&
            deviceOrientation.state.permission === "granted" && (
              <div className="mt-1 text-[10px] font-semibold text-emerald-300">
                Brújula concedida
              </div>
            )}
          <div className="mt-0.5 flex items-center gap-2">
            {/* Fase 3.1-E: qué build se está probando (también va en la traza). */}
            <span className="text-white/60">Build:</span>
            <span
              className={
                TraceRecorder.buildCommit() === "dev" ||
                TraceRecorder.buildCommit() === "unknown"
                  ? "font-mono text-amber-300"
                  : "font-mono text-emerald-300"
              }
            >
              {TraceRecorder.buildCommit().slice(0, 8)}
            </span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            {/* Fase 4-D: prueba A/B del límite de cámara (solo staging). */}
            <span className="text-white/60">Cámara:</span>
            {([33, 16] as const).map((ms) => (
              <button
                key={ms}
                type="button"
                aria-pressed={cameraIntervalMs === ms}
                className={
                  cameraIntervalMs === ms
                    ? "rounded bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-black"
                    : "rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white"
                }
                onClick={() => {
                  setCameraIntervalMs(ms);
                  markDrive(`camera-interval-${ms}`);
                }}
              >
                {ms} ms
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            {/* Fase 6-A2: A/B del desfase — puck en GPS crudo vs visual. */}
            <span className="text-white/60">Puck:</span>
            <button
              type="button"
              aria-pressed={rawPuckDebug}
              className={
                rawPuckDebug
                  ? "rounded bg-amber-300 px-2 py-0.5 text-[10px] font-semibold text-black"
                  : "rounded bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white"
              }
              onClick={() => setRawPuckDebug((v) => !v)}
            >
              {rawPuckDebug ? "GPS crudo" : "visual"}
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-white/60">Traza:</span>
            <span className="font-mono text-white/90">
              {traceRecorderRef.current?.counts().gps ?? 0} GPS ·{" "}
              {traceRecorderRef.current?.counts().camera ?? 0} cám ·{" "}
              {traceRecorderRef.current?.counts().events ?? 0} ev
            </span>
          </div>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="rounded bg-white/15 px-2 py-1 text-[11px] font-semibold text-white"
              onClick={() => traceRecorderRef.current?.exportDownload()}
            >
              Exportar JSON
            </button>
            <button
              type="button"
              className="rounded bg-white/15 px-2 py-1 text-[11px] font-semibold text-white"
              onClick={() => traceRecorderRef.current?.clear()}
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {/* Map — pantalla completa como fondo; los overlays flotan encima.
          `isolate` crea un stacking context propio: los marcadores del mapa
          (puck, pines) no pueden pintarse POR ENCIMA de la tarjeta inferior. */}
      <div className="absolute inset-0 isolate">
        {driveStyleReady ? (
        <MapboxMap
          ref={mapHandleRef}
          className="h-full w-full"
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          styleUrl={DRIVE_MAP_STYLE_URL}
          styleSpec={driveStyle}
          rotate
          markers={mapMarkers}
          lines={mapLines}
          onLoad={handleMapLoad}
          onUnmount={handleMapUnmount}
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
        />
        ) : (
          <div className="flex h-full items-center justify-center bg-[#0d1526]">
            <Loader2 className="h-6 w-6 animate-spin text-white/40" />
          </div>
        )}

        {/* El simulador de navegación NO se expone en la interfaz del
            repartidor (ni en staging): el GPS siempre es real. El hook y el
            panel quedan solo como fixtures de pruebas automatizadas. */}
      </div>        {/* Barra compacta + tarjeta de maniobra (turn-by-turn) — flotan sobre
          el mapa en la parte superior. La posición respeta el notch/isla
          dinámica con env(safe-area-inset-top). */}
      {/* En "done" NO hay barra superior: sin estado, folio ni etiqueta SIM.
          La confirmación limpia de finalización vive solo en el panel inferior. */}
      {navContent && navPhase && navPhase !== "done" && !navContent.variant.startsWith("action") && (
        <div
          id="drive-top-overlay"
          className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-30"
        >
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
        id="drive-bottom-overlay"
        className="fixed inset-x-0 bottom-0 z-30"
        style={
          showingTripSheet && tripSheetCollapsedHeight != null
            ? { height: tripSheetCollapsedHeight }
            : undefined
        }
      >
        {/* RECENTR — único control de cámara, flotando SOBRE la tarjeta (en el
            mapa, no dentro de la hoja): justo encima del contenedor inferior,
            alineado a la derecha, fuera de la ruta y de las instrucciones.
            Aparece solo cuando el repartidor exploró el mapa (seguimiento
            inactivo); el seguimiento también se recupera solo al volver a
            conducir. */}
        {mapsLoaded && (
          <div className="absolute right-3 bottom-full z-10 mb-3">
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
