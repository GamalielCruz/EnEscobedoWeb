import { backendClient } from "@/sanity/lib/backendClient";
import { sendDeliveryOffer, sendWhatsAppMessage } from "./whatsapp";

const OFFER_TTL_MINUTES = 10;
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_PHONE;

const ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  orderNumber,
  customerName,
  phone,
  totalPrice,
  paymentMethod,
  deliveryOfertaEnviada,
  repartidorAsignado,
  "shippingAddress": shippingAddress,
  "storeId": affiliateStore._ref,
  "storeHasOwnDelivery": affiliateStore->hasOwnDelivery,
  "storeName": affiliateStore->name,
  "storeAddress": affiliateStore->address.street
}`;

const STORE_DRIVERS_QUERY = `*[_type == "repartidor" && activo == true && disponible == true && tiendaAsignada._ref == $storeId]{
  _id, nombre, telefono
}`;

const COMMUNITY_DRIVERS_QUERY = `*[_type == "repartidor" && activo == true && disponible == true && !defined(tiendaAsignada)]{
  _id, nombre, telefono
}`;

export async function dispatchDeliveryOffer(orderId: string): Promise<void> {
  console.log(`[delivery-dispatch] Iniciando dispatch para orderId: ${orderId}`);

  try {
    const order = await backendClient.fetch(ORDER_QUERY, { orderId });

    if (!order) {
      console.error(`[delivery-dispatch] ❌ Orden no encontrada: ${orderId}`);
      return;
    }

    console.log(`[delivery-dispatch] ✅ Orden encontrada: #${order.orderNumber} | cliente: ${order.customerName} | tienda: ${order.storeName} | hasOwnDelivery: ${order.storeHasOwnDelivery}`);

    if (order.deliveryOfertaEnviada) {
      console.log(`[delivery-dispatch] ⚠️ Oferta ya enviada para orden ${order.orderNumber}, saliendo`);
      return;
    }

    // Obtener repartidores según tipo de tienda
    let drivers: Array<{ _id: string; nombre: string; telefono: string }> = [];

    if (order.storeHasOwnDelivery && order.storeId) {
      console.log(`[delivery-dispatch] Buscando repartidores de tienda (storeId: ${order.storeId})`);
      drivers = await backendClient.fetch(STORE_DRIVERS_QUERY, { storeId: order.storeId });
    } else {
      console.log(`[delivery-dispatch] Buscando repartidores comunitarios`);
      drivers = await backendClient.fetch(COMMUNITY_DRIVERS_QUERY, {});
    }

    if (!drivers || drivers.length === 0) {
      console.warn(`[delivery-dispatch] ⚠️ Sin repartidores disponibles para orden ${order.orderNumber}`);
      if (ADMIN_PHONE) {
        void sendWhatsAppMessage(
          ADMIN_PHONE,
          `⚠️ Sin repartidores disponibles para el pedido #${order.orderNumber}. Por favor asigna uno manualmente.`
        ).catch((e) => console.error("[delivery-dispatch] Error notificando admin:", e));
      }
      return;
    }

    console.log(`[delivery-dispatch] ✅ ${drivers.length} repartidor(es) disponibles: ${drivers.map((d) => d.nombre).join(", ")}`);

    // Deduplicar por teléfono antes de enviar
    const uniqueDrivers = drivers.filter(
      (driver, index, self) =>
        index === self.findIndex((d) => d.telefono === driver.telefono)
    );

    if (uniqueDrivers.length < drivers.length) {
      console.log(`[delivery-dispatch] Deduplicados: ${drivers.length} → ${uniqueDrivers.length} repartidor(es) únicos`);
    }

    const address = order.shippingAddress
      ? [order.shippingAddress.line1, order.shippingAddress.street, order.shippingAddress.city]
          .filter(Boolean)
          .join(", ")
          .trim() || "Ver pedido"
      : "Ver pedido";

    const total = `$${(order.totalPrice ?? 0).toFixed(2)} MXN`;

    const paymentMethodDisplay =
      order.paymentMethod === "cash_on_delivery" || order.paymentMethod === "cash_on_pickup"
        ? "COBRAR EN EFECTIVO"
        : "YA PAGADO";

    const mapsUrl = order.shippingAddress?.line1
      ? `https://maps.google.com/maps?q=${encodeURIComponent(order.shippingAddress.line1)}`
      : `https://maps.google.com/maps?q=${encodeURIComponent(address)}`;

    console.log(`[delivery-dispatch] Enviando oferta a ${uniqueDrivers.length} repartidor(es) | dirección: ${address} | total: ${total} | pago: ${paymentMethodDisplay}`);

    // Enviar oferta a todos los repartidores únicos simultáneamente
    const results = await Promise.allSettled(
      uniqueDrivers.map((driver) =>
        sendDeliveryOffer(
          driver.telefono,
          order.orderNumber,
          order.customerName ?? "Cliente",
          order.storeName ?? "La Tienda",
          address,
          total,
          paymentMethodDisplay,
          mapsUrl
        ).then((res) => {
          console.log(`[delivery-dispatch] ✅ Oferta enviada a ${driver.nombre} (${driver.telefono}):`, JSON.stringify(res));
          return res;
        }).catch((err) => {
          console.error(`[delivery-dispatch] ❌ Error enviando a ${driver.nombre} (${driver.telefono}):`, err?.message ?? err);
          throw err;
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`[delivery-dispatch] Resultado: ${sent} enviados ✅, ${failed} fallidos ❌`);

    // Actualizar ultimoPedidoOfertado y ultimaActividad en cada repartidor que recibió la oferta
    const now = new Date().toISOString();
    void Promise.allSettled(
      uniqueDrivers
        .filter((_, i) => results[i].status === "fulfilled")
        .map((driver) =>
          backendClient
            .patch(driver._id)
            .set({
              ultimoPedidoOfertado: { _type: "reference", _ref: orderId },
              ultimaActividad: now,
            })
            .commit()
        )
    ).catch((e) => console.error("[delivery-dispatch] Error actualizando repartidores:", e));

    // Actualizar orden en Sanity
    const expiresAt = new Date(Date.now() + OFFER_TTL_MINUTES * 60 * 1000).toISOString();
    await backendClient
      .patch(orderId)
      .set({ deliveryOfertaEnviada: true, deliveryOfertaExpiresAt: expiresAt })
      .commit();

    console.log(`[delivery-dispatch] ✅ Orden ${order.orderNumber} actualizada — oferta expira: ${expiresAt}`);

  } catch (error) {
    console.error("[delivery-dispatch] ❌ Error general:", error);
  }
}
