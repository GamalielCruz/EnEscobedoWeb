/**
 * Estilos y colores de marca para el mapa del repartidor.
 *
 * Paleta de facto de ElMenu (ver Fase 0): navy #09193B + rojo #EB1902.
 * El estilo del mapa ahora es un estilo de Mapbox (ya no un JSON de estilos de
 * Google Maps): se define con MAPBOX_STYLE_* en lib/mapbox.ts y puede
 * sustituirse por un estilo propio (mapbox://styles/<usuario>/<id>) sin tocar
 * la página del repartidor.
 *
 * La ruta vial se dibuja en azul ROUTE_BLUE para que destaque sobre el mapa
 * claro; el puck del repartidor usa el mismo azul.
 */

import type { StyleSpecification } from "mapbox-gl";
import { MAPBOX_PUBLIC_TOKEN, MAPBOX_STYLE_LIGHT } from "@/lib/mapbox";

export const BRAND_NAVY = "#09193B";
export const BRAND_RED = "#EB1902";
export const BRAND_RED_DARK = "#850C22";
/** Línea de ruta y puck del repartidor (contraste sobre el mapa claro). */
export const ROUTE_BLUE = "#3B82F6";
export const PICKUP_ORANGE = "#F97316";
export const DELIVERY_RED = "#EF4444";
/**
 * Línea del preview de oferta (OFFER_ROUTE_PREVIEW): violeta de contraste
 * frente al azul de la ruta de navegación activa, para que el repartidor
 * distinga de un vistazo el recorrido A → B mostrado durante una oferta.
 */
export const OFFER_PREVIEW_COLOR = "#7C3AED";

/**
 * Estilo claro "de navegación": vías con perfil sutil y POI atenuado para que
 * la ruta azul y los marcadores sean lo único llamativo de la pantalla
 * mientras el conductor maneja.
 */
export const DRIVE_MAP_STYLE_URL =
  process.env.NEXT_PUBLIC_MAPBOX_DRIVE_STYLE?.trim() || MAPBOX_STYLE_LIGHT;

// ─────────────────────────────────────────────────────────────────────────────
// Estilo de MARCA (antes el JSON de estilos de Google importado al Map ID).
//
// Se construye a partir de streets-v12 y se recolorea con la paleta de
// navegación de ElMenu: fondo #EEF1F5, vías blancas con perfil gris claro,
// autopistas en ámbar suave, agua #CDD9E8, parques #DBE7D8, límites #C9D0D9
// y SIN POIs, transporte público ni etiquetas de agua: la ruta azul, los pines
// y el puck del repartidor deben ser lo único llamativo en movimiento.
// ─────────────────────────────────────────────────────────────────────────────

const DRIVE_PALETTE = {
  base: "#EEF1F5",
  water: "#CDD9E8",
  park: "#DBE7D8",
  land: "#E9EDF2",
  building: "#E4E9F0",
  road: "#FFFFFF",
  roadCase: "#D3DAE3",
  highway: "#F9E9B8",
  highwayCase: "#E6C96F",
  admin: "#C9D0D9",
  text: "#4D5A6B",
  halo: "#EEF1F5",
} as const;

/** Capas cuyo texto ensucia el mapa mientras se conduce: fuera. */
const HIDDEN_LAYER_IDS = new Set([
  "poi-label",
  "transit-label",
  "water-line-label",
  "water-point-label",
  "waterway-label",
  "waterway-shadow",
  "hillshade",
  "building-underground",
  "pitch-outline",
  "crosswalks",
  "block-number-label",
  "building-entrance",
  "building-number-label",
  "golf-hole-label",
  "ferry-aerialway-label",
  "admin-0-boundary-disputed",
]);

type MapboxLayer = {
  id?: string;
  type?: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
};

function recolorLayer(layer: MapboxLayer): void {
  const id = layer.id ?? "";
  const paint = (layer.paint ??= {});
  const layout = (layer.layout ??= {});

  if (HIDDEN_LAYER_IDS.has(id)) {
    layout.visibility = "none";
    return;
  }

  const isHighway = /motorway|trunk/.test(id);
  const isRoadCase = id.endsWith("-case") || id.endsWith("-bg");
  const isRoad =
    id.startsWith("road-") || id.startsWith("bridge-") || id.startsWith("tunnel-");

  if (layer.type === "background") {
    paint["background-color"] = DRIVE_PALETTE.base;
  } else if (id.startsWith("water")) {
    if (paint["fill-color"] != null) paint["fill-color"] = DRIVE_PALETTE.water;
    if (paint["line-color"] != null) paint["line-color"] = DRIVE_PALETTE.water;
  } else if (id.startsWith("landuse") || id.startsWith("landcover")) {
    if (paint["fill-color"] != null) {
      paint["fill-color"] = id.startsWith("national-park") ? DRIVE_PALETTE.park : DRIVE_PALETTE.land;
    }
  } else if (id.startsWith("national-park")) {
    paint["fill-color"] = DRIVE_PALETTE.park;
  } else if (id.startsWith("land-structure")) {
    if (paint["fill-color"] != null) paint["fill-color"] = DRIVE_PALETTE.building;
    if (paint["line-color"] != null) paint["line-color"] = DRIVE_PALETTE.roadCase;
  } else if (id.startsWith("building")) {
    paint["fill-color"] = DRIVE_PALETTE.building;
  } else if (id.startsWith("admin")) {
    if (paint["line-color"] != null) paint["line-color"] = DRIVE_PALETTE.admin;
  } else if (id.startsWith("ferry")) {
    if (paint["line-color"] != null) paint["line-color"] = "#A9BCD3";
  } else if (id.startsWith("aeroway")) {
    if (paint["fill-color"] != null) paint["fill-color"] = DRIVE_PALETTE.land;
    if (paint["line-color"] != null) paint["line-color"] = DRIVE_PALETTE.roadCase;
  } else if (id.startsWith("aerialway")) {
    paint["line-color"] = "#A9B6C6";
  } else if (isRoad) {
    if (layer.type === "fill") {
      paint["fill-color"] = DRIVE_PALETTE.road;
    } else if (layer.type === "line") {
      if (isRoadCase) {
        paint["line-color"] = isHighway ? DRIVE_PALETTE.highwayCase : DRIVE_PALETTE.roadCase;
      } else {
        paint["line-color"] = isHighway ? DRIVE_PALETTE.highway : DRIVE_PALETTE.road;
      }
    } else if (layer.type === "symbol") {
      paint["text-color"] = DRIVE_PALETTE.text;
      paint["text-halo-color"] = DRIVE_PALETTE.halo;
    }
  } else if (id.startsWith("turning-feature")) {
    if (paint["circle-color"] != null) paint["circle-color"] = DRIVE_PALETTE.road;
    if (paint["circle-stroke-color"] != null) paint["circle-stroke-color"] = DRIVE_PALETTE.roadCase;
  }

  if (layer.type === "symbol") {
    if (paint["text-color"] != null) paint["text-color"] = DRIVE_PALETTE.text;
    if (paint["text-halo-color"] != null) paint["text-halo-color"] = DRIVE_PALETTE.halo;
  }
}

// Cache del estilo: se pide UNA vez por sesión y se comparte entre mapas.
let driveStylePromise: Promise<StyleSpecification | null> | null = null;

/**
 * Estilo de marca del mapa del repartidor (streets-v12 recoloreado).
 * Devuelve null si Mapbox no responde: la página cae al estilo claro por
 * defecto (DRIVE_MAP_STYLE_URL) en lugar de quedar sin mapa.
 */
export function loadDriveMapStyle(): Promise<StyleSpecification | null> {
  if (driveStylePromise) return driveStylePromise;

  driveStylePromise = (async () => {
    const base =
      process.env.NEXT_PUBLIC_MAPBOX_DRIVE_STYLE_SOURCE?.trim() ||
      "mapbox/streets-v12";
    const response = await fetch(
      `https://api.mapbox.com/styles/v1/${base}?access_token=${MAPBOX_PUBLIC_TOKEN}`,
      { next: { revalidate: 86400 } }
    );
    if (!response.ok) return null;
    const style = (await response.json()) as StyleSpecification & {
      layers?: MapboxLayer[];
    };
    if (!Array.isArray(style.layers)) return null;

    for (const layer of style.layers) {
      try {
        recolorLayer(layer);
      } catch {
        // Un layer raro no debe tumbar el mapa completo.
      }
    }

    // Transiciones suaves entre zooms (el mapa del driver anima cámara seguido).
    style.transition = { duration: 300, delay: 0 };
    return style;
  })().catch(() => {
    driveStylePromise = null;
    return null;
  });

  return driveStylePromise;
}
