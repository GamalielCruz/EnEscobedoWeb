import { appendOrderEvent } from "@/lib/order-events";
import { buildAddressMapsUrl } from "@/lib/order-maps";
import { isOrderDispatchable } from "@/lib/order-state";
import { isDriverDispatchEnabled } from "@/lib/fulfillment";
import { backendClient } from "@/sanity/lib/backendClient";
import { sendMandadoNoDriverAvailable } from "@/lib/mandado-whatsapp";
import { getDispatchConfig } from "@/lib/dispatch/dispatch-config";
import { sendBundleDeliveryOffer, sendDeliveryOffer, sendMandadoDeliveryOffer, sendWhatsAppInteractiveMessage, sendWhatsAppMessage } from "./whatsapp";
import { isWhatsAppConversationOpen, buildMandadoDeliveryOfferMessage } from "./whatsapp-conversation";

const OFFER_TTL_SECONDS = 10 * 60;
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_PHONE;

type DispatchOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  customerName?: string;
  phone?: string;
  totalPrice?: number;
  paymentMethod?: string;
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  dispatchStatus?: "scheduled" | "waiting_for_driver" | "offered" | "accepted" | "at_door" | "completed";
  deliveryOfertaEnviada?: boolean;
  deliveryOfertaExpiresAt?: string;
  repartidorAsignado?: unknown;
  offeredToRef?: string;
  shippingAddress?: {
    line1?: string;
    street?: string;
    city?: string;
    latitude?: number;
    longitude?: number;
  };
  storeId?: string;
  storeHasOwnDelivery?: boolean;
  storeName?: string;
  storeAddress?: string;
  serviceKind?: string;
  mandadoOrigin?: { label?: string; lat?: number; lng?: number };
  driverPayout?: number;
  shippingFee?: number;
  productsSubtotal?: number;
};

type DispatchDriver = {
  _id: string;
  nombre: string;
  telefono: string;
  disponible?: boolean;
  disponibleHasta?: string;
  estadoDisponibilidad?: "available" | "offline" | "busy" | "offer_pending";
  storeId?: string;
  ultimaActividad?: string;
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
  status,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  repartidorAsignado,
  "offeredToRef": offeredTo._ref,
  "shippingAddress": shippingAddress,
  serviceKind,
  mandadoOrigin,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label),
  driverPayout,
  shippingFee,
  productsSubtotal
}`;

const ORDERS_QUERY = `*[_type == "order" && _id in $orderIds]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  totalPrice,
  paymentMethod,
  status,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  repartidorAsignado,
  "offeredToRef": offeredTo._ref,
  "shippingAddress": shippingAddress,
  serviceKind,
  mandadoOrigin,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label)
}`;

const STORE_DRIVERS_QUERY = `*[_type == "repartidor" && activo == true && disponible == true && estadoDisponibilidad == "available" && (!defined(disponibleHasta) || disponibleHasta > $now) && tiendaAsignada._ref == $storeId] | order(_updatedAt asc){
  _id,
  nombre,
  telefono,
  disponible,
  disponibleHasta,
  estadoDisponibilidad,
  ultimaActividad
}`;

const COMMUNITY_DRIVERS_QUERY = `*[_type == "repartidor" && activo == true && disponible == true && estadoDisponibilidad == "available" && (!defined(disponibleHasta) || disponibleHasta > $now) && !defined(tiendaAsignada)] | order(_updatedAt asc){
  _id,
  nombre,
  telefono,
  disponible,
  disponibleHasta,
  estadoDisponibilidad,
  ultimaActividad
}`;

const DRIVER_BY_ID_QUERY = `*[_type == "repartidor" && _id == $driverId][0]{
  _id,
  nombre,
  telefono,
  disponible,
  disponibleHasta,
  estadoDisponibilidad,
  "storeId": tiendaAsignada._ref,
  ultimaActividad
}`;

const STORE_WAITING_ORDERS_QUERY = `*[
  _type == "order" &&
  dispatchStatus == "waiting_for_driver" &&
  !defined(repartidorAsignado) &&
  !defined(offeredTo) &&
  status != "shipped" &&
  status != "delivered" &&
  status != "cancelled" &&
  status != "refunded" &&
  orderStatus != "shipped" &&
  orderStatus != "delivered" &&
  orderStatus != "cancelled" &&
  orderStatus != "completed" &&
  orderStatus != "picked_up" &&
  paymentStatus != "failed" &&
  paymentStatus != "expired" &&
  paymentStatus != "refunded" &&
  paymentStatus != "requires_refund" &&
  affiliateStore._ref == $storeId
] | order(orderDate asc)[0...2]{ _id }`;

const COMMUNITY_WAITING_ORDERS_QUERY = `*[
  _type == "order" &&
  dispatchStatus == "waiting_for_driver" &&
  !defined(repartidorAsignado) &&
  !defined(offeredTo) &&
  status != "shipped" &&
  status != "delivered" &&
  status != "cancelled" &&
  status != "refunded" &&
  orderStatus != "shipped" &&
  orderStatus != "delivered" &&
  orderStatus != "cancelled" &&
  orderStatus != "completed" &&
  orderStatus != "picked_up" &&
  paymentStatus != "failed" &&
  paymentStatus != "expired" &&
  paymentStatus != "refunded" &&
  paymentStatus != "requires_refund" &&
  affiliateStore->hasOwnDelivery != true
] | order(orderDate asc)[0...2]{ _id }`;

function createOrderRef(orderId: string) {
  return { _type: "reference" as const, _ref: orderId };
}

function createDriverRef(driverId: string) {
  return { _type: "reference" as const, _ref: driverId };
}

function buildOfferWindow() {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OFFER_TTL_SECONDS * 1000);
  return { nowIso: now.toISOString(), expiresAtIso: expiresAt.toISOString() };
}

function buildAddress(order: DispatchOrder) {
  if (!order.shippingAddress) return "Ver pedido";
  return [order.shippingAddress.line1, order.shippingAddress.street, order.shippingAddress.city].filter(Boolean).join(", ").trim() || "Ver pedido";
}

function buildTotalLabel(total?: number) {
  return `$${(total ?? 0).toFixed(2)} MXN`;
}

function buildPaymentMethodLabel(paymentMethod?: string) {
  return paymentMethod === "cash_on_delivery" || paymentMethod === "cash_on_pickup" ? "COBRAR EN EFECTIVO" : "YA PAGADO";
}

async function fetchOrders(orderIds: string[]): Promise<DispatchOrder[]> {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))];
  if (uniqueOrderIds.length === 0) return [];
  const orders = await backendClient.fetch(ORDERS_QUERY, { orderIds: uniqueOrderIds });
  const orderMap = new Map(orders.map((order: DispatchOrder) => [order._id, order]));
  return uniqueOrderIds.map((orderId) => orderMap.get(orderId)).filter(Boolean) as DispatchOrder[];
}

async function fetchCandidateDrivers(order: DispatchOrder, excludedDriverIds: string[]) {
  let drivers: DispatchDriver[] = [];
  const now = new Date().toISOString();

  if (order.storeHasOwnDelivery && order.storeId) {
    console.log(`[delivery-dispatch] buscando repartidores de tienda ${order.storeId}`);
    drivers = await backendClient.fetch(STORE_DRIVERS_QUERY, { storeId: order.storeId, now });
  } else {
    console.log("[delivery-dispatch] buscando repartidores comunitarios");
    drivers = await backendClient.fetch(COMMUNITY_DRIVERS_QUERY, { now });
  }

  const deduped = drivers.filter((driver, index, self) => index === self.findIndex((candidate) => candidate.telefono === driver.telefono));
  return deduped.filter((driver) => !excludedDriverIds.includes(driver._id));
}

async function setOrdersWaiting(orderIds: string[], reason: string) {
  const orders = await fetchOrders(orderIds);
  const now = new Date().toISOString();

  await Promise.allSettled(
    orders
      .filter((order) => !order.repartidorAsignado)
      .map((order) =>
        backendClient
          .patch(order._id)
          .ifRevisionId(order._rev)
          .set({
            deliveryOfertaEnviada: false,
            dispatchStatus: "waiting_for_driver",
            updatedAt: now,
          })
          .unset(["deliveryOfertaExpiresAt", "offeredTo"])
          .commit()
      )
  );

  await Promise.allSettled(
    orders
      .filter((order) => !order.repartidorAsignado)
      .map((order) =>
        appendOrderEvent(order._id, {
          type:
            reason === "offer_expired"
              ? "offer_expired"
              : reason === "offer_cancelled"
                ? "offer_cancelled"
                : "offer_rejected",
          source: "delivery-dispatch",
          reason,
        })
      )
  );

  if (orders.length > 0) {
    console.log("[delivery-dispatch] ordenes esperando repartidor", { reason, orderIds: orders.map((order) => order._id) });
  }
}

async function markOrdersAsOffered(orderIds: string[], driverId: string, expiresAtIso: string) {
  const orders = await fetchOrders(orderIds);
  const now = new Date().toISOString();

  await Promise.all(
    orders.map((order) =>
      backendClient
        .patch(order._id)
        .ifRevisionId(order._rev)
        .set({
          deliveryOfertaEnviada: true,
          deliveryOfertaExpiresAt: expiresAtIso,
          dispatchStatus: "offered",
          offeredTo: createDriverRef(driverId),
          updatedAt: now,
        })
        .commit()
    )
  );

  await Promise.allSettled(
    orders.map((order) =>
      appendOrderEvent(order._id, {
        type: "offer_sent",
        source: "delivery-dispatch",
        actor: driverId,
        payload: { driverId, expiresAt: expiresAtIso },
      })
    )
  );
}

async function prepareDriverForOffer(driver: DispatchDriver, orderIds: string[], storeId: string | null, offerType: "single" | "bundle", nowIso: string, expiresAtIso: string) {
  const restaurantPatch = storeId ? { restauranteOferta: createOrderRef(storeId) } : {};
  await backendClient
    .patch(driver._id)
    .set({
      estadoDisponibilidad: "offer_pending",
      ofertaTipo: offerType,
      pedidosOfertados: orderIds.map((orderId) => createOrderRef(orderId)),
      ...restaurantPatch,
      ofertaEnviadaAt: nowIso,
      ofertaExpiraAt: expiresAtIso,
      ultimoPedidoOfertado: createOrderRef(orderIds[orderIds.length - 1]),
      ultimaActividad: nowIso,
    })
    .commit();
}

async function notifyNoDrivers(orderNumbers: string[]) {
  if (!ADMIN_PHONE) return;
  const label = orderNumbers.map((orderNumber) => `#${orderNumber}`).join(", ");
  await sendWhatsAppMessage(ADMIN_PHONE, `Sin repartidores disponibles para ${label}. Por favor asigna manualmente.`).catch((error) =>
    console.error("[delivery-dispatch] error notificando admin:", error)
  );
}

function buildBundleTotal(orders: DispatchOrder[]) {
  return buildTotalLabel(orders.reduce((sum, order) => sum + (order.totalPrice ?? 0), 0));
}

async function rollbackDriverOffer(driverId: string) {
  await backendClient
    .patch(driverId)
    .set({ estadoDisponibilidad: "available", ultimaActividad: new Date().toISOString() })
    .unset(["ultimoPedidoOfertado", "pedidosOfertados", "restauranteOferta", "ofertaTipo", "ofertaEnviadaAt", "ofertaExpiraAt"])
    .commit()
    .catch(() => null);
}

async function dispatchSingleOffer(order: DispatchOrder, excludedDriverIds: string[]): Promise<boolean> {
  const candidateDrivers = await fetchCandidateDrivers(order, excludedDriverIds);
  const selectedDriver = candidateDrivers[0];

  if (!selectedDriver) {
    console.log("[delivery-dispatch] no hay repartidores disponibles", { orderId: order._id, orderNumber: order.orderNumber });
    await setOrdersWaiting([order._id], "no_drivers_available");
    await notifyNoDrivers([order.orderNumber]);
    // Mandados: avisar al cliente con la plantilla de contingencia (esperar / recoger / ayuda)
    if (order.serviceKind === "mandado" && order.phone) {
      await sendMandadoNoDriverAvailable({
        _id: order._id,
        phone: order.phone,
        customerName: order.customerName ?? "Cliente",
        orderNumber: order.orderNumber,
      }).catch((error) =>
        console.error("[delivery-dispatch] error notificando contingencia mandado:", error)
      );
    }
    return false;
  }

  const address = buildAddress(order);
  const totalLabel = buildTotalLabel(order.totalPrice);
  const paymentMethodLabel = buildPaymentMethodLabel(order.paymentMethod);
  const mapsUrl = buildAddressMapsUrl(order.shippingAddress, address);
  const { nowIso, expiresAtIso } = buildOfferWindow();

  await markOrdersAsOffered([order._id], selectedDriver._id, expiresAtIso);
  await prepareDriverForOffer(selectedDriver, [order._id], order.storeId ?? null, "single", nowIso, expiresAtIso);

  try {
    if (order.serviceKind === "mandado") {
      const pickupAddress = order.mandadoOrigin?.label || order.storeAddress || address;
      const deliveryAddress = order.shippingAddress?.line1 || address;
      const driverPayoutLabel = buildTotalLabel(order.driverPayout ?? 0);
      const windowOpen = isWhatsAppConversationOpen(selectedDriver.ultimaActividad, new Date());

      if (windowOpen) {
        // Interactive message with ACEPTO button: same acceptance flow as text command
        const offerBody = buildMandadoDeliveryOfferMessage({
          orderNumber: order.orderNumber,
          customerName: order.customerName ?? "Cliente",
          pickupAddress,
          deliveryAddress,
          driverPayoutLabel,
          customerTotalLabel: totalLabel,
          paymentMethod: paymentMethodLabel,
        });
        await sendWhatsAppInteractiveMessage(
          selectedDriver.telefono,
          offerBody,
          [{ type: "reply", id: "ACEPTO", title: "Aceptar mandado" }]
        );
        console.log("[delivery-dispatch] oferta mandado enviada (interactivo)", {
          orderId: order._id,
          repartidorId: selectedDriver._id,
          channel: "interactive",
        });
      } else {
        // Template fallback: works even without open conversation
        await sendMandadoDeliveryOffer(
          selectedDriver.telefono,
          order.orderNumber,
          order.customerName ?? "Cliente",
          pickupAddress,
          deliveryAddress,
          driverPayoutLabel,
          totalLabel,
          paymentMethodLabel,
          mapsUrl
        );
        console.log("[delivery-dispatch] oferta mandado enviada (template)", {
          orderId: order._id,
          repartidorId: selectedDriver._id,
          channel: "template",
        });
      }
    } else {
      const restaurantAmount = (order.totalPrice ?? 0) - (order.driverPayout ?? 0);
      await sendDeliveryOffer(
        selectedDriver.telefono,
        order.orderNumber,
        order.customerName ?? "Cliente",
        order.storeName ?? "La Tienda",
        address,
        totalLabel,
        paymentMethodLabel,
        mapsUrl,
        buildTotalLabel(restaurantAmount),
        buildTotalLabel(order.driverPayout ?? 0)
      );
    }
  } catch (error) {
    await rollbackDriverOffer(selectedDriver._id);
    await setOrdersWaiting([order._id], "send_offer_failed");
    console.error("[delivery-dispatch] error enviando oferta", { orderId: order._id, repartidorId: selectedDriver._id, error });
    return false;
  }

  console.log("[delivery-dispatch] oferta enviada", {
    orderId: order._id,
    orderNumber: order.orderNumber,
    repartidorId: selectedDriver._id,
    repartidorNombre: selectedDriver.nombre,
    expiraAt: expiresAtIso,
  });
  return true;
}

/**
 * Oferta manual desde el Dispatch Center (SOLO mandados).
 *
 * En los 3 modos (auto/manual/asistido), "seleccionar repartidor" para un
 * mandado NUNCA asigna: crea una oferta por WhatsApp (plantilla `oferta_reparto`).
 * La asignación real ocurre únicamente cuando el repartidor ACEPTA en el webhook
 * (assignOrderToDriver, atómico con ifRevisionId). Los restaurantes conservan la
 * asignación directa (assignOrderToDriver desde la ruta).
 *
 * Protección de concurrencia:
 *  - `markOrdersAsOffered` usa ifRevisionId: si la orden cambió (otro operador
 *    la ofertó/asignó en paralelo), el patch falla y NO se envía la oferta.
 *  - Una orden solo puede tener UNA oferta pendiente (`offeredTo`). Tras un
 *    rechazo/expiración, setOrdersWaiting limpia `offeredTo` y se puede re-ofertar
 *    a otro repartidor; nunca hay dos ofertas simultáneas sobre el mismo mandado.
 *  - Al aceptar, assignOrderToDriver vuelve a validar con ifRevisionId: si dos
 *    repartidores aceptaran en paralelo, solo el primero gana.
 */
export async function offerOrderToDriver(
  orderId: string,
  driverId: string,
  options: { reason?: string } = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const order = (await backendClient.fetch(ORDER_QUERY, { orderId })) as DispatchOrder | null;
  if (!order) return { ok: false, error: "El pedido no existe." };

  // El flujo de oferta aplica SOLO a mandados.
  if (order.serviceKind !== "mandado") {
    return { ok: false, error: "El flujo de oferta solo aplica a mandados." };
  }
  if (!isDriverDispatchEnabled(order.storeHasOwnDelivery)) {
    return { ok: false, error: "El reparto no está habilitado para este pedido." };
  }
  if (!isOrderDispatchable(order)) {
    return { ok: false, error: "El pedido no está en estado despachable." };
  }
  if (order.repartidorAsignado) {
    return { ok: false, error: "El mandado ya tiene repartidor asignado." };
  }
  if (order.deliveryOfertaEnviada && order.offeredToRef) {
    return { ok: false, error: "El mandado ya tiene una oferta pendiente con otro repartidor." };
  }

  const driver = (await backendClient.fetch(DRIVER_BY_ID_QUERY, { driverId })) as DispatchDriver | null;
  if (!driver) return { ok: false, error: "El repartidor no existe." };
  if (!driver.disponible || driver.estadoDisponibilidad !== "available") {
    return { ok: false, error: "El repartidor no está disponible en este momento." };
  }
  if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= Date.now()) {
    return { ok: false, error: "La sesión de disponibilidad del repartidor terminó; reanúdalo antes de ofertar." };
  }

  const { nowIso, expiresAtIso } = buildOfferWindow();

  try {
    await markOrdersAsOffered([order._id], driver._id, expiresAtIso);
    await prepareDriverForOffer(driver, [order._id], order.storeId ?? null, "single", nowIso, expiresAtIso);
  } catch (error) {
    // Limpieza ante fallo parcial: si markOrdersAsOffered ya mutó la orden (o
    // prepareDriverForOffer al repartidor), se revierte el estado de oferta.
    // Ambas llamadas son seguras de ejecutar incluso si una no llegó a mutar.
    await setOrdersWaiting([order._id], "offer_prepare_failed").catch(() => null);
    await rollbackDriverOffer(driver._id).catch(() => null);
    console.error("[delivery-dispatch] error marcando oferta manual", { orderId, driverId, error });
    return { ok: false, error: "No se pudo crear la oferta (el pedido cambió de estado en el servidor)." };
  }

  const address = buildAddress(order);
  const totalLabel = buildTotalLabel(order.totalPrice);
  const paymentMethodLabel = buildPaymentMethodLabel(order.paymentMethod);
  const mapsUrl = buildAddressMapsUrl(order.shippingAddress, address);
  const pickupAddress = order.mandadoOrigin?.label || order.storeAddress || address;
  const deliveryAddress = order.shippingAddress?.line1 || address;

  try {
    const driverPayoutLabel = buildTotalLabel(order.driverPayout ?? 0);
    const windowOpen = isWhatsAppConversationOpen(driver.ultimaActividad, new Date());

    if (windowOpen) {
      const offerBody = buildMandadoDeliveryOfferMessage({
        orderNumber: order.orderNumber,
        customerName: order.customerName ?? "Cliente",
        pickupAddress,
        deliveryAddress,
        driverPayoutLabel,
        customerTotalLabel: totalLabel,
        paymentMethod: paymentMethodLabel,
      });
      await sendWhatsAppInteractiveMessage(
        driver.telefono,
        offerBody,
        [{ type: "reply", id: "ACEPTO", title: "Aceptar mandado" }]
      );
      console.log("[delivery-dispatch] oferta manual mandado enviada (interactivo)", {
        orderId,
        repartidorId: driver._id,
        channel: "interactive",
      });
    } else {
      await sendMandadoDeliveryOffer(
        driver.telefono,
        order.orderNumber,
        order.customerName ?? "Cliente",
        pickupAddress,
        deliveryAddress,
        driverPayoutLabel,
        totalLabel,
        paymentMethodLabel,
        mapsUrl
      );
      console.log("[delivery-dispatch] oferta manual mandado enviada (template)", {
        orderId,
        repartidorId: driver._id,
        channel: "template",
      });
    }
  } catch (error) {
    await rollbackDriverOffer(driver._id);
    await setOrdersWaiting([order._id], "send_offer_failed");
    console.error("[delivery-dispatch] error enviando oferta manual", { orderId, driverId, error });
    return { ok: false, error: "No se pudo enviar la oferta por WhatsApp." };
  }

  console.log("[delivery-dispatch] oferta manual enviada", {
    orderId: order._id,
    orderNumber: order.orderNumber,
    repartidorId: driver._id,
    repartidorNombre: driver.nombre,
    expiraAt: expiresAtIso,
    reason: options.reason,
  });
  return { ok: true };
}

export async function dispatchDeliveryBundle(orderIds: string[], options: DispatchOptions = {}): Promise<boolean> {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))].slice(0, 2);
  if (uniqueOrderIds.length <= 1) return uniqueOrderIds[0] ? dispatchDeliveryOffer(uniqueOrderIds[0], options) : false;

  // Modo del Dispatch Center: en manual/asistido el sistema NO ofrece bundles
  // automáticamente por WhatsApp. El operador asigna desde /admin/dispatch.
  const bundleConfig = await getDispatchConfig().catch(() => null);
  if (bundleConfig && bundleConfig.mode !== "auto") {
    console.log(`[delivery-dispatch] modo ${bundleConfig.mode}: se omite bundle automático`);
    await setOrdersWaiting(uniqueOrderIds, `dispatch_mode_${bundleConfig.mode}`).catch(() => null);
    return false;
  }

  // No ofrecer un bundle que el repartidor no podría aceptar: si la
  // configuración no permite múltiples pedidos o el bundle supera la
  // capacidad máxima, se cae a ofertas individuales.
  if (bundleConfig && !bundleConfig.allowMultipleOrders) {
    console.log("[delivery-dispatch] bundle omitido por allowMultipleOrders=false", { orderIds: uniqueOrderIds });
    return false;
  }
  if (bundleConfig && bundleConfig.maxOrdersPerDriver < uniqueOrderIds.length) {
    console.log("[delivery-dispatch] bundle omitido por exceder maxOrdersPerDriver", {
      orderIds: uniqueOrderIds,
      maxOrdersPerDriver: bundleConfig.maxOrdersPerDriver,
    });
    return false;
  }

  const orders = await fetchOrders(uniqueOrderIds);
  if (orders.some((order) => !isDriverDispatchEnabled(order.storeHasOwnDelivery))) return false;
  if (orders.length !== uniqueOrderIds.length) {
    console.error("[delivery-dispatch] faltan pedidos para bundle", { orderIds: uniqueOrderIds });
    return false;
  }

  const [firstOrder, ...restOrders] = orders;
  if (!firstOrder.storeId || restOrders.some((order) => order.storeId !== firstOrder.storeId)) {
    console.log("[delivery-dispatch] bundle omitido por tiendas distintas", { orderIds: uniqueOrderIds, stores: orders.map((order) => order.storeId) });
    return false;
  }
  if (orders.some((order) => !isOrderDispatchable(order))) {
    console.log("[delivery-dispatch] bundle omitido por pedido no despachable", { orderIds: uniqueOrderIds });
    return false;
  }

  const candidateDrivers = await fetchCandidateDrivers(firstOrder, options.excludedDriverIds ?? []);
  const selectedDriver = candidateDrivers[0];
  if (!selectedDriver) {
    console.warn("[delivery-dispatch] sin repartidores para bundle", { orderIds: uniqueOrderIds, orderNumbers: orders.map((order) => order.orderNumber) });
    await setOrdersWaiting(uniqueOrderIds, "no_drivers_available_bundle");
    await notifyNoDrivers(orders.map((order) => order.orderNumber));
    return false;
  }

  const { nowIso, expiresAtIso } = buildOfferWindow();
  await markOrdersAsOffered(uniqueOrderIds, selectedDriver._id, expiresAtIso);
  await prepareDriverForOffer(selectedDriver, uniqueOrderIds, firstOrder.storeId, "bundle", nowIso, expiresAtIso);

  try {
    await sendBundleDeliveryOffer(
      selectedDriver.telefono,
      firstOrder.storeName ?? "La Tienda",
      orders.map((order) => order.orderNumber),
      buildBundleTotal(orders),
      orders.length
    );
  } catch (error) {
    await rollbackDriverOffer(selectedDriver._id);
    await setOrdersWaiting(uniqueOrderIds, "send_bundle_offer_failed");
    console.error("[delivery-dispatch] error enviando bundle", { orderIds: uniqueOrderIds, repartidorId: selectedDriver._id, error });
    return false;
  }

  console.log("[delivery-dispatch] bundle enviado", {
    orderIds: uniqueOrderIds,
    orderNumbers: orders.map((order) => order.orderNumber),
    repartidorId: selectedDriver._id,
    repartidorNombre: selectedDriver.nombre,
    expiraAt: expiresAtIso,
  });
  return true;
}

/**
 * Cancelación manual de una oferta pendiente desde el Dispatch Center.
 *
 * Solo aplica a pedidos en estado `offered` con una oferta vigente (`offeredTo`).
 * Devuelve el pedido a la cola (waiting_for_driver), registra el evento
 * `offer_cancelled` (vía el código interno `reason === "offer_cancelled"`) y
 * libera al repartidor (vuelve a available, sin ofertas) SOLO si la orden se
 * liberó realmente.
 *
 * Protección de concurrencia:
 *  - La validación del estado se hace con datos frescos; si la oferta ya no está
 *    vigente, se rechaza sin mutar nada.
 *  - releaseOrdersForDriver re-fetcha y filtra con ifRevisionId: si en paralelo
 *    el repartidor ACEPTÓ (assignOrderToDriver ya lo puso en busy con pedidos
 *    activos), `released.length === 0` y NO se toca al repartidor (clobberearlo
 *    a available corrompería la máquina de estados).
 */
export async function cancelOrderOffer(
  orderId: string,
  driverId: string,
  reason = "offer_cancelled"
): Promise<{ ok: true; released: boolean } | { ok: false; error: string }> {
  const order = (await backendClient.fetch(
    `*[_type == "order" && _id == $orderId][0]{
      _id,
      dispatchStatus,
      "offeredToRef": offeredTo._ref
    }`,
    { orderId }
  )) as { _id: string; dispatchStatus?: string; offeredToRef?: string } | null;
  if (!order) return { ok: false, error: "El pedido no existe." };
  if (String(order.dispatchStatus ?? "") !== "offered" || String(order.offeredToRef ?? "") !== driverId) {
    return { ok: false, error: "El pedido no tiene una oferta pendiente con ese repartidor." };
  }

  const released = await releaseOrdersForDriver([orderId], driverId, reason);

  if (released.length > 0) {
    // Limpiar el estado de oferta del repartidor: vuelve a available para poder
    // recibir nuevas ofertas (mismo efecto que clearPendingOfferForDriver del webhook).
    await backendClient
      .patch(driverId)
      .set({ estadoDisponibilidad: "available", ultimaActividad: new Date().toISOString() })
      .unset([
        "ultimoPedidoOfertado",
        "pedidosOfertados",
        "restauranteOferta",
        "ofertaTipo",
        "ofertaEnviadaAt",
        "ofertaExpiraAt",
      ])
      .commit()
      .catch(() => null);
  }

  return { ok: true, released: released.length > 0 };
}

export async function releaseOrdersForDriver(orderIds: string[], driverId: string, reason: string): Promise<string[]> {
  const orders = await fetchOrders(orderIds);
  const releasable = orders.filter((order) => !order.repartidorAsignado && order.offeredToRef === driverId);
  if (releasable.length === 0) return [];

  await setOrdersWaiting(releasable.map((order) => order._id), reason);
  console.log("[delivery-dispatch] ofertas liberadas", { reason, repartidorId: driverId, orderIds: releasable.map((order) => order._id) });
  return releasable.map((order) => order._id);
}

export async function redispatchOrders(orderIds: string[], excludedDriverIds: string[] = []): Promise<boolean> {
  const openOrders = await fetchOrders(orderIds);
  const redispatchableIds = openOrders
    .filter((order) => isDriverDispatchEnabled(order.storeHasOwnDelivery) && isOrderDispatchable(order))
    .map((order) => order._id);
  if (redispatchableIds.length === 0) return false;

  await setOrdersWaiting(redispatchableIds, "redispatch");
  if (redispatchableIds.length > 1) {
    const bundled = await dispatchDeliveryBundle(redispatchableIds, { excludedDriverIds });
    if (bundled) return true;
  }

  let sentAny = false;
  for (const orderId of redispatchableIds) {
    const sent = await dispatchDeliveryOffer(orderId, { excludedDriverIds });
    sentAny = sentAny || sent;
  }
  return sentAny;
}

export async function dispatchWaitingOrdersForDriver(driverId: string): Promise<boolean> {
  const driver = (await backendClient.fetch(DRIVER_BY_ID_QUERY, { driverId })) as DispatchDriver | null;
  if (!driver || !driver.disponible || driver.estadoDisponibilidad !== "available") return false;
  if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= Date.now()) return false;
  if (!isDriverDispatchEnabled(Boolean(driver.storeId))) return false;

  const waitingOrders = driver.storeId
    ? ((await backendClient.fetch(STORE_WAITING_ORDERS_QUERY, { storeId: driver.storeId })) as Array<{ _id: string }>)
    : ((await backendClient.fetch(COMMUNITY_WAITING_ORDERS_QUERY, {})) as Array<{ _id: string }>);

  const waitingOrderIds = waitingOrders.map((order) => order._id).filter(Boolean);
  if (waitingOrderIds.length === 0) return false;
  return redispatchOrders(waitingOrderIds);
}

export async function dispatchDeliveryOffer(orderId: string, options: DispatchOptions = {}): Promise<boolean> {
  console.log(`[delivery-dispatch] iniciando dispatch ${orderId}`);

  // Modo del Dispatch Center: en manual/asistido el sistema NO ofrece pedidos
  // automáticamente por WhatsApp. El operador asigna desde /admin/dispatch.
  const dispatchConfig = await getDispatchConfig().catch(() => null);
  if (dispatchConfig && dispatchConfig.mode !== "auto") {
    console.log(`[delivery-dispatch] modo ${dispatchConfig.mode}: se omite oferta automática ${orderId}`);
    await setOrdersWaiting([orderId], `dispatch_mode_${dispatchConfig.mode}`).catch(() => null);
    return false;
  }

  try {
    const order = (await backendClient.fetch(ORDER_QUERY, { orderId })) as DispatchOrder | null;
    if (!order) {
      console.error(`[delivery-dispatch] orden no encontrada ${orderId}`);
      return false;
    }
    if (!isDriverDispatchEnabled(order.storeHasOwnDelivery)) return false;
    if (!isOrderDispatchable(order)) {
      console.log("[delivery-dispatch] pedido no despachable", {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
      });
      return false;
    }
    if (order.deliveryOfertaEnviada && order.offeredToRef) {
      console.log("[delivery-dispatch] orden ya ofrecida", { orderId: order._id, orderNumber: order.orderNumber, offeredTo: order.offeredToRef });
      return false;
    }
    return dispatchSingleOffer(order, options.excludedDriverIds ?? []);
  } catch (error) {
    console.error("[delivery-dispatch] error general", error);
    return false;
  }
}
