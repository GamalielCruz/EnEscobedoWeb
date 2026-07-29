export type OrderTypeValue = "delivery" | "pickup";

export type OrderStatusValue =
  | "pending"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "ready_for_pickup"
  | "picked_up"
  | "completed";

export type PaymentStatusValue =
  | "pending"
  | "paid"
  | "failed"
  | "expired"
  | "unpaid"
  | "refunded"
  | "requires_refund";

export type DispatchStatusValue =
  | "not_required"
  | "scheduled"
  | "waiting_for_driver"
  | "offered"
  | "accepted"
  | "at_door"
  | "completed";

export type SettlementStatusValue =
  | "pending"
  | "ready"
  | "settled"
  | "cancelled"
  | "refunded";

export function isOrderDispatchable(input: {
  status?: string;
  orderStatus?: string;
  paymentStatus?: string;
  repartidorAsignado?: unknown;
  dispatchStatus?: string;
}) {
  if (input.repartidorAsignado) return false;
  if (input.dispatchStatus === "scheduled") return false;

  const terminalLegacyStatuses = new Set(["shipped", "delivered", "cancelled", "refunded"]);
  const terminalOrderStatuses = new Set(["shipped", "delivered", "cancelled", "completed", "picked_up"]);
  const invalidPaymentStatuses = new Set(["failed", "expired", "refunded", "requires_refund"]);

  return (
    !terminalLegacyStatuses.has(input.status ?? "") &&
    !terminalOrderStatuses.has(input.orderStatus ?? "") &&
    !invalidPaymentStatuses.has(input.paymentStatus ?? "")
  );
}

export function buildLegacyStatus(input: {
  orderType: OrderTypeValue;
  orderStatus: OrderStatusValue;
  paymentStatus: PaymentStatusValue;
  paymentMethod?: string;
}) {
  const { orderType, orderStatus, paymentStatus, paymentMethod } = input;

  if (orderStatus === "cancelled") return "cancelled";
  if (paymentStatus === "failed") return "failed";
  if (paymentStatus === "expired") return "expired";
  if (orderStatus === "delivered") return "delivered";
  if (orderStatus === "picked_up") return "picked_up";
  if (orderStatus === "completed") return "completed";
  if (orderStatus === "ready_for_pickup") return "ready_for_pickup";
  if (orderStatus === "shipped") return "shipped";
  if (orderStatus === "processing") return "processing";

  if (orderType === "delivery" && paymentMethod === "cash_on_delivery") {
    return "pending_delivery";
  }

  if (
    orderType === "pickup" &&
    (paymentMethod === "cash_on_pickup" ||
      paymentMethod === "card_on_pickup" ||
      paymentMethod === "cash_at_store" ||
      paymentMethod === "card_at_store")
  ) {
    return "pending_pickup";
  }

  if (
    (paymentMethod === "stripe" ||
      paymentMethod === "card" ||
      paymentMethod === "bank_transfer" ||
      paymentMethod === "oxxo") &&
    paymentStatus === "paid"
  ) {
    return "paid";
  }

  return "pending";
}

export function buildStateFields(input: {
  orderType: OrderTypeValue;
  orderStatus: OrderStatusValue;
  paymentStatus: PaymentStatusValue;
  dispatchStatus?: DispatchStatusValue;
  settlementStatus?: SettlementStatusValue;
  paymentMethod?: string;
}) {
  return {
    orderStatus: input.orderStatus,
    paymentStatus: input.paymentStatus,
    dispatchStatus:
      input.dispatchStatus ?? (input.orderType === "delivery" ? "waiting_for_driver" : "not_required"),
    settlementStatus: input.settlementStatus ?? "pending",
    status: buildLegacyStatus(input),
  };
}

export function resolveSettlementStatusOnDelivery(input: {
  paymentProvider?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  cashCollectedBy?: string;
  settlementStatus?: string;
  orderStatus?: string;
}): SettlementStatusValue {
  if (input.settlementStatus === "settled") return "settled";
  if (input.settlementStatus === "refunded" || input.paymentStatus === "refunded") return "refunded";
  if (input.settlementStatus === "cancelled" || input.orderStatus === "cancelled") return "cancelled";
  if (input.paymentProvider === "stripe" && input.paymentStatus === "paid") return "ready";
  if (input.paymentMethod === "cash_on_delivery") return "pending";
  if (input.cashCollectedBy && input.cashCollectedBy !== "none") return "pending";
  if (input.settlementStatus === "ready") return "ready";
  return "pending";
}
