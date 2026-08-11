import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { appendOrderEvent } from "@/lib/order-events";
import { buildLegacyStatus, isOrderDispatchable } from "@/lib/order-state";
import { releaseOrdersForDriver } from "@/lib/delivery-dispatch";
import { sendBotMessage, sendDriverConfirmation } from "@/lib/whatsapp";
import {
  getDispatchConfig,
  saveDispatchConfig,
  type DispatchConfig,
  type DispatchMode,
} from "@/lib/dispatch/dispatch-config";
import { normalizeDeliveryConfig } from "@/lib/delivery-zones";
import { estimateEtaMinutes, formatWaitingTime, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import { validateAssignment } from "@/lib/dispatch/dispatch-validation";
import { backendClient } from "@/sanity/lib/backendClient";
import { NextResponse } from "next/server";

// ────────────────────────────────────────────────────────────────────
// Tipos del Dispatch Center
// ────────────────────────────────────────────────────────────────────

export type DispatchOrderCard = {
  _id: string;
  orderNumber: string;
  serviceKind: "restaurant" | "mandado";
  storeName: string;
  destLabel: string;
  storeLat?: number;
  storeLng?: number;
  destLat?: number;
  destLng?: number;
  routeKm: number | null;
  waitingMinutes: number;
  priority: "urgent" | "high" | "normal";
  paymentLabel: string;
  totalPrice: number;
  dispatchStatus: string;
  orderStatus: string;
  fulfillmentTiming: string;
  scheduledSlot?: { startAt?: string; endAt?: string } | null;
  driverId?: string | null;
  driverName?: string | null;
  storeId?: string | null;
  storeHasOwnDelivery?: boolean;
  offerExpiresAt?: string | null;
  // Oferta pendiente por WhatsApp (mandados en modo manual/asistido y cualquier
  // pedido en modo auto): el pedido NO está asignado, pero un repartidor tiene
  // una oferta vigente (dispatchStatus == "offered").
  offerDriverId?: string | null;
  offerDriverName?: string | null;
  customerHelpRequested?: boolean;
  // Mejor candidato calculado con la MISMA lógica de dispatch (top-1).
  recommendedDriverId?: string | null;
  recommendedDriverName?: string | null;
  recommendedScore?: number | null;
};

export type SupportChatMessage = {
  role: "driver" | "admin";
  body: string;
  createdAt?: string;
  readAt?: string | null;
};

export type DispatchDriverCard = {
  _id: string;
  name: string;
  phone: string;
  activo: boolean;
  bloqueado: boolean;
  disponible: boolean;
  estado: "available" | "offline" | "busy" | "offer_pending" | "paused" | "blocked";
  prioridad: number;
  rating: number | null;
  fotoUrl: string | null;
  battery: number | null;
  storeId?: string | null;
  storeName: string | null;
  connectedMinutes: number;
  availableUntil?: string;
  lastActivityAt?: string;
  lastLocation?: { lat?: number; lng?: number; reportedAt?: string } | null;
  activeOrders: Array<{ orderNumber: string; totalPrice?: number; paymentMethod?: string }>;
  pendingCash: number;
  motivoDesconexion?: string | null;
  ofertaExpiraAt?: string | null;
  // Conversación de soporte entre el repartidor y el Dispatch Center
  // (mensajes reales del repartidor vía WhatsApp + respuestas del operador).
  supportChat: SupportChatMessage[];
};

export type DispatchKpis = {
  pendingOrders: number;
  assignedOrders: number;
  availableDrivers: number;
  busyDrivers: number;
  offlineDrivers: number;
  registeredDrivers: number;
  connectedDrivers: number;
  pausedDrivers: number;
  avgAssignmentMinutes: number | null;
  avgDeliveryMinutes: number | null;
};

export type DispatchAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail?: string;
  orderId?: string;
  driverId?: string;
};

export type DriverRecommendation = {
  driver: DispatchDriverCard;
  score: number; // 0..100 (porcentaje relativo al mejor candidato)
  load: number;
  estimatedMinutes: number | null;
  distanceKm: number | null;
  reasons: string[];
};

export type DispatchSnapshot = {
  orders: DispatchOrderCard[];
  drivers: DispatchDriverCard[];
  kpis: DispatchKpis;
  alerts: DispatchAlert[];
  config: DispatchConfig;
  zones: Array<{ id: string; name: string; color?: string; coordinates: Array<{ lat: number; lng: number }> }>;
  stores: Array<{ _id: string; name: string; lat?: number; lng?: number; address?: string }>;
  generatedAt: string;
};

export type AuditEntry = {
  _id: string;
  action: string;
  mode?: string;
  actorName?: string;
  orderNumber?: string;
  reason?: string;
  responseTimeSeconds?: number;
  createdAt?: string;
  previousDriverName?: string;
  newDriverName?: string;
  driverName?: string;
  details?: string;
};

// ────────────────────────────────────────────────────────────────────
// Utilidades
// ────────────────────────────────────────────────────────────────────

export function haversineKm(a?: { lat?: number; lng?: number }, b?: { lat?: number; lng?: number }) {
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

export async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  if (!isAdminUser(userId)) return { error: NextResponse.json({ error: "Sin permisos" }, { status: 403 }) };
  return { userId };
}

// ────────────────────────────────────────────────────────────────────
// Consultas GROQ
// ────────────────────────────────────────────────────────────────────

const ACTIVE_ORDERS_QUERY = `*[
  _type == "order" &&
  !(_id in path("drafts.**")) &&
  orderType == "delivery" &&
  dispatchStatus != "not_required" &&
  dispatchStatus != "completed" &&
  dispatchStatus != "scheduled" &&
  status != "cancelled" && status != "delivered" && status != "refunded" &&
  orderStatus != "cancelled" && orderStatus != "delivered" && orderStatus != "completed" && orderStatus != "picked_up" &&
  paymentStatus != "failed" && paymentStatus != "expired" && paymentStatus != "refunded" && paymentStatus != "requires_refund"
] | order(orderDate asc)[0...150]{
  _id,
  orderNumber,
  serviceKind,
  orderType,
  orderStatus,
  dispatchStatus,
  status,
  paymentMethod,
  paymentStatus,
  totalPrice,
  grossTotal,
  orderDate,
  fulfillmentTiming,
  scheduledSlot,
  repartidorAsignadoAt,
  "driverId": repartidorAsignado._ref,
  "driverName": repartidorAsignado->nombre,
  "storeId": affiliateStore._ref,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
  deliveryOfertaExpiresAt,
  "offerDriverId": offeredTo._ref,
  "offerDriverName": offeredTo->nombre,
  customerHelpRequested,
  scheduledDispatchStartedAt,
  repartidorAsignadoAt
}`;

// GROQ no soporta slices con ":" (ni abiertos): se usan índices negativos
// constantes con el operador de rango para tomar los últimos 15 mensajes.
const DRIVERS_QUERY = `*[_type == "repartidor"] | order(prioridad desc, nombre asc){
  _id,
  nombre,
  telefono,
  activo,
  disponible,
  bloqueado,
  prioridad,
  calificacion,
  disponibleDesde,
  disponibleHasta,
  estadoDisponibilidad,
  ultimaActividad,
  bateria,
  ultimaUbicacion,
  motivoDesconexion,
  ofertaExpiraAt,
  "fotoUrl": foto.asset->url,
  "storeId": tiendaAsignada._ref,
  "storeName": tiendaAsignada->name,
  "supportChat": coalesce(soporteChat[-15..-1]{ role, body, createdAt, readAt }, []),
  "activeOrders": *[
    _type == "order" &&
    repartidorAsignado._ref == ^._id &&
    status == "shipped" &&
    orderStatus != "delivered" &&
    orderStatus != "cancelled" &&
    orderStatus != "completed"
  ]{ orderNumber, totalPrice, paymentMethod }
}`;

const ASSIGNMENT_STATS_QUERY = `*[_type == "order" && defined(repartidorAsignadoAt) && defined(orderDate)] | order(repartidorAsignadoAt desc)[0...50]{ orderDate, repartidorAsignadoAt }`;

const DELIVERY_STATS_QUERY = `*[_type == "order" && defined(deliveredAt) && defined(orderDate)] | order(deliveredAt desc)[0...50]{ orderDate, deliveredAt }`;

const ZONES_QUERY = `*[_type == "deliveryPricingConfig" && _id == "deliveryPricingConfig.main"][0]{ zones }`;

const STORES_QUERY = `*[_type == "affiliateStore" && isActive == true && defined(coordinates)]{
  _id,
  name,
  "lat": coordinates.latitude,
  "lng": coordinates.longitude,
  "address": address.street
}`;

const ORDER_FOR_ASSIGN_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  _rev,
  orderNumber,
  orderType,
  serviceKind,
  orderStatus,
  status,
  paymentStatus,
  paymentMethod,
  orderDate,
  fulfillmentTiming,
  dispatchStatus,
  "driverId": repartidorAsignado._ref,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label)
}`;

const DRIVER_FOR_ASSIGN_QUERY = `*[_type == "repartidor" && _id == $driverId][0]{
  _id,
  _rev,
  nombre,
  telefono,
  activo,
  disponible,
  bloqueado,
  disponibleHasta,
  estadoDisponibilidad,
  prioridad,
  calificacion,
  "storeId": tiendaAsignada._ref,
  "activeOrders": *[
    _type == "order" &&
    repartidorAsignado._ref == ^._id &&
    status == "shipped" &&
    orderStatus != "delivered" &&
    orderStatus != "cancelled" &&
    orderStatus != "completed"
  ]{ _id, orderNumber }
}`;

// ────────────────────────────────────────────────────────────────────
// Snapshot
// ────────────────────────────────────────────────────────────────────

function paymentLabel(paymentMethod?: string) {
  return paymentMethod === "cash_on_delivery" || paymentMethod === "cash_on_pickup" ? "Efectivo" : "Pagado";
}

/** URL de Google Maps desde coordenadas, con búsqueda de texto como respaldo. */
function buildMapsUrl(lat?: number, lng?: number, fallback?: string): string {
  return Number.isFinite(lat) && Number.isFinite(lng)
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : `https://maps.google.com/maps?q=${encodeURIComponent(String(fallback ?? ""))}`;
}

// ────────────────────────────────────────────────────────────────────
// Derivación de estado de repartidor (una sola fuente para snapshot y
// recomendaciones, alineada con lib/delivery-dispatch.ts)
// ────────────────────────────────────────────────────────────────────

function deriveDriverEstado(driver: any): DispatchDriverCard["estado"] {
  const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
  if (driver.bloqueado) return "blocked";
  if (driver.motivoDesconexion === "admin_paused") return "paused";
  if (driver.estadoDisponibilidad === "busy" || activeCount > 0) return "busy";
  if (driver.estadoDisponibilidad === "offer_pending") return "offer_pending";
  if (driver.estadoDisponibilidad === "available" && driver.disponible) return "available";
  return "offline";
}

function buildDriverCardFromRaw(driver: any, now: number): DispatchDriverCard {
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

/**
 * Candidato disponible según la MISMA lógica del dispatch automático
 * (lib/delivery-dispatch.ts: disponible, available y sesión vigente).
 */
function isDriverCandidateAvailable(driver: any, now: number): boolean {
  if (!driver.disponible) return false;
  if (driver.estadoDisponibilidad !== "available") return false;
  if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= now) return false;
  return true;
}

function originPoint(order: any): { lat?: number; lng?: number } | undefined {
  const lat = order.storeLat;
  const lng = order.storeLng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : undefined;
}

/**
 * Motor único de recomendación. Lo usan BOTH:
 *  - /api/admin/dispatch/recommend (modo asistido, datos frescos)
 *  - fetchDispatchSnapshot (candidato top-1 por pedido, datos del snapshot)
 * Score 0..100 relativo al mejor candidato, derivado de carga, prioridad,
 * calificación y antigüedad de sesión (mismas validaciones que la asignación).
 */
export function recommendDriversFromRaw(
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
        driver: buildDriverCardFromRaw(driver, now),
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

export async function fetchDispatchSnapshot(): Promise<DispatchSnapshot> {
  const now = Date.now();
  const [rawOrders, rawDrivers, assignmentStats, deliveryStats, zonesDoc, stores, config] = await Promise.all([
    backendClient.fetch(ACTIVE_ORDERS_QUERY),
    backendClient.fetch(DRIVERS_QUERY),
    backendClient.fetch(ASSIGNMENT_STATS_QUERY),
    backendClient.fetch(DELIVERY_STATS_QUERY),
    backendClient.fetch(ZONES_QUERY),
    backendClient.fetch(STORES_QUERY),
    getDispatchConfig(),
  ]);

  const orders: DispatchOrderCard[] = (rawOrders ?? [])
    .map((order: any) => {
      // Tiempo de espera desde el timestamp real relacionado con dispatch:
      // para pedidos programados, desde que inició su ventana de despacho
      // (scheduledDispatchStartedAt); para el resto, desde la creación.
      const dispatchBase =
        order.fulfillmentTiming === "scheduled" && order.scheduledDispatchStartedAt
          ? new Date(order.scheduledDispatchStartedAt).getTime()
          : new Date(order.orderDate ?? now).getTime();
      const waitingMinutes = Math.max(0, Math.round((now - dispatchBase) / 60000));
      const escalateAt = config.maxWaitMinutesBeforeEscalate;
      const priority = waitingMinutes >= escalateAt ? "urgent" : waitingMinutes >= Math.ceil(escalateAt / 2) ? "high" : "normal";
      const storePoint = Number.isFinite(order.storeLat) && Number.isFinite(order.storeLng) ? { lat: order.storeLat, lng: order.storeLng } : undefined;
      const destPoint = Number.isFinite(order.destLat) && Number.isFinite(order.destLng) ? { lat: order.destLat, lng: order.destLng } : undefined;
      // Mejor candidato con la MISMA lógica del dispatch (solo pedidos sin repartidor).
      const topRec = !order.driverId ? recommendDriversFromRaw(order, rawDrivers ?? [], config, now)[0] ?? null : null;
      return {
        _id: order._id,
        orderNumber: order.orderNumber,
        serviceKind: order.serviceKind === "mandado" ? "mandado" : "restaurant",
        storeName: order.storeName ?? "Tienda",
        destLabel: order.destLabel ?? "Ver pedido",
        storeLat: order.storeLat,
        storeLng: order.storeLng,
        destLat: order.destLat,
        destLng: order.destLng,
        routeKm: haversineKm(storePoint, destPoint),
        waitingMinutes,
        priority,
        paymentLabel: paymentLabel(order.paymentMethod),
        totalPrice: Number(order.totalPrice ?? order.grossTotal ?? 0),
        dispatchStatus: order.dispatchStatus,
        orderStatus: order.orderStatus,
        fulfillmentTiming: order.fulfillmentTiming ?? "asap",
        scheduledSlot: order.scheduledSlot,
        driverId: order.driverId,
        driverName: order.driverName,
        storeId: order.storeId ?? null,
        storeHasOwnDelivery: Boolean(order.storeHasOwnDelivery),
        offerExpiresAt: order.deliveryOfertaExpiresAt ?? null,
        offerDriverId: order.offerDriverId ?? null,
        offerDriverName: order.offerDriverName ?? null,
        customerHelpRequested: Boolean(order.customerHelpRequested),
        recommendedDriverId: topRec?.driver._id ?? null,
        recommendedDriverName: topRec?.driver.name ?? null,
        recommendedScore: topRec?.score ?? null,
      };
    })
    // Prioridades del Dispatch Center: si están activas, mandados o
    // restaurantes pasan al frente de la cola (primero por tipo, luego por espera).
    .sort((a: DispatchOrderCard, b: DispatchOrderCard) => {
      const mandadoFirst = (x: DispatchOrderCard) =>
        config.prioritizeMandados && x.serviceKind === "mandado" ? -1 : 0;
      const restaurantFirst = (x: DispatchOrderCard) =>
        config.prioritizeRestaurants && x.serviceKind === "restaurant" ? -1 : 0;
      const diff = mandadoFirst(a) + restaurantFirst(a) - (mandadoFirst(b) + restaurantFirst(b));
      if (diff !== 0) return diff;
      return b.waitingMinutes - a.waitingMinutes;
    });

  const drivers: DispatchDriverCard[] = (rawDrivers ?? []).map((driver: any) => buildDriverCardFromRaw(driver, now));

  // Promedios reales de las últimas asignaciones/entregas. null = no hay datos
  // suficientes (la UI muestra "No estimado" en lugar de inventar 0 min).
  const avg = (stats: Array<{ start?: string; end?: string }>, startKey: string, endKey: string): number | null => {
    if (!stats || stats.length === 0) return null;
    const minutes = stats
      .map((row: any) => (new Date(row[endKey]).getTime() - new Date(row[startKey]).getTime()) / 60000)
      .filter((value: number) => Number.isFinite(value) && value >= 0);
    if (minutes.length === 0) return null;
    return Math.round((minutes.reduce((sum, value) => sum + value, 0) / minutes.length) * 10) / 10;
  };

  const kpis: DispatchKpis = {
    pendingOrders: orders.filter((o) => !o.driverId).length,
    assignedOrders: orders.filter((o) => o.driverId).length,
    availableDrivers: drivers.filter((d) => d.activo && !d.bloqueado && d.estado === "available").length,
    busyDrivers: drivers.filter((d) => d.estado === "busy").length,
    offlineDrivers: drivers.filter((d) => d.estado === "offline" || d.estado === "paused" || d.estado === "blocked").length,
    registeredDrivers: drivers.length,
    connectedDrivers: drivers.filter((d) => d.activo && !d.bloqueado && ["available", "busy", "offer_pending"].includes(d.estado)).length,
    pausedDrivers: drivers.filter((d) => d.estado === "paused").length,
    avgAssignmentMinutes: avg(assignmentStats, "orderDate", "repartidorAsignadoAt"),
    avgDeliveryMinutes: avg(deliveryStats, "orderDate", "deliveredAt"),
  };

  // ── Bandeja de alertas operativas (solo datos reales) ────────────
  const alerts = buildOperationalAlerts(orders, drivers, kpis, config, now);

  const normalizedZones = normalizeDeliveryConfig(zonesDoc);
  const zones = normalizedZones.zones
    .filter((zone) => zone.active !== false && zone.coordinates.length >= 3)
    .map((zone) => ({ id: zone.id, name: zone.name, color: zone.color, coordinates: zone.coordinates }));

  return {
    orders,
    drivers,
    kpis,
    alerts,
    config,
    zones,
    stores: stores ?? [],
    generatedAt: new Date(now).toISOString(),
  };
}

// ────────────────────────────────────────────────────────────────────
// Alertas operativas (derivadas únicamente de datos reales del snapshot)
// ────────────────────────────────────────────────────────────────────

function buildOperationalAlerts(
  orders: DispatchOrderCard[],
  drivers: DispatchDriverCard[],
  kpis: DispatchKpis,
  config: DispatchConfig,
  now: number
): DispatchAlert[] {
  const alerts: DispatchAlert[] = [];
  const escalateAt = config.maxWaitMinutesBeforeEscalate;
  const criticalWait = Math.max(60, escalateAt * 2);

  for (const order of orders) {
    const code = shortOrderCode(order.orderNumber);
    const waiting = order.waitingMinutes;

    // Pedido sin repartidor esperando demasiado tiempo
    if (!order.driverId && order.serviceKind !== "mandado" && waiting >= escalateAt) {
      alerts.push({
        id: `wait-${order._id}`,
        severity: waiting >= criticalWait ? "critical" : "warning",
        title: `Pedido #${code} esperando ${formatWaitingTime(waiting)}`,
        detail:
          waiting >= criticalWait
            ? `Supera el umbral crítico (${formatWaitingTime(criticalWait)}) sin repartidor asignado.`
            : `Supera el umbral de ${escalateAt} min sin repartidor asignado.`,
        orderId: order._id,
      });
    }

    // Mandado que requiere intervención
    if (order.serviceKind === "mandado" && !order.driverId && waiting >= escalateAt) {
      alerts.push({
        id: `mandado-wait-${order._id}`,
        severity: waiting >= criticalWait ? "critical" : "warning",
        title: `Mandado #${code} esperando ${formatWaitingTime(waiting)}`,
        detail: "Mandado sin repartidor que requiere intervención operativa.",
        orderId: order._id,
      });
    }

    // Oferta por WhatsApp vencida y el pedido sigue sin repartidor
    if (order.dispatchStatus === "offered" && order.offerExpiresAt && new Date(order.offerExpiresAt).getTime() <= now) {
      alerts.push({
        id: `offer-stuck-${order._id}`,
        severity: "critical",
        title: `Oferta vencida del pedido #${code}`,
        detail: "La oferta por WhatsApp venció y el pedido sigue sin repartidor. Reintenta o asigna manualmente.",
        orderId: order._id,
      });
    }

    // Cliente de mandado pidió ayuda
    if (order.serviceKind === "mandado" && order.customerHelpRequested) {
      alerts.push({
        id: `mandado-help-${order._id}`,
        severity: "critical",
        title: `Cliente del mandado #${code} pidió ayuda`,
        detail: "El cliente solicitó asistencia; requiere intervención operativa.",
        orderId: order._id,
      });
    }
  }

  for (const driver of drivers) {
    const activeCount = driver.activeOrders.length;

    // Mensajes de soporte sin leer del repartidor
    const unreadSupport = (driver.supportChat ?? []).filter((m) => m.role === "driver" && !m.readAt).length;
    if (unreadSupport > 0) {
      alerts.push({
        id: `support-${driver._id}`,
        severity: "info",
        title: `${driver.name} escribió un mensaje`,
        detail: `${unreadSupport} mensaje(s) sin leer. Revisa la bandeja de Mensajes del Dispatch Center.`,
        driverId: driver._id,
      });
    }

    // Repartidor con demasiadas órdenes
    if (activeCount >= config.maxOrdersPerDriver) {
      alerts.push({
        id: `load-${driver._id}`,
        severity: "warning",
        title: `${driver.name} al máximo (${activeCount}/${config.maxOrdersPerDriver})`,
        detail: "No debe recibir más pedidos hasta liberar alguno.",
        driverId: driver._id,
      });
    }

    // Repartidor desconectado durante una entrega
    if (driver.estado === "offline" && activeCount > 0) {
      alerts.push({
        id: `offline-${driver._id}`,
        severity: "critical",
        title: `${driver.name} desconectado con ${activeCount} pedido(s) en curso`,
        detail: "Un repartidor con entregas activas quedó fuera de línea.",
        driverId: driver._id,
      });
    }

    // Repartidor pausado con entregas en curso (mismo riesgo, decisión del operador)
    if (driver.estado === "paused" && activeCount > 0) {
      alerts.push({
        id: `paused-${driver._id}`,
        severity: "warning",
        title: `${driver.name} pausado con ${activeCount} pedido(s) en curso`,
        detail: "El repartidor tiene entregas activas y está pausado. Reanuda o libera sus pedidos.",
        driverId: driver._id,
      });
    }

    // Oferta del repartidor vencida sin liberar
    if (driver.estado === "offer_pending" && driver.ofertaExpiraAt && new Date(driver.ofertaExpiraAt).getTime() <= now) {
      alerts.push({
        id: `offer-stale-${driver._id}`,
        severity: "warning",
        title: `Oferta vencida de ${driver.name}`,
        detail: "El repartidor tiene una oferta vencida que debe liberarse.",
        driverId: driver._id,
      });
    }
  }

  // Sin repartidores disponibles mientras hay pedidos pendientes
  if (kpis.pendingOrders > 0 && kpis.availableDrivers === 0) {
    alerts.push({
      id: "no-drivers",
      severity: "critical",
      title: `${kpis.pendingOrders} pedido(s) sin repartidor y 0 disponibles`,
      detail: "No hay repartidores disponibles para asignar en este momento.",
    });
  }

  const severityOrder: Record<DispatchAlert["severity"], number> = { critical: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

// ────────────────────────────────────────────────────────────────────
// Auditoría
// ────────────────────────────────────────────────────────────────────

type AuditInput = {
  action: string;
  mode?: DispatchMode;
  actorUserId?: string;
  actorName?: string;
  orderId?: string;
  orderNumber?: string;
  driverId?: string;
  previousDriverId?: string;
  newDriverId?: string;
  reason?: string;
  responseTimeSeconds?: number;
  details?: string;
};

async function appendAudit(input: AuditInput) {
  const ref = (id?: string, type: "order" | "repartidor" = "repartidor") =>
    id ? { _type: "reference" as const, _ref: id } : undefined;
  await backendClient
    .create({
      _type: "dispatchAudit",
      action: input.action,
      mode: input.mode,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      order: ref(input.orderId, "order"),
      orderNumber: input.orderNumber,
      driver: ref(input.driverId),
      previousDriver: ref(input.previousDriverId),
      newDriver: ref(input.newDriverId),
      reason: input.reason,
      responseTimeSeconds: input.responseTimeSeconds,
      details: input.details,
      createdAt: new Date().toISOString(),
    })
    .catch((error) => console.error("[dispatch] error guardando auditoría:", error));
}

// ────────────────────────────────────────────────────────────────────
// Asignación (servicio único por el que pasan TODAS las asignaciones)
// ────────────────────────────────────────────────────────────────────

type AssignOptions = {
  orderId: string;
  driverId: string;
  actorUserId?: string;
  actorName?: string;
  mode: DispatchMode;
  reason?: string;
  notifyDriver?: boolean;
  markShipped?: boolean;
  previousDriverId?: string;
  skipAudit?: boolean;
  // Cuando el llamador ya registra sus propios eventos de orden (p. ej. el
  // webhook de WhatsApp emite offer_accepted / driver_assigned), se omite el
  // evento driver_assigned del servicio para no duplicar el historial.
  skipEvents?: boolean;
};

export async function assignOrderToDriver(opts: AssignOptions): Promise<
  | { ok: true; order: any; driver: any }
  | { ok: false; error: string }
> {
  const [order, driver, config] = await Promise.all([
    backendClient.fetch(ORDER_FOR_ASSIGN_QUERY, { orderId: opts.orderId }),
    backendClient.fetch(DRIVER_FOR_ASSIGN_QUERY, { driverId: opts.driverId }),
    getDispatchConfig(),
  ]);
  const error = validateAssignment(order, driver, config, opts.mode);
  if (error) return { ok: false, error };

  const now = new Date().toISOString();
  const markShipped = opts.markShipped ?? true;
  const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;

  try {
    await backendClient
      .transaction()
      .patch(order._id, (patch) =>
        patch
          .ifRevisionId(order._rev)
          .set({
            repartidorAsignado: { _type: "reference", _ref: opts.driverId },
            repartidorAsignadoAt: now,
            dispatchStatus: "accepted",
            ...(markShipped ? { status: "shipped", orderStatus: "shipped" } : {}),
            ...(order.fulfillmentTiming === "scheduled"
              ? { scheduleStatus: "dispatching", scheduledDispatchStartedAt: now }
              : {}),
            deliveryOfertaEnviada: false,
            updatedAt: now,
          })
          .unset(["offeredTo", "deliveryOfertaExpiresAt"])
      )
      .patch(opts.driverId, (patch) =>
        patch
          .ifRevisionId(driver._rev)
          .set({ estadoDisponibilidad: "busy", ultimaActividad: now })
          .unset(["ultimoPedidoOfertado", "pedidosOfertados", "restauranteOferta", "ofertaTipo", "ofertaEnviadaAt", "ofertaExpiraAt"])
      )
      .commit();
  } catch (patchError) {
    console.error("[dispatch] error asignando pedido", { orderId: opts.orderId, driverId: opts.driverId, patchError });
    return { ok: false, error: "No se pudo asignar el pedido (el estado cambió en el servidor)." };
  }

  if (!opts.skipEvents) {
    await appendOrderEvent(order._id, {
      type: "driver_assigned",
      source: "dispatch-center",
      actor: opts.actorUserId ?? opts.driverId,
      payload: { driverId: opts.driverId, mode: opts.mode, reason: opts.reason },
    }).catch(() => null);
  }

  if (!opts.skipAudit) {
    const responseTimeSeconds = order.orderDate
      ? Math.max(0, Math.round((Date.now() - new Date(order.orderDate).getTime()) / 1000))
      : undefined;
    await appendAudit({
      action: opts.previousDriverId ? "reassign" : "assign",
      mode: opts.mode,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      orderId: order._id,
      orderNumber: order.orderNumber,
      previousDriverId: opts.previousDriverId,
      newDriverId: opts.driverId,
      reason: opts.reason,
      responseTimeSeconds,
      details: opts.mode === "auto" ? "Asignado automáticamente (repartidor aceptó oferta de WhatsApp)." : `Asignación desde el Dispatch Center (modo ${opts.mode}).`,
    });
  }

  if (opts.notifyDriver) {
    const paymentLabelText =
      order.paymentMethod === "cash_on_delivery" || order.paymentMethod === "cash_on_pickup" ? "COBRAR EN EFECTIVO" : "YA PAGADO";
    const restaurantMapsUrl = buildMapsUrl(order.storeLat, order.storeLng, order.storeName);
    const clientMapsUrl = buildMapsUrl(order.destLat, order.destLng, order.destLabel);
    try {
      // Plantilla existente (confirmacion_repartidor) con botones de mapa:
      // la misma que recibe el repartidor al aceptar una oferta en el webhook.
      await sendDriverConfirmation(
        driver.telefono,
        String(order.orderNumber),
        String(order.storeName ?? "La Tienda"),
        String(order.destLabel ?? "el domicilio del cliente"),
        paymentLabelText,
        restaurantMapsUrl,
        clientMapsUrl
      );
    } catch (error) {
      // Fallback a texto libre si la plantilla no está aprobada / falla.
      console.warn("[dispatch] plantilla confirmacion_repartidor falló; usando texto libre", {
        orderId: order._id,
        driverId: opts.driverId,
        error,
      });
      await sendBotMessage(
        driver.telefono,
        `Pedido #${order.orderNumber} asignado. Recoge en ${order.storeName ?? "la tienda"} y entrega en ${order.destLabel ?? "el domicilio"}. Pago: ${paymentLabelText}. Usa los comandos PEDIDO EN DIRECCION AL DOMICILIO, EN PUERTA y ENTREGADO para actualizar.`
      ).catch(() => null);
    }
  }

  return { ok: true, order, driver };
}

// validateAssignment vive en lib/dispatch/dispatch-validation.ts (pura y con
// tests) para que el servicio único de asignación y sus pruebas compartan
// exactamente las mismas reglas de validación.

// ────────────────────────────────────────────────────────────────────
// Liberar / Reasignar
// ────────────────────────────────────────────────────────────────────

type ReleaseOptions = {
  orderId: string;
  driverId: string;
  actorUserId?: string;
  actorName?: string;
  reason?: string;
  skipAudit?: boolean;
  notifyDriver?: boolean;
};

export async function releaseOrderFromDriver(opts: ReleaseOptions) {
  const order = await backendClient.fetch<any>(
    `*[_type == "order" && _id == $orderId][0]{
      _id,
      _rev,
      orderNumber,
      orderType,
      orderStatus,
      paymentStatus,
      paymentMethod,
      "driverId": repartidorAsignado._ref
    }`,
    { orderId: opts.orderId }
  );
  if (!order) return { ok: false as const, error: "El pedido no existe." };
  if (!order.driverId || order.driverId !== opts.driverId) {
    return { ok: false as const, error: "El pedido no está asignado a ese repartidor." };
  }
  if (order.orderStatus === "delivered" || order.orderStatus === "completed" || order.orderStatus === "cancelled") {
    return { ok: false as const, error: "El pedido ya está terminado." };
  }

  const now = new Date().toISOString();
  const [remainingOrders, driver] = await Promise.all([
    backendClient.fetch(
      `*[_type == "order" && repartidorAsignado._ref == $driverId && _id != $orderId && status == "shipped" && orderStatus != "delivered" && orderStatus != "cancelled"]{ _id }`,
      { driverId: opts.driverId, orderId: opts.orderId }
    ),
    backendClient.fetch(
      `*[_type == "repartidor" && _id == $driverId][0]{ _id, telefono }`,
      { driverId: opts.driverId }
    ),
  ]);

  await backendClient
    .transaction()
    .patch(order._id, (patch) =>
      patch
        .ifRevisionId(order._rev)
        .set({
          orderStatus: "pending",
          dispatchStatus: "waiting_for_driver",
          status: buildLegacyStatus({
            orderType: order.orderType,
            orderStatus: "pending",
            paymentStatus: order.paymentStatus,
            paymentMethod: order.paymentMethod,
          }),
          deliveryOfertaEnviada: false,
          updatedAt: now,
        })
        .unset(["repartidorAsignado", "repartidorAsignadoAt"])
    )
    .patch(opts.driverId, (patch) =>
      patch
        .set({
          estadoDisponibilidad: remainingOrders.length > 0 ? "busy" : "available",
          ultimaActividad: now,
        })
    )
    .commit();

  await appendOrderEvent(order._id, {
    type: "manual_admin_action",
    source: "dispatch-center",
    actor: opts.actorUserId ?? opts.driverId,
    reason: "driver_assignment_released",
    payload: { driverId: opts.driverId, reason: opts.reason },
  }).catch(() => null);

  if (!opts.skipAudit) {
    await appendAudit({
      action: "unassign",
      mode: undefined,
      actorUserId: opts.actorUserId,
      actorName: opts.actorName,
      orderId: order._id,
      orderNumber: order.orderNumber,
      driverId: opts.driverId,
      reason: opts.reason ?? "liberado manualmente",
      details: "Pedido liberado y devuelto a la cola de asignación.",
    });
  }

  if (opts.notifyDriver && driver?.telefono) {
    await sendBotMessage(
      driver.telefono,
      `El pedido #${order.orderNumber} ya no está a tu cargo. Revisa el Dispatch Center.`
    ).catch(() => null);
  }

  return { ok: true as const };
}

// ────────────────────────────────────────────────────────────────────
export async function reassignOrder(opts: {
  orderId: string;
  fromDriverId: string;
  toDriverId: string;
  actorUserId?: string;
  actorName?: string;
  reason?: string;
}) {
  if (opts.fromDriverId === opts.toDriverId) {
    return { ok: false as const, error: "El repartidor de origen y destino son el mismo." };
  }
  const released = await releaseOrderFromDriver({
    orderId: opts.orderId,
    driverId: opts.fromDriverId,
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    reason: opts.reason ?? "reasignación",
    skipAudit: true,
  });
  if (!released.ok) return released;

  const assigned = await assignOrderToDriver({
    orderId: opts.orderId,
    driverId: opts.toDriverId,
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    mode: "manual",
    reason: opts.reason ?? "reasignación",
    notifyDriver: true,
    previousDriverId: opts.fromDriverId,
  });
  if (!assigned.ok) return assigned;
  return { ok: true as const };
}

// ────────────────────────────────────────────────────────────────────
// Controles de repartidor
// ────────────────────────────────────────────────────────────────────

export type DriverControlAction = "block" | "unblock" | "pause" | "resume" | "priority";

export async function setDriverControl(opts: {
  driverId: string;
  action: DriverControlAction;
  value?: number;
  reason?: string;
  actorUserId?: string;
  actorName?: string;
}) {
  const driver = await backendClient.fetch<any>(
    `*[_type == "repartidor" && _id == $driverId][0]{ _id, _rev, nombre, telefono, disponible, disponibleHasta, estadoDisponibilidad }`,
    { driverId: opts.driverId }
  );
  if (!driver) return { ok: false as const, error: "El repartidor no existe." };

  const now = new Date().toISOString();

  if (opts.action === "block" || opts.action === "pause") {
    // Liberar ofertas pendientes que tenga este repartidor
    const offered = await backendClient.fetch(
      `*[_type == "order" && offeredTo._ref == $driverId && !defined(repartidorAsignado)]{ _id }`,
      { driverId: opts.driverId }
    );
    if (Array.isArray(offered) && offered.length > 0) {
      await releaseOrdersForDriver(
        offered.map((o: any) => o._id),
        opts.driverId,
        opts.action === "block" ? "driver_blocked" : "driver_paused"
      ).catch(() => null);
    }
    await backendClient
      .patch(opts.driverId)
      .ifRevisionId(driver._rev)
      .set({
        ...(opts.action === "block" ? { bloqueado: true } : {}),
        disponible: false,
        estadoDisponibilidad: "offline",
        motivoDesconexion: opts.action === "block" ? "admin_blocked" : "admin_paused",
        ultimaActividad: now,
      })
      .unset(["ultimoPedidoOfertado", "pedidosOfertados", "restauranteOferta", "ofertaTipo", "ofertaEnviadaAt", "ofertaExpiraAt"])
      .commit();
  } else if (opts.action === "unblock") {
    await backendClient
      .patch(opts.driverId)
      .ifRevisionId(driver._rev)
      .set({ bloqueado: false, ultimaActividad: now })
      .commit();
  } else if (opts.action === "resume") {
    await backendClient
      .patch(opts.driverId)
      .ifRevisionId(driver._rev)
      .set({
        disponible: true,
        estadoDisponibilidad: "available",
        disponibleDesde: now,
        disponibleHasta: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        duracionDisponibilidadMinutos: 120,
        ultimaActividad: now,
      })
      .unset(["motivoDesconexion"])
      .commit();
  } else if (opts.action === "priority") {
    const value = Math.max(0, Math.min(100, Math.round(Number(opts.value ?? 0))));
    await backendClient
      .patch(opts.driverId)
      .ifRevisionId(driver._rev)
      .set({ prioridad: value, ultimaActividad: now })
      .commit();
  }

  await appendAudit({
    action: opts.action,
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    driverId: opts.driverId,
    reason: opts.reason,
    details:
      opts.action === "block"
        ? "Repartidor bloqueado: no recibe ofertas ni asignaciones."
        : opts.action === "pause"
          ? "Repartidor pausado temporalmente."
          : opts.action === "resume"
            ? "Sesión reanudada por el operador (2 h)."
            : opts.action === "priority"
              ? `Prioridad ajustada a ${opts.value}.`
              : "Repartidor desbloqueado.",
  });

  return { ok: true as const };
}

// ────────────────────────────────────────────────────────────────────
// Recomendaciones (modo asistido)
// ────────────────────────────────────────────────────────────────────

export async function recommendDriversForOrder(orderId: string, limit = 5): Promise<DriverRecommendation[]> {
  const [order, drivers, config] = await Promise.all([
    backendClient.fetch<any>(ORDER_FOR_ASSIGN_QUERY, { orderId }),
    backendClient.fetch<any>(DRIVERS_QUERY),
    getDispatchConfig(),
  ]);
  if (!order) return [];
  // Motor único compartido con el snapshot del Dispatch Center.
  return recommendDriversFromRaw(order, drivers ?? [], config).slice(0, limit);
}

// ────────────────────────────────────────────────────────────────────
// Historial
// ────────────────────────────────────────────────────────────────────

export async function fetchDispatchHistory(limit = 100): Promise<AuditEntry[]> {
  const entries = await backendClient.fetch(
    `*[_type == "dispatchAudit"] | order(createdAt desc)[0...$limit]{
      _id,
      action,
      mode,
      actorName,
      orderNumber,
      reason,
      responseTimeSeconds,
      createdAt,
      "previousDriverName": previousDriver->nombre,
      "newDriverName": newDriver->nombre,
      "driverName": driver->nombre,
      details
    }`,
    { limit }
  );
  return entries ?? [];
}

// Re-export de la configuración para los endpoints
export { getDispatchConfig, saveDispatchConfig };
