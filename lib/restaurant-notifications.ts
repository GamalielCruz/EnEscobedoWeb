import { sendNuevoPedidoRestaurante, sendRepartidorEnCaminoRestaurante } from "@/lib/whatsapp";
import { readClient } from "@/sanity/lib/client";

type RestaurantOrderProduct = {
  quantity?: number;
  product?: {
    name?: string | null;
  } | null;
} | null;

type RestaurantOrderAffiliateStore = {
  _id: string;
  name?: string | null;
  contact?: {
    phone?: string | null;
  } | null;
} | null;

type RestaurantOrder = {
  _id: string;
  orderNumber?: string | null;
  customerName?: string | null;
  orderType?: "delivery" | "pickup" | string | null;
  totalPrice?: number | null;
  products?: RestaurantOrderProduct[] | null;
  affiliateStore?: RestaurantOrderAffiliateStore;
} | null;

const RESTAURANT_ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  orderNumber,
  customerName,
  orderType,
  totalPrice,
  products[]{
    quantity,
    product->{name}
  },
  affiliateStore->{
    _id,
    name,
    contact{phone}
  }
}`;

function formatProducts(products: RestaurantOrderProduct[] | null | undefined) {
  const lines = (products || [])
    .map((entry) => {
      const quantity = typeof entry?.quantity === "number" ? entry.quantity : 0;
      const name = String(entry?.product?.name || "").trim();
      if (!name) return null;
      const prefix = quantity > 1 ? `${quantity}x ` : "";
      return `${prefix}${name}`;
    })
    .filter((line): line is string => Boolean(line));

  const text = lines.join("\n").trim();
  return text || "Sin productos";
}

function formatTotal(totalPrice: unknown) {
  const value =
    typeof totalPrice === "number"
      ? totalPrice
      : typeof totalPrice === "string"
        ? Number(totalPrice)
        : 0;

  if (Number.isFinite(value)) {
    return value.toFixed(2);
  }

  return "0.00";
}

function mapOrderTypeLabel(orderType: unknown) {
  return orderType === "pickup" ? "Recolección en tienda" : "Domicilio";
}

export async function notifyRestaurantNewOrder(orderId: string) {
  try {
    const order = await readClient.fetch<RestaurantOrder>(RESTAURANT_ORDER_QUERY, { orderId });
    if (!order) {
      console.error("[notify-restaurant] Orden no encontrada:", orderId);
      return;
    }

    const storeId = order.affiliateStore?._id;
    const storeName = String(order.affiliateStore?.name || "").trim() || "Restaurante";
    const storePhone = order.affiliateStore?.contact?.phone;

    if (!storePhone) {
      console.error("[notify-restaurant] Restaurante sin WhatsApp configurado:", {
        orderId: order._id,
        storeId: storeId || null,
      });
      return;
    }

    const orderNumber = String(order.orderNumber || "").trim() || order._id;
    const customerName = String(order.customerName || "").trim() || "Cliente";
    const productsText = formatProducts(order.products);
    const totalText = formatTotal(order.totalPrice);
    const orderTypeLabel = mapOrderTypeLabel(order.orderType);

    await sendNuevoPedidoRestaurante(
      storePhone,
      storeName,
      orderNumber,
      customerName,
      productsText,
      totalText,
      orderTypeLabel
    );

    console.log("[notify-restaurant] Notificacion nuevo pedido enviada:", {
      orderId: order._id,
      storeId: storeId || null,
    });
  } catch (error) {
    console.error("[notify-restaurant] Notificacion nuevo pedido fallida:", { orderId, error });
  }
}

export async function notifyRestaurantDriverEnRoute(
  orderId: string,
  driverName: string,
  orderNumberOverride?: string
) {
  try {
    const order = await readClient.fetch<RestaurantOrder>(RESTAURANT_ORDER_QUERY, { orderId });
    if (!order) {
      console.error("[notify-restaurant] Orden no encontrada:", orderId);
      return;
    }

    const storeId = order.affiliateStore?._id;
    const storePhone = order.affiliateStore?.contact?.phone;

    if (!storePhone) {
      console.error("[notify-restaurant] Restaurante sin WhatsApp configurado:", {
        orderId: order._id,
        storeId: storeId || null,
      });
      return;
    }

    const orderNumber = String(orderNumberOverride || order.orderNumber || "").trim() || order._id;

    await sendRepartidorEnCaminoRestaurante(
      storePhone,
      String(driverName || "").trim() || "Repartidor",
      orderNumber
    );

    console.log("[notify-restaurant] Notificacion repartidor en camino enviada:", {
      orderId: order._id,
      storeId: storeId || null,
    });
  } catch (error) {
    console.error("[notify-restaurant] Notificacion repartidor en camino fallida:", { orderId, error });
  }
}
