/**
 * Driver matching and ranking engine.
 *
 * Extracted from dispatch-core.ts to separate matching concerns.
 * Used by:
 *  - fetchDispatchSnapshot() — top-1 recommendation per order in Dispatch Center
 *  - recommendDriversForOrder() — assisted mode recommendations
 *  - dispatchSingleOffer() — auto-dispatch driver selection (Phase 2)
 *
 * Score formula (unchanged):
 *   load (30) + priority (30) + rating (20) + session (20) + typeBonus (10)
 *
 * Score 0..100 is relative to the best candidate in the set.
 */

import { type DispatchConfig } from "./dispatch-config";
import { estimateEtaMinutes } from "./dispatch-format";
import { deriveDriverEstado } from "./driver-state";
import type { DispatchDriverCard, DriverRecommendation } from "./dispatch-core";

// ── Geo utility ────────────────────────────────────────────────────

/**
 * Haversine distance in km between two points.
 * Kept here to avoid circular dependency with dispatch-core.ts.
 * (dispatch-core.ts re-exports this function for backward compatibility.)
 */
export function haversineKm(a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }): number | null {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lng) || !Number.isFinite(b.lat) || !Number.isFinite(b.lng)) {
    return null;
  }
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat! - a.lat!);
  const dLng = toRad(b.lng! - a.lng!);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat!)) * Math.cos(toRad(b.lat!)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Check if a driver is currently available for dispatch.
 * Mirrors the availability logic in lib/delivery-dispatch.ts:fetchCandidateDrivers().
 */
export function isDriverCandidateAvailable(driver: any, now: number): boolean {
  if (!driver.disponible) return false;
  if (driver.estadoDisponibilidad !== "available") return false;
  if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= now) return false;
  return true;
}

/**
 * Extract the origin coordinates (store or mandado pickup) from a raw order.
 */
function originPoint(order: any): { lat?: number; lng?: number } | undefined {
  const lat = order.storeLat;
  const lng = order.storeLng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

// ── Driver card builder (matching-local) ───────────────────────────

function buildDriverCardFromMatching(driver: any, now: number): DispatchDriverCard {
  const activeOrders = Array.isArray(driver.activeOrders) ? driver.activeOrders : [];
  const pendingCash = activeOrders
    .filter((order: any) => order.paymentMethod === "cash_on_delivery")
    .reduce((sum: number, order: any) => sum + Number(order.totalPrice ?? 0), 0);
  const connectedMinutes = driver.disponibleDesde
    ? Math.max(0, Math.round((now - new Date(driver.disponibleDesde).getTime()) / 60000))
    : 0;
  return {
    _id: driver._id,
    name: driver.nombre,
    phone: driver.telefono,
    activo: Boolean(driver.activo),
    bloqueado: Boolean(driver.bloqueado),
    disponible: Boolean(driver.disponible),
    estado: deriveDriverEstado(driver),
    prioridad: Number(driver.prioridad ?? 0),
    rating: Number.isFinite(driver.calificacion) ? Number(driver.calificacion) : null,
    fotoUrl: driver.fotoUrl ?? null,
    battery: Number.isFinite(driver.bateria) ? Number(driver.bateria) : null,
    storeId: driver.storeId ?? null,
    storeName: driver.storeName ?? null,
    connectedMinutes,
    availableUntil: driver.disponibleHasta,
    lastActivityAt: driver.ultimaActividad,
    lastLocation: driver.ultimaUbicacion ?? null,
    activeOrders,
    pendingCash: Math.round(pendingCash * 100) / 100,
    motivoDesconexion: driver.motivoDesconexion ?? null,
    ofertaExpiraAt: driver.ofertaExpiraAt ?? null,
    supportChat: Array.isArray(driver.supportChat) ? driver.supportChat : [],
  };
}

// ── Core ranking ───────────────────────────────────────────────────

/**
 * Rank candidate drivers for a given order.
 *
 * Returns drivers sorted by descending score (best candidate first).
 * Each candidate includes a `DispatchDriverCard` with all UI-ready fields,
 * a numeric `score` (0..100, relative to the best), and display `reasons`.
 *
 * Input shapes match raw Sanity documents (same as DRIVERS_QUERY output).
 * The order must have `orderType === "delivery"` and the fields from
 * ORDER_FOR_ASSIGN_QUERY / ACTIVE_ORDERS_QUERY.
 */
export function rankDriverCandidates(
  order: any,
  rawDrivers: any[],
  config: DispatchConfig,
  now = Date.now()
): DriverRecommendation[] {
  if (!order || order.orderType !== "delivery") return [];
  const origin = originPoint(order);

  const candidates = (rawDrivers ?? [])
    .filter((driver: any) => driver.activo && !driver.bloqueado)
    .filter((driver: any) => isDriverCandidateAvailable(driver, now))
    .filter((driver: any) => {
      const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
      if (!config.allowMultipleOrders && activeCount >= 1) return false;
      if (activeCount >= config.maxOrdersPerDriver) return false;
      if (order.storeHasOwnDelivery && order.storeId && driver.storeId && driver.storeId !== order.storeId && !config.allowMixStores) return false;
      if (order.serviceKind === "mandado" && driver.storeId && !config.allowMixRestaurantMandado) return false;
      return true;
    })
    .map((driver: any) => {
      const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
      const rating = Number.isFinite(driver.calificacion) ? Number(driver.calificacion) : 5;
      const prioridad = Number(driver.prioridad ?? 0);
      const connectedMinutes = driver.disponibleDesde
        ? Math.max(0, Math.round((now - new Date(driver.disponibleDesde).getTime()) / 60000))
        : 0;

      // Score 0..100: carga (30) + prioridad (30) + calificación (20) + antigüedad de sesión (20)
      // Si la config prioriza mandados/restaurantes, el tipo del pedido suma un bono.
      const loadScore = 30 * (1 - Math.min(1, activeCount / Math.max(1, config.maxOrdersPerDriver)));
      const priorityScore = 30 * Math.min(1, prioridad / 10);
      const ratingScore = 20 * (rating / 5);
      const sessionScore = 20 * Math.min(1, connectedMinutes / 240);
      const typeBonus =
        (order.serviceKind === "mandado" && config.prioritizeMandados) ||
        (order.serviceKind !== "mandado" && config.prioritizeRestaurants)
          ? 10
          : 0;
      const raw = loadScore + priorityScore + ratingScore + sessionScore + typeBonus;

      // Distancia y ETA solo si el repartidor reportó ubicación (datos reales).
      const loc = driver.ultimaUbicacion;
      const distanceKm =
        origin && loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)
          ? haversineKm({ lat: loc.lat, lng: loc.lng }, { lat: origin.lat, lng: origin.lng })
          : null;
      const estimatedMinutes = estimateEtaMinutes(distanceKm);

      return {
        raw,
        loadScore,
        driver: buildDriverCardFromMatching(driver, now),
        load: activeCount,
        distanceKm,
        estimatedMinutes,
      };
    });

  const maxRaw = candidates.length > 0 ? Math.max(...candidates.map((candidate: any) => candidate.raw)) : 0;

  const reasons = (candidate: any) => {
    const list: string[] = [];
    if (candidate.load === 0) list.push("Sin pedidos activos");
    else list.push(`${candidate.load} pedido(s) activo(s)`);
    if (candidate.driver.prioridad > 0) list.push("Prioridad alta");
    if ((candidate.driver.rating ?? 0) >= 4.7) list.push("Mejor calificación");
    if (candidate.distanceKm != null) list.push(`A ${candidate.distanceKm} km del origen`);
    return list.slice(0, 3);
  };

  return candidates
    .sort((a: any, b: any) => b.raw - a.raw)
    .map((candidate: any) => ({
      driver: candidate.driver,
      score: maxRaw > 0 ? Math.round((candidate.raw / maxRaw) * 100) : 100,
      load: candidate.load,
      estimatedMinutes: candidate.estimatedMinutes,
      distanceKm: candidate.distanceKm,
      reasons: reasons(candidate),
    }));
}
