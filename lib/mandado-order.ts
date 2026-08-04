import "server-only";

import { calculateDeliveryQuote, DEFAULT_DELIVERY_CONFIG, normalizeDeliveryConfig } from "@/lib/delivery-zones";
import { createDeliveryPin } from "@/lib/delivery-pin";
import { legalVersions } from "@/lib/legal-config";
import { calculateMandadoQuote, type MandadoAddressPoint, type MandadoDraft, type MandadoMode } from "@/lib/mandado";
import { buildStateFields } from "@/lib/order-state";
import { type OrderAddressInput } from "@/lib/order-pricing";
import { createSettlementSnapshot, type OrderFinancials } from "@/lib/settlements";
import { backendClient } from "@/sanity/lib/backendClient";

function point(value: unknown, field: string): MandadoAddressPoint {
  const input = value as Partial<MandadoAddressPoint> | null;
  const label = String(input?.label || "").trim().slice(0, 300);
  const lat = Number(input?.lat);
  const lng = Number(input?.lng);
  if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error(`${field} no es válido.`);
  return { label, lat, lng };
}

export function normalizeMandadoDraft(value: unknown): Omit<MandadoDraft, "price"> {
  const input = value as Partial<MandadoDraft> | null;
  const mode = input?.mode as MandadoMode;
  const details = String(input?.details || "").trim().slice(0, 800);
  if (mode !== "pickup" && mode !== "purchase") throw new Error("Selecciona el tipo de mandado.");
  if (!details) throw new Error("Describe qué debemos recoger o comprar.");
  return { mode, origin: point(input?.origin, "El punto de inicio"), destination: point(input?.destination, "El punto de entrega"), details };
}

export async function quoteMandado(value: unknown): Promise<MandadoDraft> {
  const draft = normalizeMandadoDraft(value);
  const document = await backendClient.fetch(`*[_type == "deliveryPricingConfig" && _id == "deliveryPricingConfig.main"][0]`);
  const config = normalizeDeliveryConfig(document ?? DEFAULT_DELIVERY_CONFIG);
  const originQuote = calculateDeliveryQuote(config, draft.origin);
  const destinationQuote = calculateDeliveryQuote(config, draft.destination);
  const quote = calculateMandadoQuote(originQuote, destinationQuote);
  if (!quote.allowed || quote.finalPrice == null) {
    const label = quote.outsidePoint === "origin" ? "El punto de inicio" : "El punto de entrega";
    throw new Error(`${label} está fuera de nuestra zona de servicio. Elige una ubicación dentro del área marcada.`);
  }
  return { ...draft, price: quote.finalPrice };
}

export function buildMandadoOrderDocument(input: {
  draft: MandadoDraft;
  orderNumber: string;
  clerkUserId: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  paymentMethod: "stripe" | "cash_on_delivery";
  paymentStatus: "paid" | "pending" | "unpaid";
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  stripeCustomerId?: string;
  stripeFee?: number;
  stripeFeePercentage?: number;
  stripeFixedFee?: number;
  paymentProcessingFee?: number;
  paymentProcessingFeePercentage?: number;
  paymentProcessingFixedFee?: number;
  paymentNetAmount?: number;
  settlementSnapshot?: any;
}) {
  const now = new Date().toISOString();
  const paidOnline = input.paymentMethod === "stripe";
  const stripeFee = Math.max(0, input.stripeFee || 0);
  const states = buildStateFields({
    orderType: "delivery",
    orderStatus: "pending",
    paymentStatus: input.paymentStatus,
    dispatchStatus: "waiting_for_driver",
    paymentMethod: input.paymentMethod,
  });

  return {
    _type: "order",
    orderNumber: input.orderNumber,
    clerkUserId: input.clerkUserId,
    customerName: input.customerName,
    email: input.customerEmail,
    phone: input.phone.replace(/\D/g, "").slice(-12),
    serviceKind: "mandado",
    mandadoMode: input.draft.mode,
    mandadoOrigin: input.draft.origin,
    mandadoDestination: input.draft.destination,
    mandadoDetails: input.draft.details,
    orderType: "delivery",
    fulfillmentType: "delivery",
    fulfillmentTiming: "asap",
    fulfillmentProvider: "elmenu_delivery",
    fulfillmentProviderSnapshot: { provider: "elmenu_delivery", restaurantName: "Mandado El Menú" },
    sellerType: "platform",
    sellerId: "elmenu-mandados",
    sellerSnapshot: { id: "elmenu-mandados", name: "Mandado El Menú", address: input.draft.origin.label },
    legalTermsVersion: legalVersions.customerTerms,
    privacyVersion: legalVersions.privacy,
    cancellationPolicyVersion: legalVersions.cancellations,
    paymentMethod: input.paymentMethod,
    paymentProvider: paidOnline ? "stripe" : "cash",
    paidOnline,
    requiresStripeReconciliation: paidOnline,
    currency: "mxn",
    products: [],
    totalPrice: input.draft.price,
    subtotal: 0,
    shippingCost: input.draft.price,
    productsSubtotal: 0,
    shippingFee: input.draft.price,
    platformServiceFee: 0,
    discount: 0,
    tax: 0,
    platformCommission: 0,
    stripeFee,
    stripeFeePercentage: input.stripeFeePercentage ?? 0,
    stripeFixedFee: input.stripeFixedFee ?? 0,
    stripeNetAmount: paidOnline ? Math.max(0, input.draft.price - stripeFee) : 0,
    paymentProcessingFee: stripeFee,
    paymentProcessingFeePercentage: input.stripeFeePercentage ?? 0,
    paymentProcessingFixedFee: input.stripeFixedFee ?? 0,
    paymentNetAmount: paidOnline ? Math.max(0, input.draft.price - stripeFee) : 0,
    driverPayout: input.draft.price,
    grossTotal: input.draft.price,
    storeNetTotal: 0,
    platformNetTotal: paidOnline ? -stripeFee : 0,
    cashCollectedBy: paidOnline ? "none" : "community_driver",
    driverType: "community",
    settlementSnapshot: input.settlementSnapshot,
    shippingAddress: {
      line1: input.draft.destination.label,
      country: "MX",
      latitude: input.draft.destination.lat,
      longitude: input.draft.destination.lng,
    },
    deliveryNotes: input.draft.details,
    codInstructions: input.paymentMethod === "cash_on_delivery" ? input.draft.details : undefined,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId,
    stripeCustomerId: input.stripeCustomerId,
    scheduleStatus: "not_required",
    preparationStatus: "not_started",
    refundStatus: "not_requested",
    deliveryOfertaEnviada: false,
    orderDate: now,
    paidAt: input.paymentStatus === "paid" ? now : undefined,
    ...states,
    settlementStatus: paidOnline && input.paymentStatus === "paid" ? "ready" : "pending",
    ...createDeliveryPin(input.orderNumber, new Date(now)),
  };
}
