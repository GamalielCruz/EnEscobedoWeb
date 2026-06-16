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
  try {
    const order = await backendClient.fetch(ORDER_QUERY, { orderId });

    if (!order) {
      console.error(`[delivery-dispatch] Orden no encontrada: ${orderId}`);
      return;
    }

    if (order.deliveryOfertaEnviada) {
      console.log(`[delivery-dispatch] Oferta ya enviada para orden ${order.orderNumber}`);
      return;
    }

    // Obtener repartidores según tipo de tienda
    let drivers: Array<{ _id: string; nombre: string; telefono: string }> = [];

    if (order.storeHasOwnDelivery && order.storeId) {
      drivers = await backendClient.fetch(STORE_DRIVERS_QUERY, { storeId: order.storeId });
    } else {
      drivers = await backendClient.fetch(COMMUNITY_DRIVERS_QUERY, {});
    }

    if (!drivers || drivers.length === 0) {
      console.warn(`[delivery-dispatch] Sin repartidores disponibles para orden ${order.orderNumber}`);
      if (ADMIN_PHONE) {
        void sendWhatsAppMessage(
          ADMIN_PHONE,
          `⚠️ Sin repartidores disponibles para el pedido #${order.orderNumber}. Por favor asigna uno manualmente.`
        ).catch((e) => console.error("[delivery-dispatch] Error notificando admin:", e));
      }
      return;
    }

    const address = order.shippingAddress
      ? `${order.shippingAddress.street ?? ""}, ${order.shippingAddress.city ?? ""}`.trim().replace(/^,\s*|,\s*$/, "")
      : "Ver pedido";

    const total = `$${(order.totalPrice ?? 0).toFixed(2)} MXN`;

    // Enviar oferta a todos los repartidores simultáneamente
    const results = await Promise.allSettled(
      drivers.map((driver) =>
        sendDeliveryOffer(
          driver.telefono,
          order.orderNumber,
          order.customerName ?? "Cliente",
          address,
          total
        )
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    console.log(`[delivery-dispatch] Orden ${order.orderNumber}: ${sent} enviados, ${failed} fallidos`);

    // Actualizar ultimoPedidoOfertado y ultimaActividad en cada repartidor que recibió la oferta
    const now = new Date().toISOString();
    void Promise.allSettled(
      drivers
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

  } catch (error) {
    console.error("[delivery-dispatch] Error:", error);
  }
}
