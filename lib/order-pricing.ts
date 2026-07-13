import { calculateDeliveryQuote, DEFAULT_DELIVERY_CONFIG, normalizeDeliveryConfig } from "@/lib/delivery-zones";
import { getStoreOperationalState } from "@/lib/storeOperationalState";
import { backendClient } from "@/sanity/lib/backendClient";
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

const DELIVERY_CONFIG_ID = "deliveryPricingConfig.main";
const DEFAULT_DELIVERY_DRIVER_PAYOUT_RATE = 1;
const DEFAULT_PLATFORM_COMMISSION_RATE = 0;

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
  deliveryFee?: number;
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
  discount: number;
  tax: number;
  grossTotal: number;
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
    unitCustomizationPrice: number;
    unitTotalPrice: number;
    lineTotal: number;
  }>;
  financials: {
    productsSubtotal: number;
    shippingFee: number;
    discount: number;
    tax: number;
    platformCommission: number;
    stripeFee: number;
    stripeNetAmount: number;
    driverPayout: number;
    grossTotal: number;
    storeNetTotal: number;
    platformNetTotal: number;
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
  deliveryFee,
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
  optionGroups
}`;

async function getDeliveryConfig() {
  const doc = await backendClient.fetch(`*[_type == "deliveryPricingConfig" && _id == $id][0]`, { id: DELIVERY_CONFIG_ID });
  return normalizeDeliveryConfig(doc ?? DEFAULT_DELIVERY_CONFIG);
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
  discount: number;
  tax: number;
  paymentMethod: string;
  stripeFee?: number;
}) {
  const paymentMethod = normalizePaymentMethod(input.paymentMethod, input.orderType === "pickup" ? "cash_at_store" : "cash_on_delivery");
  const paymentProvider = resolvePaymentProvider(paymentMethod);
  const grossTotal = roundMoney(input.productsSubtotal + input.shippingFee - input.discount + input.tax);
  const commissionRate = getNumberEnv("PLATFORM_COMMISSION_RATE", DEFAULT_PLATFORM_COMMISSION_RATE);
  const deliveryDriverRate = getNumberEnv(
    input.storeHasOwnDelivery ? "STORE_DRIVER_PAYOUT_RATE" : "COMMUNITY_DRIVER_PAYOUT_RATE",
    DEFAULT_DELIVERY_DRIVER_PAYOUT_RATE
  );

  const platformCommission = roundMoney(input.productsSubtotal * commissionRate);
  const stripeFee = isStripePaymentProvider(paymentProvider) ? roundMoney(input.stripeFee ?? 0) : 0;
  const stripeNetAmount = isStripePaymentProvider(paymentProvider) ? roundMoney(grossTotal - stripeFee) : 0;
  const driverPayout = input.orderType === "delivery" ? roundMoney(input.shippingFee * deliveryDriverRate) : 0;
  const storeNetTotal = roundMoney(grossTotal - platformCommission - stripeFee - driverPayout);
  const platformNetTotal = roundMoney(platformCommission - stripeFee);

  return {
    productsSubtotal: roundMoney(input.productsSubtotal),
    shippingFee: roundMoney(input.shippingFee),
    discount: roundMoney(input.discount),
    tax: roundMoney(input.tax),
    platformCommission,
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
}) {
  assert(input.storeId, "Tienda requerida.");
  assert(Array.isArray(input.items) && input.items.length > 0, "La lista de productos esta vacia.");

  const [store, products] = await Promise.all([
    backendClient.fetch<StoreRecord | null>(STORE_QUERY, { storeId: input.storeId }),
    backendClient.fetch<ProductRecord[]>(PRODUCTS_QUERY, {
      productIds: [...new Set(input.items.map((item) => item.productId).filter(Boolean))],
    }),
  ]);

  assert(store, "La tienda no existe.");
  assert(store.isActive === true, "La tienda no esta activa.");

  const operationalState = getStoreOperationalState(store);
  assert(operationalState.canAcceptOrders, "La tienda no acepta pedidos en este momento.");

  if (input.orderType === "delivery") {
    assert(store.serviceTypes?.delivery === true, "La tienda no permite entregas.");
  } else {
    assert(store.serviceTypes?.pickup === true, "La tienda no permite pickup.");
  }

  const normalizedAddress = normalizeAddress(input.shippingAddress);
  if (input.orderType === "delivery") {
    assert(normalizedAddress?.line1, "Direccion requerida para delivery.");
    assert(normalizedAddress?.city, "Ciudad requerida para delivery.");
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
      unitCustomizationPrice,
      unitTotalPrice,
      lineTotal,
    };
  });

  const productsSubtotal = roundMoney(pricedItems.reduce((sum, item) => sum + item.lineTotal, 0));
  if (input.orderType === "delivery" && typeof store.serviceTypes?.minimumOrderDelivery === "number") {
    assert(productsSubtotal >= Number(store.serviceTypes.minimumOrderDelivery), `El pedido minimo para entrega es de $${Number(store.serviceTypes.minimumOrderDelivery).toFixed(2)} MXN.`);
  }

  const shippingFee = input.orderType === "delivery" ? await computeShippingFee(store, normalizedAddress) : 0;
  const discount = 0;
  const tax = 0;
  const financials = computeFinancials({
    orderType: input.orderType,
    storeHasOwnDelivery: store.hasOwnDelivery,
    productsSubtotal,
    shippingFee,
    discount,
    tax,
    paymentMethod: input.paymentMethod,
  });

  return {
    store,
    orderType: input.orderType,
    productsSubtotal,
    shippingFee,
    discount,
    tax,
    grossTotal: financials.grossTotal,
    items: pricedItems,
    financials,
  } satisfies ValidatedOrderQuote;
}

async function computeShippingFee(store: StoreRecord, address: ReturnType<typeof normalizeAddress>) {
  if (!address) return 0;
  if (typeof address.latitude === "number" && typeof address.longitude === "number") {
    const quote = calculateDeliveryQuote(await getDeliveryConfig(), {
      lat: address.latitude,
      lng: address.longitude,
      orderDate: new Date(),
    });
    assert(quote.allowed, quote.reason || "La direccion esta fuera de cobertura.");
    return roundMoney(quote.finalPrice ?? 0);
  }
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
}) {
  const now = new Date().toISOString();
  const shippingAddress = normalizeAddress(input.shippingAddress);
  const normalizedPaymentMethod = normalizePaymentMethod(input.paymentMethod, input.orderType === "pickup" ? "cash_at_store" : "cash_on_delivery");
  const driverType = input.orderType === "pickup" ? "none" : input.quote.store.hasOwnDelivery ? "store" : "community";
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
          discount: appliedDiscount,
          tax: input.quote.tax,
          paymentMethod: normalizedPaymentMethod,
          stripeFee: input.stripeFee,
        })
      : computeFinancials({
          orderType: input.orderType,
          storeHasOwnDelivery: input.quote.store.hasOwnDelivery,
          productsSubtotal: input.quote.productsSubtotal,
          shippingFee: input.quote.shippingFee,
          discount: appliedDiscount,
          tax: input.quote.tax,
          paymentMethod: normalizedPaymentMethod,
        });

  const cashCollectedBy = resolveCashCollectedBy({ paymentMethod: normalizedPaymentMethod, orderType: input.orderType, driverType });
  const states = buildStateFields({
    orderType: input.orderType,
    orderStatus: input.orderStatus ?? "pending",
    paymentStatus: input.paymentStatus,
    dispatchStatus: input.dispatchStatus,
    settlementStatus: resolveSettlementStatus({
      paymentStatus: input.paymentStatus,
      paymentProvider,
      cashCollectedBy,
      orderStatus: input.orderStatus,
      settlementStatus: input.settlementStatus,
    }),
    paymentMethod: normalizedPaymentMethod,
  });

  return {
    _type: "order",
    orderNumber: input.orderNumber,
    clerkUserId: input.clerkUserId,
    customerName: input.customerName,
    email: input.customerEmail,
    phone: normalizePhone(input.phone),
    orderType: input.orderType,
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
      notes: `unitBasePrice=${item.unitBasePrice};unitCustomizationPrice=${item.unitCustomizationPrice};unitTotalPrice=${item.unitTotalPrice};lineTotal=${item.lineTotal}`,
    })),
    totalPrice: finalFinancials.grossTotal,
    subtotal: input.quote.productsSubtotal,
    shippingCost: input.quote.shippingFee,
    amountDiscount: appliedDiscount,
    shippingAddress: shippingAddress ?? undefined,
    deliveryNotes: input.deliveryNotes,
    pickupStore: input.orderType === "pickup" ? { _type: "reference", _ref: input.storeId } : undefined,
    affiliateStore: { _type: "reference", _ref: input.storeId },
    stripeCheckoutSessionId: input.stripeCheckoutSessionId,
    stripePaymentIntentId: input.stripePaymentIntentId ?? undefined,
    stripeCustomerId: input.stripeCustomerId ?? undefined,
    ...states,
    productsSubtotal: finalFinancials.productsSubtotal,
    shippingFee: finalFinancials.shippingFee,
    discount: finalFinancials.discount,
    tax: finalFinancials.tax,
    platformCommission: finalFinancials.platformCommission,
    stripeFee: finalFinancials.stripeFee,
    stripeNetAmount: finalFinancials.stripeNetAmount,
    driverPayout: finalFinancials.driverPayout,
    grossTotal: finalFinancials.grossTotal,
    storeNetTotal: finalFinancials.storeNetTotal,
    platformNetTotal: finalFinancials.platformNetTotal,
    cashCollectedBy,
    driverType,
    cancelledAt: undefined,
    refundedAt: undefined,
    orderDate: now,
    paidAt: input.paymentStatus === "paid" ? now : undefined,
  };
}
