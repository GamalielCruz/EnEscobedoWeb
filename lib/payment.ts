export type PaymentMethodValue =
  | "stripe"
  | "cash_on_delivery"
  | "cash_at_store"
  | "card_at_store"
  | "manual"
  | "bank_transfer"
  | "oxxo";

export type PaymentProviderValue = "stripe" | "cash" | "external_pos" | "none";
export type CashCollectedByValue = "store" | "community_driver" | "store_driver" | "admin" | "none";

export function normalizePaymentMethod(method?: string, fallback: PaymentMethodValue = "manual"): PaymentMethodValue {
  switch (String(method || "").trim()) {
    case "stripe":
    case "card":
      return "stripe";
    case "cash_on_delivery":
      return "cash_on_delivery";
    case "cash_at_store":
    case "cash_on_pickup":
      return "cash_at_store";
    case "card_at_store":
    case "card_on_pickup":
      return "card_at_store";
    case "bank_transfer":
      return "bank_transfer";
    case "oxxo":
      return "oxxo";
    case "manual":
      return "manual";
    default:
      return fallback;
  }
}

export function resolvePaymentProvider(method: PaymentMethodValue): PaymentProviderValue {
  if (method === "stripe" || method === "bank_transfer" || method === "oxxo") return "stripe";
  if (method === "cash_on_delivery" || method === "cash_at_store") return "cash";
  if (method === "card_at_store") return "external_pos";
  return "none";
}

export function isStripePaymentProvider(provider: PaymentProviderValue) {
  return provider === "stripe";
}

export function isRestaurantVisibleOrder(order: {
  paymentProvider?: string;
  paymentStatus?: string;
}) {
  return order.paymentProvider !== "stripe" || order.paymentStatus === "paid";
}

export function resolvePaidOnline(provider: PaymentProviderValue) {
  return provider === "stripe";
}

export function resolveRequiresStripeReconciliation(provider: PaymentProviderValue) {
  return provider === "stripe";
}

export function resolveCashCollectedBy(input: {
  paymentMethod: PaymentMethodValue;
  orderType: "delivery" | "pickup";
  driverType?: "store" | "community" | "none" | string;
}) {
  if (input.paymentMethod === "cash_on_delivery") {
    return input.driverType === "store" ? "store_driver" : "community_driver";
  }
  if (input.paymentMethod === "cash_at_store") return "store";
  return "none";
}

export function getPaymentMethodLabel(method?: string) {
  const normalized = normalizePaymentMethod(method);
  switch (normalized) {
    case "stripe":
      return "Stripe";
    case "cash_on_delivery":
      return "Efectivo contra entrega";
    case "cash_at_store":
      return "Efectivo en tienda";
    case "card_at_store":
      return "Tarjeta en tienda";
    case "bank_transfer":
      return "Transferencia";
    case "oxxo":
      return "OXXO";
    default:
      return "Manual";
  }
}

export function getPaymentProviderLabel(provider?: string) {
  switch (provider) {
    case "stripe":
      return "Stripe";
    case "cash":
      return "Efectivo";
    case "external_pos":
      return "Terminal externa";
    default:
      return "Ninguno";
  }
}
