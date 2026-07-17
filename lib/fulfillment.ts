export type FulfillmentProvider = "pickup" | "restaurant_delivery" | "elmenu_delivery" | "third_party_logistics";

export function isElmenuDriverDeliveryEnabled() {
  return process.env.ELMENU_DRIVER_DELIVERY_ENABLED === "true";
}

export function resolveFulfillmentProvider(orderType: "delivery" | "pickup", storeHasOwnDelivery?: boolean): FulfillmentProvider {
  if (orderType === "pickup") return "pickup";
  if (storeHasOwnDelivery) return "restaurant_delivery";
  if (!isElmenuDriverDeliveryEnabled()) {
    throw new Error("El reparto administrado por ElMenu no está disponible en esta versión.");
  }
  return "elmenu_delivery";
}
