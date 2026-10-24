// ─────────────────────────────────────────────────────────────────────────────
// Capa central de Mapbox (sustituye a los helpers de Google Maps).
//
// Centraliza token, estilos, geocodificación (forward/reverse) y ruteo vial
// para todo el sitio: basket, tiendas/restaurantes, drive, mandados y admin.
// Es client-safe y server-safe: solo usa fetch, nunca `mapbox-gl` (el mapa se
// importa dinámicamente desde el componente).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Token público por defecto (pk.*). Se puede sobreescribir con
 * NEXT_PUBLIC_MAPBOX_TOKEN al compilar. Deliberadamente incluido como
 * fallback para que la app siga funcionando; el token es público por diseño.
 */
export const MAPBOX_DEFAULT_TOKEN =
  "pk.eyJ1IjoiZ2FtYWxpZWxjcnV6IiwiYSI6ImNtc2dzeWxzdTBsZmQyeXBuaTMweXJ0a3QifQ.iIiG3hft-jN6lAUaWIogoA";

/** Token para el navegador (mapa + geocoding + directions). */
export const MAPBOX_PUBLIC_TOKEN =
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() || MAPBOX_DEFAULT_TOKEN;

/** Token para llamadas desde el servidor (geocodificación en API routes). */
export const MAPBOX_ACCESS_TOKEN =
  process.env.MAPBOX_ACCESS_TOKEN?.trim() || MAPBOX_PUBLIC_TOKEN;

/** Estilos oficiales de Mapbox que usa el sitio. */
// `light-v11`: fondo blanco/gris neutro y POIs mínimos, coherente con la UI
// clara de la app (en vez del beige de streets-v12).
export const MAPBOX_STYLE_LIGHT = "mapbox://styles/mapbox/light-v11";
export const MAPBOX_STYLE_NAVIGATION = "mapbox://styles/mapbox/navigation-day-v1";
export const MAPBOX_STYLE_DARK = "mapbox://styles/mapbox/dark-v11";

/** Centro por defecto (Querétaro / Pedro Escobedo). */
export const MAPBOX_DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };

export type MapboxPoint = { lat: number; lng: number };

export type MapboxGeocodeResult = {
  id: string | null;
  /** Texto completo listo para mostrar/guardar. */
  label: string;
  fullAddress: string;
  /** Vialidad con número (o nombre del lugar). */
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
};

type MapboxContextEntry = {
  name?: string;
  address_number?: string;
  street_name?: string;
  region_code?: string;
  country_code?: string;
};

type MapboxV6Feature = {
  id?: string;
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    coordinates?: { longitude?: number; latitude?: number };
    context?: Record<string, MapboxContextEntry | undefined>;
  };
};

const GEOCODE_BASE = "https://api.mapbox.com/search/geocode/v6";

function timeoutSignal(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal === "undefined") return undefined;
  return typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(ms)
    : undefined;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Convierte una feature de Mapbox Geocoding v6 en los campos estructurados que
 * usa el sitio. Nunca lanza: devuelve null si no hay coordenadas válidas.
 */
export function parseMapboxFeature(feature: MapboxV6Feature): MapboxGeocodeResult | null {
  const props = feature.properties ?? {};
  const context = props.context ?? {};
  const latitude =
    finiteNumber(props.coordinates?.latitude) ??
    finiteNumber(feature.geometry?.coordinates?.[1]);
  const longitude =
    finiteNumber(props.coordinates?.longitude) ??
    finiteNumber(feature.geometry?.coordinates?.[0]);

  if (latitude === null || longitude === null) return null;

  const addressContext = context.address;
  const streetName = addressContext?.street_name ?? context.street?.name ?? "";
  const addressNumber = addressContext?.address_number ?? "";
  const street =
    [streetName, addressNumber].filter(Boolean).join(" ").trim() ||
    context.street?.name ||
    props.name ||
    "";

  const city =
    context.place?.name ||
    context.locality?.name ||
    context.district?.name ||
    "";
  const state = context.region?.name || "";
  const postalCode = context.postcode?.name || "";
  const country = context.country?.name || "México";

  const fullAddress =
    props.full_address ||
    props.place_formatted ||
    [props.name, city, state, postalCode, country].filter(Boolean).join(", ");

  return {
    id: feature.id ?? null,
    label: fullAddress,
    fullAddress,
    street: street || props.name || fullAddress,
    city,
    state,
    postalCode,
    country,
    latitude,
    longitude,
  };
}

export type MapboxForwardOptions = {
  limit?: number;
  country?: string;
  proximity?: MapboxPoint;
  types?: string;
  language?: string;
};

/**
 * Geocodificación directa (texto → coordenadas + dirección estructurada).
 * Devuelve [] si Mapbox no encuentra resultados o falla la petición.
 */
export async function mapboxForwardGeocode(
  query: string,
  options: MapboxForwardOptions = {}
): Promise<MapboxGeocodeResult[]> {
  const text = query?.trim();
  if (!text) return [];

  const url = new URL(`${GEOCODE_BASE}/forward`);
  url.searchParams.set("q", text);
  url.searchParams.set("access_token", MAPBOX_PUBLIC_TOKEN);
  url.searchParams.set("language", options.language ?? "es");
  url.searchParams.set("limit", String(options.limit ?? 5));
  if (options.country !== "") {
    url.searchParams.set("country", options.country ?? "mx");
  }
  if (options.types) url.searchParams.set("types", options.types);
  if (options.proximity) {
    url.searchParams.set(
      "proximity",
      `${options.proximity.lng},${options.proximity.lat}`
    );
  }

  try {
    const response = await fetch(url.toString(), { signal: timeoutSignal(8000) });
    if (!response.ok) return [];
    const data = (await response.json()) as { features?: MapboxV6Feature[] };
    return (data.features ?? [])
      .map(parseMapboxFeature)
      .filter((result): result is MapboxGeocodeResult => result !== null);
  } catch {
    return [];
  }
}

/** Geocodificación inversa (coordenadas → dirección legible). */
export async function mapboxReverseGeocode(
  lat: number,
  lng: number,
  options: { language?: string; types?: string } = {}
): Promise<MapboxGeocodeResult | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const url = new URL(`${GEOCODE_BASE}/reverse`);
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("access_token", MAPBOX_PUBLIC_TOKEN);
  url.searchParams.set("language", options.language ?? "es");
  url.searchParams.set("limit", "1");
  if (options.types) url.searchParams.set("types", options.types);

  try {
    const response = await fetch(url.toString(), { signal: timeoutSignal(8000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: MapboxV6Feature[] };
    const feature = data.features?.[0];
    const parsed = feature ? parseMapboxFeature(feature) : null;
    if (!parsed) return null;
    // La geometría pedida manda sobre la del resultado (punto exacto tocado).
    return { ...parsed, latitude: lat, longitude: lng };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ruteo vial (Directions API)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maniobra normalizada con el vocabulario que ya consume
 * lib/dispatch/nav-instructions.ts ("turn-left", "roundabout-right", ...).
 */
export function mapboxManeuver(
  type: string | undefined,
  modifier: string | undefined
): string {
  const t = (type ?? "").toLowerCase();
  const m = (modifier ?? "").toLowerCase();

  if (t === "depart") return "depart";
  if (t === "arrive") return "arrive";
  if (t.includes("roundabout") || t === "rotary" || t === "exit rotary") {
    if (m.includes("uturn")) return "roundabout-uturn";
    if (m.includes("left")) return "roundabout-left";
    return "roundabout-right";
  }
  if (t === "merge") return "merge";
  if (t.includes("ramp") || t === "on ramp" || t === "off ramp") {
    return m.includes("left") ? "ramp-left" : "ramp-right";
  }
  if (t === "fork") {
    if (m.includes("left")) return "fork-left";
    if (m.includes("right")) return "fork-right";
    return "straight";
  }
  if (m === "uturn" || m === "u-turn") return "uturn";
  if (m === "sharp left" || m === "sharp right") {
    return m === "sharp left" ? "turn-sharp-left" : "turn-sharp-right";
  }
  if (m === "slight left" || m === "slight right") {
    return m === "slight left" ? "turn-slight-left" : "turn-slight-right";
  }
  if (m === "left") return "turn-left";
  if (m === "right") return "turn-right";
  if (t === "end of road") {
    if (m.includes("left")) return "turn-left";
    if (m.includes("right")) return "turn-right";
  }
  return "straight";
}

export type MapboxRouteStep = {
  instruction: string;
  maneuver: string;
  distanceMeters: number;
  durationSeconds: number;
  start: MapboxPoint;
  end: MapboxPoint;
};

export type MapboxRoadRoute = {
  path: MapboxPoint[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  distanceText: string | null;
  durationText: string | null;
  steps: MapboxRouteStep[];
  destination: MapboxPoint;
};

export type MapboxDirectionsOptions = {
  profile?: "driving" | "driving-traffic" | "walking" | "cycling";
  waypoints?: MapboxPoint[];
  language?: string;
  steps?: boolean;
};

export function formatDistanceText(meters: number | null): string | null {
  if (meters === null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDurationText(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/**
 * Ruta vial real entre dos puntos (con waypoints opcionales).
 * Devuelve null si no hay ruta o falla la petición.
 */
export async function mapboxDirections(
  origin: MapboxPoint,
  destination: MapboxPoint,
  options: MapboxDirectionsOptions = {}
): Promise<MapboxRoadRoute | null> {
  const coordinates = [origin, ...(options.waypoints ?? []), destination]
    .map((point) => `${point.lng},${point.lat}`)
    .join(";");
  const profile = options.profile ?? "driving";

  const url = new URL(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}`);
  url.searchParams.set("geometries", "geojson");
  url.searchParams.set("overview", "full");
  url.searchParams.set("access_token", MAPBOX_PUBLIC_TOKEN);
  if (options.steps !== false) url.searchParams.set("steps", "true");
  url.searchParams.set("language", options.language ?? "es");

  try {
    const response = await fetch(url.toString(), { signal: timeoutSignal(8000) });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: Array<{
        distance?: number;
        duration?: number;
        geometry?: { coordinates?: number[][] };
        legs?: Array<{
          steps?: Array<{
            distance?: number;
            duration?: number;
            maneuver?: {
              type?: string;
              modifier?: string;
              instruction?: string;
              location?: number[];
            };
          }>;
        }>;
      }>;
    };

    const route = data.routes?.[0];
    const rawPath = route?.geometry?.coordinates ?? [];
    const path = rawPath
      .map(([lng, lat]) => ({ lat, lng }))
      .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
    if (path.length < 2) return null;

    const steps: MapboxRouteStep[] = [];
    for (const leg of route?.legs ?? []) {
      for (const step of leg.steps ?? []) {
        const location = step.maneuver?.location;
        if (!location || location.length < 2) continue;
        const point = { lat: location[1], lng: location[0] };
        steps.push({
          instruction: step.maneuver?.instruction ?? "",
          maneuver: mapboxManeuver(step.maneuver?.type, step.maneuver?.modifier),
          distanceMeters: step.distance ?? 0,
          durationSeconds: step.duration ?? 0,
          start: point,
          end: point,
        });
      }
    }

    // Mapbox solo expone el punto de INICIO de cada paso: el fin de un paso
    // es el inicio del siguiente y el del último es el destino.
    for (let i = 0; i < steps.length; i++) {
      steps[i].end = steps[i + 1]?.start ?? destination;
    }

    const distanceMeters = route?.distance ?? null;
    const durationSeconds = route?.duration ?? null;

    return {
      path,
      distanceMeters,
      durationSeconds,
      distanceText: formatDistanceText(distanceMeters),
      durationText: formatDurationText(durationSeconds),
      steps,
      destination,
    };
  } catch {
    return null;
  }
}
