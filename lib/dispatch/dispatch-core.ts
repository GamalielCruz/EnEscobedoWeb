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
import { formatWaitingTime, shortOrderCode } from "@/lib/dispatch/dispatch-format";
import {
  classifyAssignmentOutcome,
  extractRevisionInfo,
  isRevisionConflict,
  validateAssignment,
} from "@/lib/dispatch/dispatch-validation";
import { releaseOrderFromDriverCore } from "./dispatch-release";
import { backendClient } from "@/sanity/lib/backendClient";
import { NextResponse } from "next/server";
import { deriveDriverEstado } from "./driver-state";

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
  // Mandados: información operacional capturada por el cliente (direcciones
  // reales e indicaciones para el repartidor). Se muestran en el Dispatch Center
  // y alimentan la confirmación por WhatsApp al repartidor.
  mandadoOriginLabel?: string | null;
  mandadoDestinationLabel?: string | null;
  mandadoOriginReference?: string | null;
  mandadoDestinationReference?: string | null;
  mandadoDetails?: string | null;
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
  upcomingScheduled: UpcomingScheduledCard[];
  drivers: DispatchDriverCard[];
  kpis: DispatchKpis;
  alerts: DispatchAlert[];
  config: DispatchConfig;
  zones: Array<{ id: string; name: string; color?: string; coordinates: Array<{ lat: number; lng: number }> }>;
  stores: Array<{ _id: string; name: string; lat?: number; lng?: number; address?: string }>;
  generatedAt: string;
};

export type UpcomingScheduledCard = {
  _id: string;
  orderNumber: string;
  serviceKind: "restaurant" | "mandado";
  storeName: string;
  destLabel: string;
  totalPrice: number;
  paymentLabel: string;
  scheduleStatus: string | null;
  scheduledSlot: { startAt?: string; endAt?: string } | null;
  scheduledDispatchAt: string | null;
  scheduledPreparationAt: string | null;
  scheduleRiskLevel: string | null;
  driverId: string | null;
  driverName: string | null;
  preassignedDriverId: string | null;
  preassignedDriverName: string | null;
  customerHelpRequested: boolean;
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

// haversineKm now lives in matching.ts; import it here so the local binding
// is available, and re-export it for backward compatibility.
import { haversineKm, rankDriverCandidates } from "./matching";
export { haversineKm };

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
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  mandadoOriginReference,
  mandadoDestinationReference,
  mandadoDetails,
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

const UPCOMING_SCHEDULED_QUERY = `*[
  _type == "order" &&
  !(_id in path("drafts.**")) &&
  fulfillmentTiming == "scheduled" &&
  dispatchStatus == "scheduled" &&
  orderStatus != "cancelled" &&
  orderStatus != "delivered" &&
  orderStatus != "completed" &&
  paymentStatus != "failed" &&
  paymentStatus != "expired" &&
  paymentStatus != "refunded" &&
  paymentStatus != "requires_refund" &&
  defined(scheduledDispatchAt) &&
  scheduledDispatchAt <= $horizon
] | order(scheduledDispatchAt asc)[0...50]{
  _id,
  orderNumber,
  serviceKind,
  orderStatus,
  paymentMethod,
  totalPrice,
  fulfillmentTiming,
  scheduleStatus,
  scheduledSlot,
  scheduledDispatchAt,
  scheduledPreparationAt,
  scheduleRiskLevel,
  customerHelpRequested,
  "driverId": repartidorAsignado._ref,
  "driverName": repartidorAsignado->nombre,
  "preassignedDriverId": preassignedDriver._ref,
  "preassignedDriverName": preassignedDriver->nombre,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label)
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
  deliveryOfertaExpiresAt,
  "offeredToRef": offeredTo._ref,
  "driverId": repartidorAsignado._ref,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  mandadoOriginReference,
  mandadoDestinationReference,
  mandadoDetails,
  deliveryNotes
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
// Recommend functionality extracted to lib/dispatch/matching.ts.
// Backward-compatible alias used by fetchDispatchSnapshot and recommendDriversForOrder.
export const recommendDriversFromRaw = rankDriverCandidates;

export async function fetchDispatchSnapshot(): Promise<DispatchSnapshot> {
  const now = Date.now();
  // Ventana de 24 h para órdenes programadas futuras.
  const upcomingHorizon = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const [rawOrders, rawDrivers, rawUpcoming, assignmentStats, deliveryStats, zonesDoc, stores, config] = await Promise.all([
    backendClient.fetch(ACTIVE_ORDERS_QUERY),
    backendClient.fetch(DRIVERS_QUERY),
    backendClient.fetch(UPCOMING_SCHEDULED_QUERY, { horizon: upcomingHorizon }),
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
        mandadoOriginLabel: order.mandadoOriginLabel ?? null,
        mandadoDestinationLabel: order.mandadoDestinationLabel ?? null,
        mandadoOriginReference: order.mandadoOriginReference ?? null,
        mandadoDestinationReference: order.mandadoDestinationReference ?? null,
        mandadoDetails: order.mandadoDetails ?? null,
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

  // ── Próximas programadas (preview, NO cola activa) ─────────────
  const upcomingScheduled: UpcomingScheduledCard[] = (rawUpcoming ?? []).map((order: any) => ({
    _id: order._id,
    orderNumber: order.orderNumber,
    serviceKind: order.serviceKind === "mandado" ? "mandado" : "restaurant",
    storeName: order.storeName ?? "Tienda",
    destLabel: order.destLabel ?? "—",
    totalPrice: Number(order.totalPrice ?? 0),
    paymentLabel: paymentLabel(order.paymentMethod),
    scheduleStatus: order.scheduleStatus ?? null,
    scheduledSlot: order.scheduledSlot ?? null,
    scheduledDispatchAt: order.scheduledDispatchAt ?? null,
    scheduledPreparationAt: order.scheduledPreparationAt ?? null,
    scheduleRiskLevel: order.scheduleRiskLevel ?? null,
    driverId: order.driverId ?? null,
    driverName: order.driverName ?? null,
    preassignedDriverId: order.preassignedDriverId ?? null,
    preassignedDriverName: order.preassignedDriverName ?? null,
    customerHelpRequested: Boolean(order.customerHelpRequested),
  }));

  const normalizedZones = normalizeDeliveryConfig(zonesDoc);
  const zones = normalizedZones.zones
    .filter((zone) => zone.active !== false && zone.coordinates.length >= 3)
    .map((zone) => ({ id: zone.id, name: zone.name, color: zone.color, coordinates: zone.coordinates }));

  return {
    orders,
    upcomingScheduled,
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

export type AssignResult =
  | { ok: true; order: any; driver: any; idempotent?: boolean }
  | { ok: false; error: string; code?: "validation" | "conflict" | "already_assigned_other"; order?: any; driver?: any };

const MAX_ASSIGN_CONFLICT_RETRIES = 3;

/**
 * Asignación (servicio único por el que pasan TODAS las asignaciones).
 *
 * Seguridad ante concurrencia e idempotencia:
 *  - La transacción usa `ifRevisionId` en pedido y repartidor; si el documento
 *    cambió entre el fetch y el commit (webhook concurrente, cron, acciones del
 *    admin), Sanity responde 409 y NO se muta nada.
 *  - Ante un 409 se RELEE el estado real de Sanity y se reintenta (máx. 3 veces)
 *    con revisiones frescas; NUNCA se reusa la revisión obsoleta.
 *  - Si al releer el pedido YA está asignado a este repartidor, el resultado es
 *    éxito IDEMPOTENTE: no se re-ejecutan eventos, auditoría ni notificaciones.
 *  - Si otro repartidor ganó, se informa que el pedido ya no está disponible.
 */
export async function assignOrderToDriver(opts: AssignOptions): Promise<AssignResult> {
  const traceId = crypto.randomUUID().slice(0, 8);
  const markShipped = opts.markShipped ?? true;
  let order: any = null;
  let driver: any = null;
  let successfulAttempt = 0;

  for (let attempt = 1; attempt <= MAX_ASSIGN_CONFLICT_RETRIES; attempt++) {
    const [freshOrder, freshDriver, config] = await Promise.all([
      backendClient.fetch(ORDER_FOR_ASSIGN_QUERY, { orderId: opts.orderId }),
      backendClient.fetch(DRIVER_FOR_ASSIGN_QUERY, { driverId: opts.driverId }),
      getDispatchConfig(),
    ]);
    order = freshOrder;
    driver = freshDriver;

    // Idempotencia: el pedido ya quedó asignado a este repartidor (doble
    // "Acepto", doble clic, o reintento tras conflicto donde otro proceso
    // ganó). Éxito sin efectos secundarios.
    if (order && order.driverId && order.driverId === opts.driverId) {
      const outcome = classifyAssignmentOutcome(order, opts.driverId);
      if (outcome.kind === "assigned_to_me") {
        console.log("[dispatch] ASSIGNMENT_IDEMPOTENT", {
          traceId,
          orderId: opts.orderId,
          repartidorId: opts.driverId,
          mode: opts.mode,
        });
        return { ok: true, order, driver, idempotent: true };
      }
    }

    const error = validateAssignment(order, driver, config, opts.mode);
    if (error) {
      return { ok: false, error, code: "validation", order, driver };
    }

    console.log("[dispatch] ASSIGNMENT_ATTEMPT", {
      traceId,
      orderId: opts.orderId,
      orderNumber: order.orderNumber,
      repartidorId: opts.driverId,
      mode: opts.mode,
      attempt,
    });

    try {
      const now = new Date().toISOString();
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
            .unset(["offeredTo", "deliveryOfertaExpiresAt", "preassignedDriver", "preassignedAt"])
        )
        .patch(opts.driverId, (patch) =>
          patch
            .ifRevisionId(driver._rev)
            .set({ estadoDisponibilidad: "busy", ultimaActividad: now })
            .unset(["ultimoPedidoOfertado", "pedidosOfertados", "restauranteOferta", "ofertaTipo", "ofertaEnviadaAt", "ofertaExpiraAt"])
        )
        .commit();
      successfulAttempt = attempt;
      break;
    } catch (patchError) {
      if (!isRevisionConflict(patchError)) {
        console.error("[dispatch] ASSIGNMENT_ERROR", {
          traceId,
          orderId: opts.orderId,
          repartidorId: opts.driverId,
          mode: opts.mode,
          patchError,
        });
        return { ok: false, error: "No se pudo asignar el pedido.", code: "validation", order, driver };
      }

      const revision = extractRevisionInfo(patchError);
      console.warn("[dispatch] ASSIGNMENT_CONFLICT", {
        traceId,
        offerId: `${opts.orderId}::${opts.driverId}`,
        orderId: opts.orderId,
        repartidorId: opts.driverId,
        attempt,
        ...revision,
      });

      if (attempt >= MAX_ASSIGN_CONFLICT_RETRIES) {
        // Último intento: se decide por el estado REAL actual de Sanity, no por
        // la revisión obsoleta ni por la opinión de este proceso.
        const [finalOrder, finalDriver] = await Promise.all([
          backendClient.fetch(ORDER_FOR_ASSIGN_QUERY, { orderId: opts.orderId }),
          backendClient.fetch(DRIVER_FOR_ASSIGN_QUERY, { driverId: opts.driverId }),
        ]);
        const outcome = classifyAssignmentOutcome(finalOrder, opts.driverId);
        if (outcome.kind === "assigned_to_me") {
          console.log("[dispatch] ASSIGNMENT_RECOVERED_IDEMPOTENT", {
            traceId,
            orderId: opts.orderId,
            repartidorId: opts.driverId,
          });
          return { ok: true, order: finalOrder, driver: finalDriver, idempotent: true };
        }
        if (outcome.kind === "assigned_to_other") {
          return {
            ok: false,
            error: "El pedido ya fue asignado a otro repartidor; refresca la vista.",
            code: "already_assigned_other",
            order: finalOrder,
            driver: finalDriver,
          };
        }
        return {
          ok: false,
          error: "Conflicto de concurrencia al asignar; el estado cambió repetidamente. Reintenta.",
          code: "conflict",
          order: finalOrder,
          driver: finalDriver,
        };
      }
    }
  }

  // ── Éxito: efectos secundarios exactamente una vez ─────────────────
  console.log("[dispatch] ASSIGNMENT_SUCCESS", {
    traceId,
    orderId: opts.orderId,
    orderNumber: order.orderNumber,
    repartidorId: opts.driverId,
    mode: opts.mode,
    attempt: successfulAttempt,
  });

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
  // Delegación al núcleo testeable (lib/dispatch/dispatch-release.ts) con las
  // dependencias reales de Sanity. El núcleo reintenta ante 409 con revisiones
  // frescas, decide por el estado real y es idempotente: si el pedido ya fue
  // liberado (doble clic / proceso concurrente), devuelve éxito sin repetir
  // eventos ni notificaciones.
  return releaseOrderFromDriverCore(
    { orderId: opts.orderId, driverId: opts.driverId },
    {
      fetchOrder: async (orderId) =>
        (await backendClient.fetch<any>(
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
          { orderId }
        )) ?? null,
      fetchDriver: async (driverId) =>
        (await backendClient.fetch<any>(
          `*[_type == "repartidor" && _id == $driverId][0]{ _id, telefono }`,
          { driverId }
        )) ?? null,
      fetchRemainingCount: async (driverId, excludeOrderId) => {
        const remaining = await backendClient.fetch<any[]>(
          `*[_type == "order" && repartidorAsignado._ref == $driverId && _id != $orderId && status == "shipped" && orderStatus != "delivered" && orderStatus != "cancelled"]{ _id }`,
          { driverId, orderId: excludeOrderId }
        );
        return Array.isArray(remaining) ? remaining.length : 0;
      },
      commitRelease: async ({ order, remainingCount, now }) => {
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
            patch.set({
              estadoDisponibilidad: remainingCount > 0 ? "busy" : "available",
              ultimaActividad: now,
            })
          )
          .commit();
      },
      afterCommit: async ({ order, driver, driverId }) => {
        await appendOrderEvent(order._id, {
          type: "manual_admin_action",
          source: "dispatch-center",
          actor: opts.actorUserId ?? driverId,
          reason: "driver_assignment_released",
          payload: { driverId, reason: opts.reason },
        }).catch(() => null);

        if (!opts.skipAudit) {
          await appendAudit({
            action: "unassign",
            mode: undefined,
            actorUserId: opts.actorUserId,
            actorName: opts.actorName,
            orderId: order._id,
            orderNumber: order.orderNumber,
            driverId,
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
      },
      log: (tag, payload) => {
        const message = `[dispatch] ${tag}`;
        if (tag === "RELEASE_CONFLICT" || tag === "RELEASE_ERROR") console.warn(message, payload);
        else console.log(message, payload);
      },
    }
  );
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
