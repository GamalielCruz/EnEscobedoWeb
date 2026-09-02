import { NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import {
  fetchAssignedOrders,
  type OrderDoc,
} from "@/lib/driver-actions";
import { mandadoDriverState } from "@/lib/mandado-driver-flow";
import { haversineKm } from "@/lib/dispatch/dispatch-core";
import { estimateEtaMinutes } from "@/lib/dispatch/dispatch-format";

export const dynamic = "force-dynamic";

type DriverOrderDTO = {
  orderNumber: string;
  serviceKind: "restaurant" | "mandado";
  storeName: string;
  destLabel: string;
  storeLat: number;
  storeLng: number;
  destLat: number;
  destLng: number;
  routeKm: number | null;
  etaMinutes: number | null;
  dispatchStatus: string;
  mandadoState: "assigned" | "pickup_arrival" | "en_route" | "destination_arrival" | "delivered" | null;
  mandadoOriginLabel: string | null;
  mandadoDestinationLabel: string | null;
  mandadoDetails: string | null;
  mandadoOriginReference: string | null;
  mandadoDestinationReference: string | null;
  paymentLabel: string;
  totalPrice: number;
};

type DriverOfferDTO = {
  orderNumber: string;
  serviceKind: "restaurant" | "mandado";
  storeName: string;
  destLabel: string;
  storeLat: number;
  storeLng: number;
  destLat: number;
  destLng: number;
  routeKm: number | null;
  etaMinutes: number | null;
  paymentLabel: string;
  totalPrice: number;
  offerExpiresAt: string;
  mandadoOriginLabel: string | null;
  mandadoDestinationLabel: string | null;
};

type DriverStateResponse = {
  connected: boolean;
  estado: "available" | "offline" | "busy" | "offer_pending";
  disponibleHasta: string | null;
  connectedMinutes: number;
  location: { lat: number; lng: number } | null;
  orders: DriverOrderDTO[];
  offer: DriverOfferDTO | null;
  /** Diagnostic: server clock at query time (ISO) */
  serverNow?: string;
  /** Diagnostic: seconds until offer expires (server clock) */
  offerTtlRemaining?: number | null;
};

function paymentLabel(paymentMethod?: string): string {
  return paymentMethod === "cash_on_delivery" || paymentMethod === "cash_on_pickup"
    ? "Efectivo"
    : "Pagado";
}

function toFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function deriveEstado(driver: {
  disponible?: boolean;
  estadoDisponibilidad?: string;
  bloqueado?: boolean;
  activeOrders?: unknown[];
}): "available" | "offline" | "busy" | "offer_pending" {
  if (driver.bloqueado) return "offline";
  if (driver.estadoDisponibilidad === "busy") return "busy";
  if (driver.estadoDisponibilidad === "offer_pending") return "offer_pending";
  if (driver.estadoDisponibilidad === "available" && driver.disponible) return "available";
  return "offline";
}

function mapOrderDTO(order: OrderDoc): DriverOrderDTO {
  const storeLat = toFinite(order.storeLat);
  const storeLng = toFinite(order.storeLng);
  const destLat = toFinite(order.destLat);
  const destLng = toFinite(order.destLng);
  const routeKm =
    storeLat !== null && storeLng !== null && destLat !== null && destLng !== null
      ? haversineKm({ lat: storeLat, lng: storeLng }, { lat: destLat, lng: destLng })
      : null;

  return {
    orderNumber: order.orderNumber,
    serviceKind: (order.serviceKind === "mandado" ? "mandado" : "restaurant") as "restaurant" | "mandado",
    storeName: order.storeName ?? "Tienda",
    destLabel: order.destLabel ?? "Ver pedido",
    storeLat: storeLat ?? 0,
    storeLng: storeLng ?? 0,
    destLat: destLat ?? 0,
    destLng: destLng ?? 0,
    routeKm,
    etaMinutes: estimateEtaMinutes(routeKm),
    dispatchStatus: order.dispatchStatus ?? "",
    mandadoState: mandadoDriverState(order as Parameters<typeof mandadoDriverState>[0]),
    mandadoOriginLabel: order.mandadoOriginLabel ?? null,
    mandadoDestinationLabel: order.mandadoDestinationLabel ?? null,
    mandadoDetails: order.mandadoDetails ?? null,
    mandadoOriginReference: order.mandadoOriginReference ?? null,
    mandadoDestinationReference: order.mandadoDestinationReference ?? null,
    paymentLabel: paymentLabel(order.paymentMethod),
    totalPrice: Number(order.totalPrice ?? 0),
  };
}

function mapOfferDTO(order: OrderDoc): DriverOfferDTO {
  const storeLat = toFinite(order.storeLat);
  const storeLng = toFinite(order.storeLng);
  const destLat = toFinite(order.destLat);
  const destLng = toFinite(order.destLng);
  const routeKm =
    storeLat !== null && storeLng !== null && destLat !== null && destLng !== null
      ? haversineKm({ lat: storeLat, lng: storeLng }, { lat: destLat, lng: destLng })
      : null;

  return {
    orderNumber: order.orderNumber,
    serviceKind: (order.serviceKind === "mandado" ? "mandado" : "restaurant") as "restaurant" | "mandado",
    storeName: order.storeName ?? "Tienda",
    destLabel: order.destLabel ?? "Ver pedido",
    storeLat: storeLat ?? 0,
    storeLng: storeLng ?? 0,
    destLat: destLat ?? 0,
    destLng: destLng ?? 0,
    routeKm,
    etaMinutes: estimateEtaMinutes(routeKm),
    paymentLabel: paymentLabel(order.paymentMethod),
    totalPrice: Number(order.totalPrice ?? 0),
    offerExpiresAt: order.deliveryOfertaExpiresAt ?? "",
    mandadoOriginLabel: order.mandadoOriginLabel ?? null,
    mandadoDestinationLabel: order.mandadoDestinationLabel ?? null,
  };
}

export async function GET() {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const now = Date.now();

  // Connected?
  const connected =
    repartidor.disponible === true &&
    repartidor.estadoDisponibilidad !== "offline" &&
    (!repartidor.disponibleHasta ||
      new Date(repartidor.disponibleHasta).getTime() > now);

  const estado = deriveEstado(repartidor);

  // Connected minutes
  const connectedMinutes =
    repartidor.disponibleDesde && connected
      ? Math.max(0, Math.round((now - new Date(repartidor.disponibleDesde).getTime()) / 60000))
      : 0;

  // Fetch assigned orders
  const rawOrders = await fetchAssignedOrders(repartidor._id);
  const orders = (rawOrders ?? []).map(mapOrderDTO);

  // Check for active offer (order offered to this driver)
  const offerQuery = `*[_type == "order" && offeredTo._ref == $driverId && dispatchStatus == "offered" && !defined(repartidorAsignado) && status != "delivered" && status != "cancelled" && defined(deliveryOfertaExpiresAt) && deliveryOfertaExpiresAt > $now] | order(orderDate asc)[0]{
    _id, _rev, orderNumber, serviceKind, orderType, orderStatus, status, dispatchStatus,
    paymentMethod, totalPrice, deliveryOfertaExpiresAt,
    "repartidorAsignadoRef": repartidorAsignado._ref,
    "offeredToRef": offeredTo._ref,
    mandadoPickupAtDoor, mandadoEnRuta,
    "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
    "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
    "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
    "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
    "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
    "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
    "mandadoOriginLabel": mandadoOrigin.label,
    "mandadoDestinationLabel": mandadoDestination.label
  }`;

  const { backendClient } = await import("@/sanity/lib/backendClient");
  const serverNow = new Date().toISOString();
  const rawOffer = await backendClient.fetch<OrderDoc | null>(offerQuery, {
    driverId: repartidor._id,
    now: serverNow,
  });

  const offer = rawOffer ? mapOfferDTO(rawOffer) : null;

  // Diagnostic: log clock comparison
  if (offer?.offerExpiresAt) {
    const ttlRemaining = Math.round((new Date(offer.offerExpiresAt).getTime() - new Date(serverNow).getTime()) / 1000);
    console.log("[driver-state] diagnostic", {
      serverNow,
      offerExpiresAt: offer.offerExpiresAt,
      ttlRemainingSeconds: ttlRemaining,
      offerReturnedByGROQ: true,
    });
  }

  // Location
  const loc = repartidor.ultimaUbicacion;
  const location =
    loc && toFinite(loc.lat) !== null && toFinite(loc.lng) !== null
      ? { lat: loc.lat!, lng: loc.lng! }
      : null;

  const response: DriverStateResponse = {
    connected,
    estado,
    disponibleHasta: connected ? repartidor.disponibleHasta ?? null : null,
    connectedMinutes,
    location,
    orders,
    offer,
    serverNow,
    offerTtlRemaining: offer?.offerExpiresAt
      ? Math.round((new Date(offer.offerExpiresAt).getTime() - new Date(serverNow).getTime()) / 1000)
      : null,
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}
