import { sendNuevoPedidoRestaurante, sendRepartidorEnCaminoRestaurante, sendRestaurantePickupPedido } from "@/lib/whatsapp";
import { getPaymentMethodLabel } from "@/lib/payment";
import { backendClient } from "@/sanity/lib/backendClient";

type RestaurantOrderProduct = {
  notes?: string | null;
  allergies?: string[] | null;
  customizations?: Array<{
    title?: string | null;
    options?: Array<{ label?: string | null }> | null;
  }> | null;
  quantity?: number;
  product?: {
    name?: string | null;
  } | null;
} | null;

type RestaurantOrderAffiliateStore = {
  _id: string;
  name?: string | null;
  address?: { street?: string | null } | null;
  contact?: {
    phone?: string | null;
  } | null;
} | null;

type RestaurantOrder = {
  _id: string;
  orderNumber?: string | null;
  customerName?: string | null;
  phone?: string | null;
  orderType?: "delivery" | "pickup" | string | null;
  paymentMethod?: string | null;
  totalPrice?: number | null;
  products?: RestaurantOrderProduct[] | null;
  affiliateStore?: RestaurantOrderAffiliateStore;
  pickupStore?: RestaurantOrderAffiliateStore;
} | null;

const RESTAURANT_ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  orderNumber,
  customerName,
  phone,
  orderType,
  paymentMethod,
  totalPrice,
  products[]{
    quantity,
    product->{name},
    notes,
    allergies,
    customizations[]{title, options[]{label}}
  },
  affiliateStore->{
    _id,
    name,
    address{street},
    contact{phone}
  },
  pickupStore->{
    _id,
    name,
    address{street},
    contact{phone}
  }
}`;

function formatProducts(products: RestaurantOrderProduct[] | null | undefined) {
  const lines = (products || [])
    .map((entry) => {
      const quantity = typeof entry?.quantity === "number" ? entry.quantity : 0;
      const name = String(entry?.product?.name || "").replace(/\p{Cf}/gu, "").trim();
      if (!name) return null;
      const prefix = quantity > 1 ? `${quantity}x ` : "";
      const details: string[] = [];
      const options = (entry?.customizations || [])
        .flatMap((group) => (group.options || []).map((option) => option.label).filter(Boolean))
        .join(", ");
      const notes = String(entry?.notes || "").trim();
      const allergies = (entry?.allergies || []).map((allergy) => String(allergy).trim()).filter(Boolean);

      if (options) details.push(`Opciones: ${options}`);
      if (notes) details.push(`Instrucciones: ${notes}`);
      if (allergies.length) details.push(`ALERGIAS: ${allergies.join(", ")}`);

      return [`${prefix}${name}`, ...details.map((detail) => `  ${detail}`)].join("\n");
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
  return orderType === "pickup" ? "Recoleccion en tienda" : "Domicilio";
}

function getOrderStore(order: NonNullable<RestaurantOrder>) {
  return order.orderType === "pickup" ? order.pickupStore || order.affiliateStore : order.affiliateStore;
}

export async function notifyRestaurantNewOrder(orderId: string) {
  try {
    const order = await backendClient.fetch<RestaurantOrder>(RESTAURANT_ORDER_QUERY, { orderId });
    if (!order) {
      console.error("[notify-restaurant] Orden no encontrada:", orderId);
      return;
    }

    const store = getOrderStore(order);
    const storeId = store?._id;
    const storeName = String(store?.name || "").trim() || "Restaurante";
    const storePhone = store?.contact?.phone;

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

    if (order.orderType === "pickup") {
      await sendRestaurantePickupPedido(
        storePhone,
        orderNumber,
        customerName,
        String(order.phone || "Sin telefono"),
        productsText,
        totalText,
        getPaymentMethodLabel(order.paymentMethod || undefined),
        order._id
      );
    } else {
      await sendNuevoPedidoRestaurante(
        storePhone,
        storeName,
        orderNumber,
        customerName,
        productsText,
        totalText,
        mapOrderTypeLabel(order.orderType)
      );
    }

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
    const order = await backendClient.fetch<RestaurantOrder>(RESTAURANT_ORDER_QUERY, { orderId });
    if (!order) {
      console.error("[notify-restaurant] Orden no encontrada:", orderId);
      return;
    }

    const store = order.affiliateStore;
    const storeId = store?._id;
    const storePhone = store?.contact?.phone;

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
