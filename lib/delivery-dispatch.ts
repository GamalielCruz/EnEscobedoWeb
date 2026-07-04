import { backendClient } from "@/sanity/lib/backendClient";
import { sendBundleDeliveryOffer, sendDeliveryOffer, sendWhatsAppMessage } from "./whatsapp";

const OFFER_TTL_SECONDS = 90;
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_PHONE;

type DispatchOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  customerName?: string;
  phone?: string;
  totalPrice?: number;
  paymentMethod?: string;
  deliveryOfertaEnviada?: boolean;
  deliveryOfertaExpiresAt?: string;
  repartidorAsignado?: unknown;
  shippingAddress?: {
    line1?: string;
    street?: string;
    city?: string;
  };
  storeId?: string;
  storeHasOwnDelivery?: boolean;
  storeName?: string;
  storeAddress?: string;
};

type DispatchDriver = {
  _id: string;
  nombre: string;
  telefono: string;
  estadoDisponibilidad?: "available" | "offline" | "busy" | "offer_pending";
  ofertaTipo?: "single" | "bundle";
  ofertaExpiraAt?: string;
  ultimoPedidoOfertadoRef?: string;
  pedidosOfertadosRefs?: string[];
  restauranteOfertaRef?: string;
};

type DispatchOptions = {
  excludedDriverIds?: string[];
};

const ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  totalPrice,
  paymentMethod,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  repartidorAsignado,
  "shippingAddress": shippingAddress,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": affiliateStore->name,
  "storeAddress": affiliateStore->address.street
}`;

const ORDERS_QUERY = `*[_type == "order" && _id in $orderIds]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  totalPrice,
  paymentMethod,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  repartidorAsignado,
  "shippingAddress": shippingAddress,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": affiliateStore->name,
  "storeAddress": affiliateStore->address.street
}`;

const STORE_DRIVERS_QUERY = `*[_type == "repartidor" && activo == true && disponible == true && estadoDisponibilidad in ["available", "offer_pending"] && tiendaAsignada._ref == $storeId]{
  _id,
  nombre,
  telefono,
  estadoDisponibilidad,
  ofertaTipo,
  ofertaExpiraAt,
  "ultimoPedidoOfertadoRef": ultimoPedidoOfertado._ref,
  "pedidosOfertadosRefs": pedidosOfertados[]._ref,
  "restauranteOfertaRef": restauranteOferta._ref
}`;

const COMMUNITY_DRIVERS_QUERY = `*[_type == "repartidor" && activo == true && disponible == true && estadoDisponibilidad in ["available", "offer_pending"] && !defined(tiendaAsignada)]{
  _id,
  nombre,
  telefono,
  estadoDisponibilidad,
  ofertaTipo,
  ofertaExpiraAt,
  "ultimoPedidoOfertadoRef": ultimoPedidoOfertado._ref,
  "pedidosOfertadosRefs": pedidosOfertados[]._ref,
  "restauranteOfertaRef": restauranteOferta._ref
}`;

function createOrderRef(orderId: string) {
  return { _type: "reference" as const, _ref: orderId };
}

function getPendingOfferOrderIds(driver: DispatchDriver): string[] {
  if (Array.isArray(driver.pedidosOfertadosRefs) && driver.pedidosOfertadosRefs.length > 0) {
    return driver.pedidosOfertadosRefs.filter(Boolean).slice(0, 2);
  }

  return driver.ultimoPedidoOfertadoRef ? [driver.ultimoPedidoOfertadoRef] : [];
}

function isExpiredOffer(driver: DispatchDriver, nowMs: number) {
  if (!driver.ofertaExpiraAt) {
    return false;
  }

  const expiresAtMs = new Date(driver.ofertaExpiraAt).getTime();
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

function buildOfferWindow() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OFFER_TTL_SECONDS * 1000);

  return {
    nowIso: now.toISOString(),
    expiresAtIso: expiresAt.toISOString(),
  };
}

function buildAddress(order: DispatchOrder) {
  if (!order.shippingAddress) {
    return "Ver pedido";
  }

  return (
    [order.shippingAddress.line1, order.shippingAddress.street, order.shippingAddress.city]
      .filter(Boolean)
      .join(", ")
      .trim() || "Ver pedido"
  );
}

function buildTotalLabel(total?: number) {
  return `$${(total ?? 0).toFixed(2)} MXN`;
}

function buildPaymentMethodLabel(paymentMethod?: string) {
  return paymentMethod === "cash_on_delivery" || paymentMethod === "cash_on_pickup"
    ? "COBRAR EN EFECTIVO"
    : "YA PAGADO";
}

function buildMapsUrl(order: DispatchOrder, address: string) {
  const mapsTarget = order.shippingAddress?.line1 || address;
  return `https://maps.google.com/?q=${encodeURIComponent(mapsTarget)}`;
}

async function fetchOrders(orderIds: string[]): Promise<DispatchOrder[]> {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  if (uniqueOrderIds.length === 0) {
    return [];
  }

  const orders = await backendClient.fetch(ORDERS_QUERY, { orderIds: uniqueOrderIds });
  const orderMap = new Map(orders.map((order: DispatchOrder) => [order._id, order]));
  return uniqueOrderIds.map((orderId) => orderMap.get(orderId)).filter(Boolean) as DispatchOrder[];
}

async function fetchCandidateDrivers(order: DispatchOrder, excludedDriverIds: string[]) {
  let drivers: DispatchDriver[] = [];

  if (order.storeHasOwnDelivery && order.storeId) {
    console.log(`[delivery-dispatch] Buscando repartidores de tienda (storeId: ${order.storeId})`);
    drivers = await backendClient.fetch(STORE_DRIVERS_QUERY, { storeId: order.storeId });
  } else {
    console.log("[delivery-dispatch] Buscando repartidores comunitarios");
    drivers = await backendClient.fetch(COMMUNITY_DRIVERS_QUERY, {});
  }

  const deduped = drivers.filter(
    (driver, index, self) => index === self.findIndex((candidate) => candidate.telefono === driver.telefono)
  );

  return deduped.filter((driver) => !excludedDriverIds.includes(driver._id));
}

async function markOrdersAsOffered(orderIds: string[], expiresAtIso: string) {
  await Promise.allSettled(
    [...new Set(orderIds)].map((orderId) =>
      backendClient
        .patch(orderId)
        .set({ deliveryOfertaEnviada: true, deliveryOfertaExpiresAt: expiresAtIso })
        .commit()
    )
  );
}

async function clearOrdersOfferState(orderIds: string[]) {
  const orders = await fetchOrders(orderIds);

  await Promise.allSettled(
    orders
      .filter((order) => !order.repartidorAsignado)
      .map((order) =>
        backendClient
          .patch(order._id)
          .set({ deliveryOfertaEnviada: false })
          .unset(["deliveryOfertaExpiresAt"])
          .commit()
      )
  );
}

async function notifyNoDrivers(orderNumbers: string[]) {
  if (!ADMIN_PHONE) {
    return;
  }

  const label = orderNumbers.map((orderNumber) => `#${orderNumber}`).join(", ");
  await sendWhatsAppMessage(
    ADMIN_PHONE,
    `Sin repartidores disponibles para ${label}. Por favor asigna manualmente.`
  ).catch((error) => console.error("[delivery-dispatch] Error notificando admin:", error));
}

async function prepareDriversForOffer(drivers: DispatchDriver[], orderIds: string[], storeId: string, offerType: "single" | "bundle", nowIso: string, expiresAtIso: string) {
  return Promise.allSettled(
    drivers.map((driver) =>
      backendClient
        .patch(driver._id)
        .set({
          estadoDisponibilidad: "offer_pending",
          ofertaTipo: offerType,
          pedidosOfertados: orderIds.map((orderId) => createOrderRef(orderId)),
          restauranteOferta: createOrderRef(storeId),
          ofertaEnviadaAt: nowIso,
          ofertaExpiraAt: expiresAtIso,
          ultimoPedidoOfertado: createOrderRef(orderIds[orderIds.length - 1]),
          ultimaActividad: nowIso,
        })
        .commit()
    )
  );
}

function buildBundleTotal(orders: DispatchOrder[]) {
  return buildTotalLabel(orders.reduce((sum, order) => sum + (order.totalPrice ?? 0), 0));
}

async function sendBundleOffers(drivers: DispatchDriver[], orders: DispatchOrder[]) {
  const restaurantName = orders[0]?.storeName ?? "La Tienda";
  const totalLabel = buildBundleTotal(orders);

  const results = await Promise.allSettled(
    drivers.map((driver) =>
      sendBundleDeliveryOffer(
        driver.telefono,
        restaurantName,
        orders.map((order) => order.orderNumber),
        totalLabel,
        orders.length
      )
    )
  );

  return results;
}

async function dispatchSingleOffer(order: DispatchOrder, excludedDriverIds: string[]): Promise<boolean> {
  const candidateDrivers = await fetchCandidateDrivers(order, excludedDriverIds);
  const nowMs = Date.now();
  const pendingSameStoreDrivers = candidateDrivers.filter((driver) => {
    if (driver.estadoDisponibilidad !== "offer_pending") {
      return false;
    }

    const offeredOrderIds = getPendingOfferOrderIds(driver);

    if (driver.restauranteOfertaRef && driver.restauranteOfertaRef !== order.storeId) {
      console.log("[delivery-dispatch] pedido no agregado porque es de otro restaurante", {
        repartidorId: driver._id,
        repartidorNombre: driver.nombre,
        restauranteOfertaRef: driver.restauranteOfertaRef,
        restauranteNuevo: order.storeId,
      });
      return false;
    }

    if (offeredOrderIds.length >= 2) {
      console.log("[delivery-dispatch] pedido no agregado porque ya se alcanzó máximo de 2 pedidos", {
        repartidorId: driver._id,
        repartidorNombre: driver.nombre,
        offeredOrderIds,
      });
      return false;
    }

    if (isExpiredOffer(driver, nowMs)) {
      console.log("[delivery-dispatch] conflicto de timing detectado", {
        motivo: "oferta_expirada_durante_conversion",
        repartidorId: driver._id,
        repartidorNombre: driver.nombre,
      });
      return false;
    }

    return offeredOrderIds.length === 1;
  });

  if (pendingSameStoreDrivers.length > 0 && order.storeId) {
    const storeId = order.storeId;
    const existingOrderIds = [...new Set(pendingSameStoreDrivers.flatMap((driver) => getPendingOfferOrderIds(driver)))];
    const existingOrders = await fetchOrders(existingOrderIds);
    const existingOrderMap = new Map(existingOrders.map((existingOrder) => [existingOrder._id, existingOrder]));
    const { nowIso, expiresAtIso } = buildOfferWindow();

    const eligibleDrivers = pendingSameStoreDrivers.filter((driver) => {
      const existingOrderId = getPendingOfferOrderIds(driver)[0];
      const existingOrder = existingOrderMap.get(existingOrderId);

      if (!existingOrder || existingOrder.repartidorAsignado || existingOrder.deliveryOfertaEnviada !== true) {
        console.log("[delivery-dispatch] conflicto de timing detectado", {
          motivo: "oferta_original_ya_resuelta",
          repartidorId: driver._id,
          repartidorNombre: driver.nombre,
          existingOrderId,
        });
        return false;
      }

      return true;
    });

    if (eligibleDrivers.length > 0) {
      await markOrdersAsOffered([order._id, ...existingOrderIds], expiresAtIso);

      const patchResults = await Promise.allSettled(
        eligibleDrivers.map(async (driver) => {
          const existingOrderId = getPendingOfferOrderIds(driver)[0];
          await backendClient
            .patch(driver._id)
            .set({
              estadoDisponibilidad: "offer_pending",
              ofertaTipo: "bundle",
              pedidosOfertados: [existingOrderId, order._id].map((orderId) => createOrderRef(orderId as string)),
              restauranteOferta: createOrderRef(storeId),
              ofertaEnviadaAt: nowIso,
              ofertaExpiraAt: expiresAtIso,
              ultimoPedidoOfertado: createOrderRef(order._id),
              ultimaActividad: nowIso,
            })
            .commit();
        })
      );

      const patchedDrivers = eligibleDrivers.filter((_, index) => patchResults[index]?.status === "fulfilled");
      if (patchedDrivers.length > 0) {
        const existingOrderId = getPendingOfferOrderIds(patchedDrivers[0])[0];
        const existingOrder = existingOrderMap.get(existingOrderId);
        if (existingOrder) {
          const bundleOrders = [existingOrder, order];
          const results = await sendBundleOffers(patchedDrivers, bundleOrders);
          const sentCount = results.filter((result) => result.status === "fulfilled").length;
          console.log("[delivery-dispatch] oferta convertida a bundle", {
            orderIds: bundleOrders.map((item) => item._id),
            storeId: order.storeId,
            repartidores: patchedDrivers.map((driver) => driver.nombre),
            enviados: sentCount,
          });
          return sentCount > 0;
        }
      }
    }
  }

  const availableDrivers = candidateDrivers.filter((driver) => driver.estadoDisponibilidad === "available");

  if (availableDrivers.length === 0) {
    console.warn(`[delivery-dispatch] Sin repartidores disponibles para orden ${order.orderNumber}`);
    await notifyNoDrivers([order.orderNumber]);
    return false;
  }

  const address = buildAddress(order);
  const totalLabel = buildTotalLabel(order.totalPrice);
  const paymentMethodLabel = buildPaymentMethodLabel(order.paymentMethod);
  const mapsUrl = buildMapsUrl(order, address);
  const { nowIso, expiresAtIso } = buildOfferWindow();

  await markOrdersAsOffered([order._id], expiresAtIso);

  const patchResults = await prepareDriversForOffer(availableDrivers, [order._id], order.storeId ?? "", "single", nowIso, expiresAtIso);
  const patchedDrivers = availableDrivers.filter((_, index) => patchResults[index]?.status === "fulfilled");

  if (patchedDrivers.length === 0) {
    console.error(`[delivery-dispatch] Ningun repartidor quedo preparado para aceptar la orden ${order.orderNumber}`);
    return false;
  }

  const results = await Promise.allSettled(
    patchedDrivers.map((driver) =>
      sendDeliveryOffer(
        driver.telefono,
        order.orderNumber,
        order.customerName ?? "Cliente",
        order.storeName ?? "La Tienda",
        address,
        totalLabel,
        paymentMethodLabel,
        mapsUrl
      )
    )
  );

  const sentCount = results.filter((result) => result.status === "fulfilled").length;
  console.log("[delivery-dispatch] oferta individual creada", {
    orderId: order._id,
    orderNumber: order.orderNumber,
    enviados: sentCount,
    repartidores: patchedDrivers.map((driver) => driver.nombre),
    expiraAt: expiresAtIso,
  });

  return sentCount > 0;
}

export async function dispatchDeliveryBundle(orderIds: string[], options: DispatchOptions = {}): Promise<boolean> {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))].slice(0, 2);
  if (uniqueOrderIds.length <= 1) {
    return uniqueOrderIds[0] ? dispatchDeliveryOffer(uniqueOrderIds[0], options) : false;
  }

  const orders = await fetchOrders(uniqueOrderIds);
  if (orders.length !== uniqueOrderIds.length) {
    console.error("[delivery-dispatch] No se pudo armar bundle; faltan pedidos", { orderIds: uniqueOrderIds });
    return false;
  }

  const [firstOrder, ...restOrders] = orders;
  if (!firstOrder.storeId || restOrders.some((order) => order.storeId !== firstOrder.storeId)) {
    console.log("[delivery-dispatch] pedido no agregado porque es de otro restaurante", {
      orderIds: uniqueOrderIds,
      stores: orders.map((order) => order.storeId),
    });
    return false;
  }

  if (orders.some((order) => order.repartidorAsignado)) {
    console.log("[delivery-dispatch] conflicto de timing detectado", {
      motivo: "bundle_ya_asignado",
      orderIds: uniqueOrderIds,
    });
    return false;
  }

  const candidateDrivers = await fetchCandidateDrivers(firstOrder, options.excludedDriverIds ?? []);
  const availableDrivers = candidateDrivers.filter((driver) => driver.estadoDisponibilidad === "available");

  if (availableDrivers.length === 0) {
    console.warn("[delivery-dispatch] Sin repartidores disponibles para bundle", {
      orderIds: uniqueOrderIds,
      orderNumbers: orders.map((order) => order.orderNumber),
    });
    await notifyNoDrivers(orders.map((order) => order.orderNumber));
    return false;
  }

  const { nowIso, expiresAtIso } = buildOfferWindow();
  await markOrdersAsOffered(uniqueOrderIds, expiresAtIso);

  const patchResults = await prepareDriversForOffer(availableDrivers, uniqueOrderIds, firstOrder.storeId, "bundle", nowIso, expiresAtIso);
  const patchedDrivers = availableDrivers.filter((_, index) => patchResults[index]?.status === "fulfilled");

  if (patchedDrivers.length === 0) {
    console.error("[delivery-dispatch] Ningun repartidor quedo preparado para aceptar el bundle", {
      orderIds: uniqueOrderIds,
    });
    return false;
  }

  const results = await sendBundleOffers(patchedDrivers, orders);
  const sentCount = results.filter((result) => result.status === "fulfilled").length;

  console.log("[delivery-dispatch] oferta bundle creada", {
    orderIds: uniqueOrderIds,
    orderNumbers: orders.map((order) => order.orderNumber),
    enviados: sentCount,
    repartidores: patchedDrivers.map((driver) => driver.nombre),
    expiraAt: expiresAtIso,
  });

  return sentCount > 0;
}

export async function redispatchOrders(orderIds: string[], excludedDriverIds: string[] = []): Promise<boolean> {
  const openOrders = await fetchOrders(orderIds);
  const redispatchableIds = openOrders.filter((order) => !order.repartidorAsignado).map((order) => order._id);

  if (redispatchableIds.length === 0) {
    return false;
  }

  await clearOrdersOfferState(redispatchableIds);

  if (redispatchableIds.length > 1) {
    const bundled = await dispatchDeliveryBundle(redispatchableIds, { excludedDriverIds });
    if (bundled) {
      return true;
    }
  }

  let sentAny = false;
  for (const orderId of redispatchableIds) {
    const sent = await dispatchDeliveryOffer(orderId, { excludedDriverIds });
    sentAny = sentAny || sent;
  }

  return sentAny;
}

export async function dispatchDeliveryOffer(orderId: string, options: DispatchOptions = {}): Promise<boolean> {
  console.log(`[delivery-dispatch] Iniciando dispatch para orderId: ${orderId}`);

  try {
    const order = await backendClient.fetch(ORDER_QUERY, { orderId }) as DispatchOrder | null;

    if (!order) {
      console.error(`[delivery-dispatch] Orden no encontrada: ${orderId}`);
      return false;
    }

    console.log(`[delivery-dispatch] Orden encontrada: #${order.orderNumber} | cliente: ${order.customerName} | tienda: ${order.storeName} | hasOwnDelivery: ${order.storeHasOwnDelivery}`);

    if (order.deliveryOfertaEnviada) {
      console.log(`[delivery-dispatch] Oferta ya enviada para orden ${order.orderNumber}, saliendo`);
      return false;
    }

    if (order.repartidorAsignado) {
      console.log("[delivery-dispatch] conflicto de timing detectado", {
        motivo: "pedido_ya_asignado",
        orderId: order._id,
        orderNumber: order.orderNumber,
      });
      return false;
    }

    return dispatchSingleOffer(order, options.excludedDriverIds ?? []);
  } catch (error) {
    console.error("[delivery-dispatch] Error general:", error);
    return false;
  }
}



