import "server-only";
import { backendClient } from "@/sanity/lib/backendClient";

const BASEROW_API_BASE_URL = process.env.BASEROW_API_URL || "https://api.baserow.io";
const BASEROW_RESTAURANTS_TABLE_ID = "1076849";

type BaserowOrder = {
  _id: string;
  orderNumber?: string;
  orderDate?: string;
  customerName?: string;
  phone?: string;
  orderType?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  orderStatus?: string;
  productsSubtotal?: number;
  shippingFee?: number;
  discount?: number;
  grossTotal?: number;
  platformCommission?: number;
  storeNetTotal?: number;
  driverPayout?: number;
  stripeCheckoutSessionId?: string;
  baserowRowId?: number;
  restaurantName?: string;
};

export class BaserowError extends Error {
  constructor(message: string, public readonly status: number, public readonly responseBody: string) {
    super(message);
  }
}

function getBaserowConfig() {
  const token = process.env.BASEROW_API_TOKEN;
  const ordersTableId = process.env.BASEROW_ORDERS_TABLE_ID;
  if (!token || !ordersTableId) throw new Error("Faltan BASEROW_API_TOKEN o BASEROW_ORDERS_TABLE_ID");
  return { token, ordersTableId };
}

async function baserowRequest(path: string, init: RequestInit) {
  const { token } = getBaserowConfig();
  const response = await fetch(`${BASEROW_API_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Token ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const responseBody = await response.text();
  if (!response.ok) throw new BaserowError("Baserow rechazó la solicitud", response.status, responseBody);
  return responseBody ? JSON.parse(responseBody) : null;
}

function getPaymentMethod(paymentMethod?: string) {
  if (["stripe", "card", "card_at_store"].includes(paymentMethod || "")) return "Tarjeta";
  if (["cash_on_delivery", "cash_at_store", "cash_on_pickup"].includes(paymentMethod || "")) return "Efectivo";
  if (paymentMethod === "bank_transfer") return "Transferencia";
}

function getOrderStatus(orderStatus?: string) {
  return {
    pending: "Nuevo", processing: "En preparación", ready_for_pickup: "Listo", shipped: "En ruta",
    delivered: "Entregado", completed: "Entregado", cancelled: "Cancelado",
  }[orderStatus || ""];
}

function roundForIntegerColumn(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : value;
}

export function resolveOrderPhone(order: Pick<BaserowOrder, "_id" | "phone">) {
  const phone = typeof order.phone === "string" ? order.phone.trim() : "";
  const digits = phone.replace(/\D/g, "");
  const normalized = digits ? (phone.startsWith("+") ? `+${digits}` : digits) : "";

  // ponytail: temporary safe diagnostic; remove after production verification.
  console.info("[baserow] teléfono resuelto", {
    orderId: order._id,
    property: phone ? "phone" : null,
    exists: Boolean(normalized),
    last4: normalized ? normalized.slice(-4) : null,
  });

  return normalized;
}

async function findRestaurantRowId(name?: string) {
  if (!name) return undefined;
  const result = await baserowRequest(
    `/api/database/rows/table/${BASEROW_RESTAURANTS_TABLE_ID}/?user_field_names=true&search=${encodeURIComponent(name)}`,
    { method: "GET" }
  ) as { results?: Array<{ id?: number; Nombre?: string }> };
  return result.results?.find((row) => row.Nombre === name)?.id;
}

export async function createBaserowRow(fields: Record<string, unknown>) {
  const { ordersTableId } = getBaserowConfig();
  return baserowRequest(`/api/database/rows/table/${ordersTableId}/?user_field_names=true`, {
    method: "POST",
    body: JSON.stringify(fields),
  });
}
async function findOrderRowId(orderId: string, ordersTableId: string) {
  const result = await baserowRequest(
    `/api/database/rows/table/${ordersTableId}/?user_field_names=true&search=${encodeURIComponent(orderId)}`,
    { method: "GET" }
  ) as { results?: Array<{ id?: number; "ID de orden"?: string }> };
  return result.results?.find((row) => row["ID de orden"] === orderId)?.id;
}
export async function createBaserowOrder(order: BaserowOrder) {
  const { ordersTableId } = getBaserowConfig();
  const restaurantRowId = await findRestaurantRowId(order.restaurantName);
  const rowId = order.baserowRowId ?? await findOrderRowId(order._id, ordersTableId);
  const phone = resolveOrderPhone(order);
  const fields = {
    "Número de pedido": order.orderNumber,
    "ID de orden": order._id,
    "Fecha y hora": order.orderDate?.slice(0, 10),
    Cliente: order.customerName,
    "Teléfono": phone || undefined,
    "Modalidad de entrega": order.orderType === "pickup" ? "Recogida" : "Entrega",
    "Método de pago": getPaymentMethod(order.paymentMethod),
    "Estado del pago": order.paymentStatus === "paid" ? "Pagado" : "Pendiente",
    "Estado del pedido": getOrderStatus(order.orderStatus),
    Subtotal: order.productsSubtotal,
    "Costo de envío": order.shippingFee,
    Descuento: order.discount,
    Total: order.grossTotal,
    "Comisión de ElMenu": roundForIntegerColumn(order.platformCommission),
    "Pago al restaurante": roundForIntegerColumn(order.storeNetTotal),
    "Pago al repartidor": order.driverPayout,
    "ID de Stripe": order.stripeCheckoutSessionId,
    ...(restaurantRowId ? { Restaurante: [restaurantRowId] } : {}),
  };
  const path = rowId
    ? `/api/database/rows/table/${ordersTableId}/${rowId}/?user_field_names=true`
    : `/api/database/rows/table/${ordersTableId}/?user_field_names=true`;
  return baserowRequest(path, {
    method: rowId ? "PATCH" : "POST",
    body: JSON.stringify(fields),
  }) as Promise<{ id: number }>;
}

export async function syncBaserowOrder(order: BaserowOrder) {
  try {
    const row = await createBaserowOrder(order);
    await backendClient.patch(order._id).set({
      baserowRowId: row.id,
      baserowSyncStatus: "synced",
      baserowSyncedAt: new Date().toISOString(),
    }).unset(["baserowSyncError"]).commit();
  } catch (error) {
    const message = error instanceof BaserowError
      ? `HTTP ${error.status}: ${error.responseBody}`
      : error instanceof Error ? error.message : String(error);
    console.error("[baserow] No se pudo sincronizar la orden", { orderId: order._id, error: message });
    await backendClient.patch(order._id).set({ baserowSyncStatus: "failed", baserowSyncError: message }).commit().catch((sanityError) => {
      console.error("[baserow] No se pudo guardar el error de sincronización", { orderId: order._id, sanityError });
    });
  }
}
