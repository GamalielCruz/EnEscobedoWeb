export type SupportOrder = {
  dispatchStatus?: string;
  orderNumber?: string;
  orderStatus?: string;
  orderType?: string;
  paymentStatus?: string;
  pickupStatus?: string;
  restaurantName?: string;
  status?: string;
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  cancelled: "fue cancelado",
  completed: "fue completado",
  delivered: "fue entregado",
  pending: "fue recibido y está pendiente de confirmación",
  picked_up: "ya fue recogido",
  processing: "está en preparación",
  ready_for_pickup: "está listo para recoger",
  shipped: "está en camino",
};

export function formatOrderStatusResponse(order: SupportOrder) {
  const orderNumber = order.orderNumber?.replace(/\s+/g, " ").trim();
  const restaurantName = order.restaurantName?.replace(/\s+/g, " ").trim();
  const status = order.orderStatus ?? order.status ?? "pending";
  let statusLabel = ORDER_STATUS_LABELS[status] ?? "está siendo procesado";

  if (order.paymentStatus === "failed" || order.paymentStatus === "expired") {
    statusLabel = "no pudo confirmarse porque el pago no se completó";
  } else if (order.paymentStatus === "refunded") {
    statusLabel = "fue reembolsado";
  } else if (
    order.orderType === "pickup" &&
    order.pickupStatus === "ready_for_pickup"
  ) {
    statusLabel = "está listo para recoger";
  } else if (status === "shipped" && order.dispatchStatus === "at_door") {
    statusLabel =
      "está en tu domicilio; el repartidor indicó que llegó a la puerta";
  }

  const reference = orderNumber ? ` #${orderNumber}` : "";
  const restaurant = restaurantName ? ` de ${restaurantName}` : "";
  return `Tu pedido${reference}${restaurant} ${statusLabel}.`;
}
