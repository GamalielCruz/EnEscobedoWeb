/**
 * Capa aislada de routing vial para el mapa del repartidor.
 *
 * Usa la API de Google Maps Directions (client-side, misma clave
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY que ya carga la página del repartidor)
 * y devuelve la geometría de la ruta + distancia + duración.
 *
 * CACHÉ: la ruta se reutiliza mientras el destino siga siendo el mismo y el
 * origen no se mueva más de ROUTE_REUSE_METERS. Las actualizaciones
 * frecuentes de GPS dentro de ese umbral NO disparan llamadas de routing.
 *
 * FALLBACK: si la API falla, tarda demasiado o no hay ruta, devuelve null;
 * el mapa cae a la línea recta y la vista nunca se rompe.
 */

export type RoutePoint = { lat: number; lng: number };

export type RoadRoute = {
  path: RoutePoint[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  distanceText: string | null;
  durationText: string | null;
};

/** El origen debe moverse más que esto para recalcular la ruta (≈200 m). */
const ROUTE_REUSE_METERS = 200;
/** Si Directions no responde en este tiempo, se devuelve null (fallback). */
const ROUTE_TIMEOUT_MS = 6_000;
const MAX_CACHE_ENTRIES = 4;

type CachedRoute = {
  origin: RoutePoint;
  destination: RoutePoint;
  route: RoadRoute;
};

type InFlightRoute = {
  origin: RoutePoint;
  destination: RoutePoint;
  promise: Promise<RoadRoute | null>;
};

const routeCache = new Map<string, CachedRoute>();
const inFlight = new Map<string, InFlightRoute>();

function haversineMeters(a: RoutePoint, b: RoutePoint): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const snap = (value: number, decimals = 3) => Math.round(value * 10 ** decimals) / 10 ** decimals;

const cacheKeyFor = (origin: RoutePoint, destination: RoutePoint) =>
  `${snap(origin.lat)},${snap(origin.lng)}|${snap(destination.lat)},${snap(destination.lng)}`;

function isLoaded(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.google !== "undefined" &&
    typeof window.google.maps?.DirectionsService === "function"
  );
}

function requestDirections(origin: RoutePoint, destination: RoutePoint): Promise<RoadRoute | null> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, ROUTE_TIMEOUT_MS);

    try {
      const service = new window.google.maps.DirectionsService();
      service.route(
        { origin, destination, travelMode: window.google.maps.TravelMode.DRIVING },
        (result, status) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);

          const route = result?.routes?.[0];
          const leg = route?.legs?.[0];
          const path = route?.overview_path;
          if (status !== "OK" || !Array.isArray(path) || path.length < 2) {
            resolve(null);
            return;
          }

          resolve({
            path: path.map((point) => ({ lat: point.lat(), lng: point.lng() })),
            distanceMeters: leg?.distance?.value ?? null,
            durationSeconds: leg?.duration?.value ?? null,
            distanceText: leg?.distance?.text ?? null,
            durationText: leg?.duration?.text ?? null,
          });
        }
      );
    } catch {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

/**
 * Ruta vial entre `origin` y `destination`, con caché y dedupe de llamadas
 * concurrentes. Devuelve null si no hay API disponible o la ruta falla.
 */
export async function getRoadRoute(
  origin: RoutePoint,
  destination: RoutePoint
): Promise<RoadRoute | null> {
  if (!isLoaded()) return null;

  // Caché: mismo destino y origen sin moverse más que el umbral → reutilizar
  // sin llamar a la API (las actualizaciones de GPS frecuentes caen aquí).
  for (const entry of routeCache.values()) {
    if (
      haversineMeters(entry.destination, destination) < ROUTE_REUSE_METERS &&
      haversineMeters(entry.origin, origin) < ROUTE_REUSE_METERS
    ) {
      return entry.route;
    }
  }

  const key = cacheKeyFor(origin, destination);

  // Dedupe de llamadas concurrentes: si ya hay una petición en vuelo para
  // el mismo tramo (misma lógica de proximidad que el caché), reutilizarla.
  // Evita que ticks de GPS mientras una petición está en vuelo disparen
  // llamadas nuevas a la API.
  for (const entry of inFlight.values()) {
    if (
      haversineMeters(entry.destination, destination) < ROUTE_REUSE_METERS &&
      haversineMeters(entry.origin, origin) < ROUTE_REUSE_METERS
    ) {
      return entry.promise;
    }
  }

  const request = requestDirections(origin, destination);
  inFlight.set(key, { origin, destination, promise: request });
  try {
    const route = await request;
    if (route) {
      routeCache.set(key, { origin, destination, route });
      while (routeCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = routeCache.keys().next().value;
        if (oldestKey === undefined) break;
        routeCache.delete(oldestKey);
      }
    }
    return route;
  } finally {
    inFlight.delete(key);
  }
}