import {
  calculateDeliveryQuote,
  DEFAULT_DELIVERY_CONFIG,
  EMPTY_STORE_DELIVERY_CONFIG,
  getDeliveryPricingConfigId,
  normalizeDeliveryConfig,
} from "@/lib/delivery-zones";
import { backendClient } from "@/sanity/lib/backendClient";
import { normalizeProductRequests } from "./product-requests";
import {
  isStripePaymentProvider,
  normalizePaymentMethod,
  resolveCashCollectedBy,
  resolvePaidOnline,
  resolvePaymentProvider,
  resolveRequiresStripeReconciliation,
} from "./payment";
import {
  DispatchStatusValue,
  OrderStatusValue,
  OrderTypeValue,
  PaymentStatusValue,
  SettlementStatusValue,
  buildStateFields,
} from "./order-state";
import { createDeliveryPin } from "./delivery-pin";
import { isDeliveryDriverAvailable, resolveFulfillmentProvider } from "./fulfillment";
import { legalVersions } from "./legal-config";
import { getDeliveryScheduleConfig } from "./delivery-schedule-config";
import {
  calculateScheduledDispatchAt,
  calculateScheduledPreparationAt,
  getStoreAvailability,
  validateFulfillmentSelection,
  type FulfillmentSelection,
  type FulfillmentSlot,
} from "./fulfillment-schedule";
import { calculateOrderTotal } from "./platform-service-fee";
import { getCommercialSettings, getMonthlyCommissionAccumulated } from "./commercial-config";
import { calculateCappedCommission, resolveEffectiveCommercialConditions, type EffectiveCommercialConditions } from "./commercial-rules";

const DEFAULT_DELIVERY_DRIVER_PAYOUT_RATE = 1;

function getNumberEnv(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

type StoreRecord = {
  _id: string;
  name?: string;
  coordinates?: {
    latitude?: number | string;
    longitude?: number | string;
  };
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  isActive?: boolean;
  isOpen?: boolean;
  manualOperationalStatus?: "open" | "closed" | "auto" | null;
  highDemandMode?: boolean | null;
  hasOwnDelivery?: boolean;
  connectedCommunityDrivers?: number;
  deliveryFee?: number;
  deliveryTimeMin?: number | null;
  scheduledOrdersEnabled?: boolean | null;
  minimumPreparationMinutes?: number | null;
  scheduledOrderIntervalMinutes?: number | null;
  maximumScheduledDays?: number | null;
  lastDeliveryOrderMinutesBeforeClose?: number | null;
  lastPickupOrderMinutesBeforeClose?: number | null;
  platformCommissionPercent?: number;
  commercialPlanId?: "community" | "premium";
  commercialOverrides?: Record<string, unknown>;
  commercialReviewRequired?: boolean;
  commercialNotes?: string;
  commercialPlanStartedAt?: string;
  operatingHours?: Record<string, string>;
  serviceTypes?: {
    delivery?: boolean;
    pickup?: boolean;
    deliveryRadius?: number;
    minimumOrderDelivery?: number;
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  };
};

type ProductRecord = {
  _id: string;
  name?: string;
  price?: number;
  stock?: number;
  approvalStatus?: string;
  isVisible?: boolean;
  affiliateStore?: { _ref?: string };
  allowSpecialInstructions?: boolean;
  acceptsAllergyRequests?: boolean;
  optionGroups?: Array<{
    title?: string;
    required?: boolean;
    selectionType?: "single" | "multiple";
    options?: Array<{
      label?: string;
      priceDelta?: number;
    }>;
  }>;
};

export type OrderItemInput = {
  productId: string;
  quantity: number;
  customizations?: Record<string, string | string[]>;
  notes?: string;
  allergies?: string[];
};

export type OrderAddressInput = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
};

export type ValidatedOrderQuote = {
  store: StoreRecord;
  orderType: OrderTypeValue;
  productsSubtotal: number;
  shippingFee: number;
  platformServiceFee: number;
  discount: number;
  tax: number;
  grossTotal: number;
  fulfillment: {
    timing: "asap" | "scheduled";
    estimatedPreparationMinutes: number;
    slot?: FulfillmentSlot;
    scheduledPreparationAt?: string;
    scheduledDispatchAt?: string;
  };
  commercial: EffectiveCommercialConditions;
  accumulatedCommission: number;
  items: Array<{
    _key: string;
    product: { _type: "reference"; _ref: string };
    quantity: number;
    customizations: Array<{
      _key: string;
      title?: string;
      options?: Array<{ _key: string; label?: string; priceDelta?: number }>;
    }>;
    unitBasePrice: number;
    notes?: string;
    allergies: string[];
    unitCustomizationPrice: number;
    unitTotalPrice: number;
    lineTotal: number;
  }>;
  financials: {
    productsSubtotal: number;
    shippingFee: number;
    platformServiceFee: number;
    discount: number;
    tax: number;
    platformCommission: number;
    stripeFee: number;
    stripeNetAmount: number;
    driverPayout: number;
    grossTotal: number;
    storeNetTotal: number;
    platformNetTotal: number;
    commissionWaivedByCap: number;
    commissionCalculated: number;
    accumulatedBeforeOrder: number;
    deliveryBaseFee: number;
    deliveryDiscount: number;
  };
};

const STORE_QUERY = `*[_type == "affiliateStore" && _id == $storeId][0]{
  _id,
  name,
  coordinates,
  address,
  isActive,
  isOpen,
  manualOperationalStatus,
  highDemandMode,
  hasOwnDelivery,
  "connectedCommunityDrivers": count(*[
    _type == "repartidor" &&
    activo == true &&
    disponible == true &&
    (!defined(disponibleHasta) || disponibleHasta > now()) &&
    !defined(tiendaAsignada)
  ]),
  deliveryFee,
  deliveryTimeMin,
  scheduledOrdersEnabled,
  minimumPreparationMinutes,
  scheduledOrderIntervalMinutes,
  maximumScheduledDays,
  lastDeliveryOrderMinutesBeforeClose,
  lastPickupOrderMinutesBeforeClose,
  platformCommissionPercent,
  commercialPlanId,
  commercialOverrides,
  commercialReviewRequired,
  commercialNotes,
  commercialPlanStartedAt,
  operatingHours,
  serviceTypes
}`;

const PRODUCTS_QUERY = `*[_type == "product" && _id in $productIds]{
  _id,
  name,
  price,
  stock,
  approvalStatus,
  isVisible,
  affiliateStore,
  optionGroups,
  allowSpecialInstructions,
  acceptsAllergyRequests
}`;

export async function getDeliveryConfig(storeId?: string) {
  const doc = await backendClient.fetch(
    `*[_type == "deliveryPricingConfig" && _id == $id][0]`,
    { id: getDeliveryPricingConfigId(storeId) }
  );
  return normalizeDeliveryConfig(doc ?? (storeId ? EMPTY_STORE_DELIVERY_CONFIG : DEFAULT_DELIVERY_CONFIG));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toValidCoordinate(value: unknown) {
  const coordinate = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(coordinate) ? coordinate : null;
}

export function buildStoreMapsUrl(store: Pick<StoreRecord, "name" | "address" | "coordinates">, fallbackName: string = "Restaurante") {
  const latitude = toValidCoordinate(store.coordinates?.latitude);
  const longitude = toValidCoordinate(store.coordinates?.longitude);

  if (latitude != null && longitude != null) {
    return `https://www.google.com/maps?q=${latitude},${longitude}`;
  }

  const address = [
    store.address?.street,
    store.address?.city,
    store.address?.state,
    store.address?.postalCode,
    store.address?.country,
  ]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");

  const target = address || String(store.name || "").trim() || fallbackName;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(target)}`;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizePhone(phone: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  const localDigits = digits.startsWith("52") && digits.length >= 12 ? digits.slice(-10) : digits.slice(-10);
  assert(localDigits.length === 10, "Telefono invalido. Debe contener 10 digitos.");
  return `+52${localDigits}`;
}

function normalizeQuantity(value: number) {
  assert(Number.isFinite(value), "Cantidad invalida.");
  const quantity = Math.floor(value);
  assert(quantity > 0, "Cantidad invalida.");
  return quantity;
}

function normalizeAddress(address?: OrderAddressInput | null) {
  if (!address) return null;
  return {
    line1: String(address.line1 || "").trim(),
    line2: String(address.line2 || "").trim(),
    city: String(address.city || "").trim(),
    state: String(address.state || "").trim(),
    postal_code: String(address.postal_code || "").trim(),
    country: String(address.country || "MX").trim() || "MX",
    latitude: typeof address.latitude === "number" ? address.latitude : undefined,
    longitude: typeof address.longitude === "number" ? address.longitude : undefined,
  };
}

function resolveSettlementStatus(input: {
  paymentStatus: PaymentStatusValue;
  paymentProvider: string;
  cashCollectedBy: string;
  orderStatus?: OrderStatusValue;
  settlementStatus?: SettlementStatusValue;
}) {
  if (input.settlementStatus) return input.settlementStatus;
  if (input.orderStatus === "cancelled") return "cancelled";
  if (input.paymentStatus === "refunded") return "refunded";
  if (input.paymentProvider === "stripe" && input.paymentStatus === "paid") return "ready";
  if (input.cashCollectedBy !== "none") return "pending";
  return "pending";
}

function computeFinancials(input: {
  orderType: OrderTypeValue;
  storeHasOwnDelivery?: boolean;
  productsSubtotal: number;
  shippingFee: number;
  deliveryBaseFee: number;
  discount: number;
  tax: number;
  paymentMethod: string;
  stripeFee?: number;
  commercial: EffectiveCommercialConditions;
  accumulatedCommission: number;
}) {
  const paymentMethod = normalizePaymentMethod(input.paymentMethod, input.orderType === "pickup" ? "cash_at_store" : "cash_on_delivery");
  const paymentProvider = resolvePaymentProvider(paymentMethod);
  const platformServiceFee = input.commercial.serviceFee;
  const grossTotal = calculateOrderTotal({
    productsSubtotal: input.productsSubtotal,
    shippingFee: input.shippingFee,
    platformServiceFee,
    discount: input.discount,
    tax: input.tax,
  });
  const commission = calculateCappedCommission({
    productsSubtotal: input.productsSubtotal,
    commissionPercent: input.commercial.commissionPercent,
    monthlyCommissionCap: input.commercial.monthlyCommissionCap,
    accumulatedCommission: input.accumulatedCommission,
  });
  const deliveryDriverRate = getNumberEnv(
    input.storeHasOwnDelivery ? "STORE_DRIVER_PAYOUT_RATE" : "COMMUNITY_DRIVER_PAYOUT_RATE",
    DEFAULT_DELIVERY_DRIVER_PAYOUT_RATE
  );
  const deliveryDiscount = roundMoney(Math.max(0, input.deliveryBaseFee - input.shippingFee));
  const platformDeliverySubsidy = input.commercial.deliveryBenefitAbsorbedBy === "platform" ? deliveryDiscount : 0;
  const platformCommission = commission.chargedCommission;
  const stripeFee = isStripePaymentProvider(paymentProvider) ? roundMoney(input.stripeFee ?? 0) : 0;
  const stripeNetAmount = isStripePaymentProvider(paymentProvider) ? roundMoney(grossTotal - stripeFee) : 0;
  const driverPayout = input.orderType === "delivery" ? roundMoney(input.deliveryBaseFee * deliveryDriverRate) : 0;
  const storeNetTotal = roundMoney(
    grossTotal - platformServiceFee - platformCommission - stripeFee - driverPayout + platformDeliverySubsidy
  );
  const platformNetTotal = roundMoney(platformCommission + platformServiceFee - stripeFee - platformDeliverySubsidy);

  return {
    productsSubtotal: roundMoney(input.productsSubtotal),
    shippingFee: roundMoney(input.shippingFee),
    platformServiceFee,
    discount: roundMoney(input.discount),
    tax: roundMoney(input.tax),
    platformCommission,
    commissionWaivedByCap: commission.commissionWaivedByCap,
    commissionCalculated: commission.rawCommission,
    accumulatedBeforeOrder: commission.accumulatedBeforeOrder,
    deliveryBaseFee: roundMoney(input.deliveryBaseFee),
    deliveryDiscount,
    stripeFee,
    stripeNetAmount,
    driverPayout,
    grossTotal,
    storeNetTotal,
    platformNetTotal,
  };
}
export async function validateAndQuoteOrder(input: {
  storeId: string;
  items: OrderItemInput[];
  orderType: OrderTypeValue;
  paymentMethod: string;
  shippingAddress?: OrderAddressInput | null;
  fulfillment?: FulfillmentSelection | null;
}) {
  assert(input.storeId, "Tienda requerida.");
  assert(Array.isArray(input.items) && input.items.length > 0, "La lista de productos esta vacia.");

  const [store, products, deliverySchedule, commercialSettings, accumulatedCommission] = await Promise.all([
    backendClient.fetch<StoreRecord | null>(STORE_QUERY, { storeId: input.storeId }),
    backendClient.fetch<ProductRecord[]>(PRODUCTS_QUERY, {
      productIds: [...new Set(input.items.map((item) => item.productId).filter(Boolean))],
    }),
    getDeliveryScheduleConfig(),
    getCommercialSettings(),
    getMonthlyCommissionAccumulated(input.storeId),
  ]);

  assert(store, "La tienda no existe.");
  assert(store.isActive === true, "La tienda no esta activa.");
  const commercial = resolveEffectiveCommercialConditions(store, commercialSettings);
  assert(
    !isStripePaymentProvider(resolvePaymentProvider(normalizePaymentMethod(input.paymentMethod))) || commercial.onlinePaymentsEnabled,
    "Este restaurante no tiene pagos en línea habilitados."
  );

  if (input.orderType === "delivery") {
    assert(store.serviceTypes?.delivery === true, "La tienda no permite entregas.");
    resolveFulfillmentProvider("delivery", store.hasOwnDelivery);
    assert(
      isDeliveryDriverAvailable(store.hasOwnDelivery, Number(store.connectedCommunityDrivers || 0)),
      "No hay repartidores de El Menú disponibles en este momento. Puedes elegir retiro en el local o intentarlo más tarde."
    );
  } else {
    assert(store.serviceTypes?.pickup === true, "La tienda no permite pickup.");
  }

  const normalizedAddress = normalizeAddress(input.shippingAddress);
  if (input.orderType === "delivery") {
    assert(normalizedAddress?.line1, "Direccion requerida para delivery.");
    assert(normalizedAddress?.city, "Ciudad requerida para delivery.");
    assert(
      typeof normalizedAddress?.latitude === "number" &&
        typeof normalizedAddress?.longitude === "number",
      "Confirma la ubicacion en el mapa para validar la cobertura."
    );
  }

  const productMap = new Map(products.map((product) => [product._id, product]));
  const pricedItems = input.items.map((item) => {
    const product = productMap.get(item.productId);
    assert(product, `Producto no encontrado: ${item.productId}`);
    assert(product.affiliateStore?._ref === input.storeId, "Producto no pertenece a la tienda seleccionada.");
    assert(product.approvalStatus === "approved", `Producto no aprobado: ${product.name || product._id}`);
    assert(product.isVisible !== false, `Producto no visible: ${product.name || product._id}`);
    assert(typeof product.price === "number" && product.price >= 0, `Producto sin precio valido: ${product.name || product._id}`);

    const quantity = normalizeQuantity(item.quantity);
    if (typeof product.stock === "number") {
      assert(product.stock >= quantity, `Stock insuficiente para ${product.name || "producto"}.`);
    }

    const customizations = buildCustomizationSnapshot(product, item.customizations);
    const requests = normalizeProductRequests(item, product);
    const unitCustomizationPrice = roundMoney(
      customizations.reduce(
        (sum, group) => sum + (group.options ?? []).reduce((groupSum, option) => groupSum + Number(option.priceDelta || 0), 0),
        0
      )
    );
    const unitBasePrice = roundMoney(product.price ?? 0);
    const unitTotalPrice = roundMoney(unitBasePrice + unitCustomizationPrice);
    const lineTotal = roundMoney(unitTotalPrice * quantity);

    return {
      _key: crypto.randomUUID(),
      product: { _type: "reference" as const, _ref: product._id },
      quantity,
      customizations,
      unitBasePrice,
      notes: requests.notes,
      allergies: requests.allergies,
      unitCustomizationPrice,
      unitTotalPrice,
      lineTotal,
    };
  });

  const productsSubtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.lineTotal, 0));
  if (input.orderType === "delivery" && typeof store.serviceTypes?.minimumOrderDelivery === "number") {
    assert(productsSubtotal >= Number(store.serviceTypes.minimumOrderDelivery), `El pedido minimo para entrega es de $${Number(store.serviceTypes.minimumOrderDelivery).toFixed(2)} MXN.`);
  }

  const deliveryBaseFee = input.orderType === "delivery" ? await computeShippingFee(store, normalizedAddress) : 0;
  const shippingFee = commercial.deliveryBenefitEnabled
    ? Math.max(0, roundMoney(deliveryBaseFee - commercial.deliveryDiscountAmount))
    : deliveryBaseFee;
  const availability = getStoreAvailability({
    store,
    config: deliverySchedule,
    fulfillmentType: input.orderType,
    coverageAllowed: true,
  });
  const validatedFulfillment = validateFulfillmentSelection(availability, input.fulfillment);
  const estimatedPreparationMinutes = Math.max(
    0,
    Number(store.minimumPreparationMinutes ?? store.deliveryTimeMin ?? 30) || 30
  );
  const fulfillment =
    validatedFulfillment.timing === "scheduled"
      ? {
          timing: "scheduled" as const,
          estimatedPreparationMinutes,
          slot: validatedFulfillment.slot,
          scheduledPreparationAt: calculateScheduledPreparationAt({
            startAt: validatedFulfillment.slot.start,
            estimatedPreparationMinutes,
          }),
          scheduledDispatchAt:
            input.orderType === "delivery"
              ? calculateScheduledDispatchAt({
                  startAt: validatedFulfillment.slot.start,
                  estimatedTravelMinutes: deliverySchedule.estimatedTravelMinutes,
                  driverAssignmentMarginMinutes:
                    deliverySchedule.driverAssignmentMarginMinutes,
                })
              : undefined,
        }
      : {
          timing: "asap" as const,
          estimatedPreparationMinutes,
        };
  const discount = 0;
  const tax = 0;
  const financials = computeFinancials({
    orderType: input.orderType,
    storeHasOwnDelivery: store.hasOwnDelivery,
    productsSubtotal,
    shippingFee,
    deliveryBaseFee,
    discount,
    tax,
    paymentMethod: input.paymentMethod,
    commercial,
    accumulatedCommission,
  });

  return {
    store,
    orderType: input.orderType,
    productsSubtotal,
    shippingFee,
    platformServiceFee: financials.platformServiceFee,
    discount,
    tax,
    grossTotal: financials.grossTotal,
    fulfillment,
    commercial,
    accumulatedCommission,
    items: pricedItems,
    financials,
  } satisfies ValidatedOrderQuote;
}

async function computeShippingFee(store: StoreRecord, address: ReturnType<typeof normalizeAddress>) {
  if (!address) return 0;
  if (typeof address.latitude === "number" && typeof address.longitude === "number") {
    const quote = calculateDeliveryQuote(await getDeliveryConfig(store.hasOwnDelivery ? store._id : undefined), {
      lat: address.latitude,
      lng: address.longitude,
      orderDate: new Date(),
    });
    assert(quote.allowed, quote.reason || "La direccion esta fuera de cobertura.");
    return roundMoney(quote.finalPrice ?? 0);
  }
  assert(!store.hasOwnDelivery, "Confirma la ubicacion en el mapa para calcular el envio.");
  return roundMoney(Number(store.deliveryFee ?? 0));
}

function buildCustomizationSnapshot(product: ProductRecord, customizations?: Record<string, string | string[]>) {
  const optionGroups = Array.isArray(product.optionGroups) ? product.optionGroups : [];
  const presentKeys = new Set(Object.keys(customizations || {}));

  if ((!customizations || Object.keys(customizations).length === 0) && optionGroups.some((group) => group.required)) {
    throw new Error(`Falta seleccionar opciones requeridas para ${product.name || "producto"}.`);
  }

  optionGroups.forEach((group, index) => {
    if (group.required) assert(presentKeys.has(`group-${index}`), `Falta seleccionar opciones requeridas para ${product.name || "producto"}.`);
  });

  return Object.entries(customizations || {}).map(([groupKey, selection]) => {
    const groupIndex = Number.parseInt(groupKey.replace("group-", ""), 10);
    const group = optionGroups[groupIndex];
    assert(group, `Grupo de personalizacion invalido para ${product.name || "producto"}.`);

    const selectedLabels = (Array.isArray(selection) ? selection : [selection]).map((value) => String(value || "").trim()).filter(Boolean);
    if (group.required) assert(selectedLabels.length > 0, `Falta seleccionar opciones requeridas para ${product.name || "producto"}.`);
    if (group.selectionType !== "multiple") assert(selectedLabels.length <= 1, `Solo se permite una opcion en ${group.title || "personalizacion"}.`);

    return {
      _key: crypto.randomUUID(),
      title: group.title || groupKey,
      options: selectedLabels.map((label) => {
        const option = group.options?.find((candidate) => candidate.label === label);
        assert(option, `Opcion invalida \"${label}\" para ${product.name || "producto"}.`);
        return {
          _key: crypto.randomUUID(),
          label,
          priceDelta: roundMoney(Number(option.priceDelta || 0)),
        };
      }),
    };
  });
}

export function buildOrderDocument(input: {
  orderNumber: string;
  clerkUserId: string;
  customerName: string;
  customerEmail: string;
  phone: string;
  storeId: string;
  orderType: OrderTypeValue;
  paymentMethod: string;
  quote: ValidatedOrderQuote;
  shippingAddress?: OrderAddressInput | null;
  paymentStatus: PaymentStatusValue;
  orderStatus?: OrderStatusValue;
  dispatchStatus?: DispatchStatusValue;
  settlementStatus?: SettlementStatusValue;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string | null;
  stripeCustomerId?: string | null;
  amountDiscount?: number;
  stripeFee?: number;
  deliveryNotes?: string;
  codInstructions?: string;
}) {
  const now = new Date().toISOString();
  const shippingAddress = normalizeAddress(input.shippingAddress);
  const normalizedPaymentMethod = normalizePaymentMethod(input.paymentMethod, input.orderType === "pickup" ? "cash_at_store" : "cash_on_delivery");
  const fulfillmentProvider = resolveFulfillmentProvider(input.orderType, input.quote.store.hasOwnDelivery);
  const driverType = fulfillmentProvider === "restaurant_delivery" ? "store" : fulfillmentProvider === "elmenu_delivery" ? "community" : "none";
  const paymentProvider = resolvePaymentProvider(normalizedPaymentMethod);
  const paidOnline = resolvePaidOnline(paymentProvider);
  const appliedDiscount = roundMoney(input.amountDiscount ?? input.quote.discount);
  const finalFinancials =
    input.stripeFee != null
      ? computeFinancials({
          orderType: input.orderType,
          storeHasOwnDelivery: input.quote.store.hasOwnDelivery,
          productsSubtotal: input.quote.productsSubtotal,
          shippingFee: input.quote.shippingFee,
          deliveryBaseFee: input.quote.financials.deliveryBaseFee,
          discount: appliedDiscount,
          tax: input.quote.tax,
          paymentMethod: normalizedPaymentMethod,
          stripeFee: input.stripeFee,
          commercial: input.quote.commercial,
          accumulatedCommission: input.quote.accumulatedCommission,
        })
      : computeFinancials({
          orderType: input.orderType,
          storeHasOwnDelivery: input.quote.store.hasOwnDelivery,
          productsSubtotal: input.quote.productsSubtotal,
          shippingFee: input.quote.shippingFee,
          deliveryBaseFee: input.quote.financials.deliveryBaseFee,
          discount: appliedDiscount,
          tax: input.quote.tax,
          paymentMethod: normalizedPaymentMethod,
          commercial: input.quote.commercial,
          accumulatedCommission: input.quote.accumulatedCommission,
        });

  const cashCollectedBy = resolveCashCollectedBy({ paymentMethod: normalizedPaymentMethod, orderType: input.orderType, driverType });
  const scheduledDelivery =
    input.orderType === "delivery" && input.quote.fulfillment.timing === "scheduled";
  const states = buildStateFields({
    orderType: input.orderType,
    orderStatus: input.orderStatus ?? "pending",
    paymentStatus: input.paymentStatus,
    dispatchStatus:
      fulfillmentProvider === "restaurant_delivery" || fulfillmentProvider === "elmenu_delivery"
        ? scheduledDelivery
          ? "scheduled"
          : input.dispatchStatus
        : "not_required",
    settlementStatus: resolveSettlementStatus({
      paymentStatus: input.paymentStatus,
      paymentProvider,
      cashCollectedBy,
      orderStatus: input.orderStatus,
      settlementStatus: input.settlementStatus,
    }),
    paymentMethod: normalizedPaymentMethod,
  });

  const deliveryVerification = input.orderType === "delivery"
    ? createDeliveryPin(input.orderNumber, new Date(now))
    : { deliveryVerificationMethod: "not_required", deliveryVerificationStatus: "not_required" } as const;

  return {
    _type: "order",
    orderNumber: input.orderNumber,
    clerkUserId: input.clerkUserId,
    customerName: input.customerName,
    email: input.customerEmail,
    phone: normalizePhone(input.phone),
    orderType: input.orderType,
    fulfillmentType: input.orderType,
    fulfillmentTiming: input.quote.fulfillment.timing,
    scheduledSlot:
      input.quote.fulfillment.timing === "scheduled" && input.quote.fulfillment.slot
        ? {
            startAt: input.quote.fulfillment.slot.start,
            endAt: input.quote.fulfillment.slot.end,
            timezone: input.quote.fulfillment.slot.timezone,
          }
        : undefined,
    estimatedPreparationMinutes: input.quote.fulfillment.estimatedPreparationMinutes,
    storeScheduleSnapshot: input.quote.fulfillment.slot?.storeScheduleSnapshot,
    deliveryScheduleSnapshot: input.quote.fulfillment.slot?.deliveryScheduleSnapshot,
    scheduleStatus:
      input.quote.fulfillment.timing === "scheduled" ? "scheduled" : "not_required",
    scheduledPreparationAt: input.quote.fulfillment.scheduledPreparationAt,
    scheduledDispatchAt: input.quote.fulfillment.scheduledDispatchAt,
    preparationStatus:
      input.quote.fulfillment.timing === "scheduled" ? "not_started" : undefined,
    scheduleRiskLevel: scheduledDelivery ? "none" : undefined,
    fulfillmentProvider,
    sellerType: "restaurant",
    sellerId: input.storeId,
    sellerSnapshot: {
      id: input.storeId,
      name: input.quote.store.name || "Restaurante",
      address: [input.quote.store.address?.street, input.quote.store.address?.city, input.quote.store.address?.state].filter(Boolean).join(", "),
    },
    fulfillmentProviderSnapshot: { provider: fulfillmentProvider, restaurantName: input.quote.store.name || "Restaurante" },
    legalTermsVersion: legalVersions.customerTerms,
    privacyVersion: legalVersions.privacy,
    cancellationPolicyVersion: legalVersions.cancellations,
    paymentMethod: normalizedPaymentMethod,
    paymentProvider,
    paidOnline,
    requiresStripeReconciliation: resolveRequiresStripeReconciliation(paymentProvider),
    currency: "mxn",
    products: input.quote.items.map((item) => ({
      _key: item._key,
      product: item.product,
      quantity: item.quantity,
      customizations: item.customizations,
      notes: item.notes,
      allergies: item.allergies,
    })),
    totalPrice: finalFinancials.grossTotal,
    subtotal: input.quote.productsSubtotal,
    shippingCost: input.quote.shippingFee,
    amountDiscount: appliedDiscount,
    shippingAddress: shippingAddress ?? undefined,
    deliveryNotes: input.deliveryNotes,
    codInstructions: input.codInstructions,
    pickupStore: input.orderType === "pickup" ? { _type: "reference", _ref: input.storeId } : undefined,
    affiliateStore: { _type: "reference", _ref: input.storeId },
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId ?? undefined,
    stripeCustomerId: input.stripeCustomerId ?? undefined,
    ...states,
    productsSubtotal: finalFinancials.productsSubtotal,
    shippingFee: finalFinancials.shippingFee,
    platformServiceFee: finalFinancials.platformServiceFee,
    discount: finalFinancials.discount,
    tax: finalFinancials.tax,
    platformCommission: finalFinancials.platformCommission,
    commissionWaivedByCap: finalFinancials.commissionWaivedByCap,
    commercialSnapshot: {
      planId: input.quote.commercial.id,
      planName: input.quote.commercial.name,
      commissionPercent: input.quote.commercial.commissionPercent,
      monthlyCommissionCap: input.quote.commercial.monthlyCommissionCap,
      commissionBase: finalFinancials.productsSubtotal,
      commissionCalculated: finalFinancials.commissionCalculated,
      commissionCharged: finalFinancials.platformCommission,
      commissionWaivedByCap: finalFinancials.commissionWaivedByCap,
      accumulatedBeforeOrder: finalFinancials.accumulatedBeforeOrder,
      serviceFeeMode: input.quote.commercial.serviceFeeMode,
      serviceFee: finalFinancials.platformServiceFee,
      onlinePaymentsEnabled: input.quote.commercial.onlinePaymentsEnabled,
      premiumBadgeEnabled: input.quote.commercial.premiumBadgeEnabled,
      bannerEligible: input.quote.commercial.bannerEligible,
      deliveryBaseFee: finalFinancials.deliveryBaseFee,
      deliveryDiscount: finalFinancials.deliveryDiscount,
      deliveryBenefitAbsorbedBy: input.quote.commercial.deliveryBenefitAbsorbedBy,
    },
    stripeFee: finalFinancials.stripeFee,
    stripeNetAmount: finalFinancials.stripeNetAmount,
    driverPayout: finalFinancials.driverPayout,
    grossTotal: finalFinancials.grossTotal,
    storeNetTotal: finalFinancials.storeNetTotal,
    platformNetTotal: finalFinancials.platformNetTotal,
    cashCollectedBy,
    driverType,
    refundStatus: "not_requested",
    ...deliveryVerification,
    cancelledAt: undefined,
    refundedAt: undefined,
    orderDate: now,
    paidAt: input.paymentStatus === "paid" ? now : undefined,
  };
}
