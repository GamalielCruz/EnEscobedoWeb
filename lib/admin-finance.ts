import { backendClient } from "@/sanity/lib/backendClient";
import { getMexicoDateKey, getMexicoDayRange } from "./mexico-time";
import { getPaymentMethodLabel, getPaymentProviderLabel, normalizePaymentMethod } from "./payment";

type FinanceOrder = {
  _id: string;
  orderNumber: string;
  orderDate: string;
  orderType?: "delivery" | "pickup";
  orderStatus?: string;
  paymentStatus?: string;
  dispatchStatus?: string;
  settlementStatus?: string;
  paymentMethod?: string;
  paymentProvider?: string;
  paidOnline?: boolean;
  requiresStripeReconciliation?: boolean;
  driverType?: string;
  cashCollectedBy?: string;
  productsSubtotal?: number;
  shippingFee?: number;
  subtotal?: number;
  shippingCost?: number;
  totalPrice?: number;
  platformCommission?: number;
  platformServiceFee?: number;
  stripeFee?: number;
  stripeNetAmount?: number;
  tax?: number;
  grossTotal?: number;
  storeNetTotal?: number;
  platformNetTotal?: number;
  driverPayout?: number;
  discount?: number;
  cancelledAt?: string;
  refundedAt?: string;
  storeId?: string;
  storeName?: string;
  driverId?: string;
  driverName?: string;
};

type NormalizedFinanceOrder = FinanceOrder & {
  paymentMethod: string;
  paymentProvider: string;
  paidOnline: boolean;
  cashCollectedBy: string;
  productsSubtotal: number;
  shippingFee: number;
  platformCommission: number;
  platformServiceFee: number;
  stripeFee: number;
  stripeNetAmount: number;
  tax: number;
  grossTotal: number;
  storeNetTotal: number;
  platformNetTotal: number;
  driverPayout: number;
  discount: number;
  paymentMethodLabel: string;
  paymentProviderLabel: string;
};

const FINANCE_QUERY = `*[
  _type == "order" &&
  !(_id in path('drafts.**')) &&
  orderDate >= $startAt &&
  orderDate < $endAt
]{
  _id,
  orderNumber,
  orderDate,
  orderType,
  orderStatus,
  paymentStatus,
  dispatchStatus,
  settlementStatus,
  paymentMethod,
  paymentProvider,
  paidOnline,
  requiresStripeReconciliation,
  driverType,
  cashCollectedBy,
  productsSubtotal,
  shippingFee,
  subtotal,
  shippingCost,
  totalPrice,
  platformCommission,
  platformServiceFee,
  stripeFee,
  stripeNetAmount,
  tax,
  grossTotal,
  storeNetTotal,
  platformNetTotal,
  driverPayout,
  discount,
  cancelledAt,
  refundedAt,
  "storeId": affiliateStore._ref,
  "storeName": affiliateStore->name,
  "driverId": repartidorAsignado._ref,
  "driverName": repartidorAsignado->nombre
}`;

function money(value?: number) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeOrder(order: FinanceOrder): NormalizedFinanceOrder {
  const paymentMethod = normalizePaymentMethod(
    order.paymentMethod,
    order.orderType === "pickup" ? "cash_at_store" : "cash_on_delivery"
  );
  const paymentProvider =
    order.paymentProvider ||
    (paymentMethod === "stripe" || paymentMethod === "bank_transfer" || paymentMethod === "oxxo"
      ? "stripe"
      : paymentMethod === "card_at_store"
        ? "external_pos"
        : paymentMethod === "manual"
          ? "none"
          : "cash");
  const paidOnline = order.paidOnline ?? paymentProvider === "stripe";
  const cashCollectedBy =
    order.cashCollectedBy ||
    (paymentMethod === "cash_on_delivery"
      ? order.driverType === "store"
        ? "store_driver"
        : "community_driver"
      : paymentMethod === "cash_at_store"
        ? "store"
        : "none");

  const productsSubtotal = money(order.productsSubtotal ?? order.subtotal);
  const shippingFee = money(order.shippingFee ?? order.shippingCost);
  const discount = money(order.discount);
  const tax = money(order.tax);
  const platformServiceFee = money(order.platformServiceFee);
  const grossTotal = money(
    order.grossTotal ??
      order.totalPrice ??
      Math.max(productsSubtotal + shippingFee + platformServiceFee - discount + tax, 0)
  );
  const platformCommission = money(order.platformCommission);
  const driverPayout = money(order.driverPayout);
  const stripeFee = paymentProvider === "stripe" ? money(order.stripeFee) : 0;
  const stripeNetAmount =
    paymentProvider === "stripe" ? money(order.stripeNetAmount ?? grossTotal - stripeFee) : 0;
  const storeNetTotal = money(
    order.storeNetTotal ?? Math.max(grossTotal - platformServiceFee - platformCommission - stripeFee - driverPayout, 0)
  );
  const platformNetTotal = money(order.platformNetTotal ?? platformCommission + platformServiceFee - stripeFee);

  return {
    ...order,
    paymentMethod,
    paymentProvider,
    paidOnline,
    cashCollectedBy,
    productsSubtotal,
    shippingFee,
    platformCommission,
    platformServiceFee,
    stripeFee,
    stripeNetAmount,
    tax,
    grossTotal,
    storeNetTotal,
    platformNetTotal,
    driverPayout,
    discount,
    paymentMethodLabel: getPaymentMethodLabel(paymentMethod),
    paymentProviderLabel: getPaymentProviderLabel(paymentProvider),
  };
}

function createBucket(id: string, name: string) {
  return {
    id,
    name,
    orders: 0,
    productsSubtotal: 0,
    shippingFee: 0,
    platformCommission: 0,
    platformServiceFee: 0,
    driverPayout: 0,
    stripeFee: 0,
    stripeNetAmount: 0,
    tax: 0,
    grossTotal: 0,
    storeNetTotal: 0,
    platformNetTotal: 0,
    discount: 0,
    cancelled: 0,
    refunded: 0,
    pendingSettlement: 0,
    stripeSales: 0,
    cashOnDeliverySales: 0,
    cashAtStoreSales: 0,
    pickupSales: 0,
    deliverySales: 0,
    storeCollectedCash: 0,
    driverCollectedCash: 0,
    onlinePaidSales: 0,
  };
}

function addSummary(target: ReturnType<typeof createBucket>, order: NormalizedFinanceOrder) {
  target.orders += 1;
  target.productsSubtotal += money(order.productsSubtotal);
  target.shippingFee += money(order.shippingFee);
  target.platformCommission += money(order.platformCommission);
  target.platformServiceFee += money(order.platformServiceFee);
  target.driverPayout += money(order.driverPayout);
  target.stripeFee += money(order.stripeFee);
  target.stripeNetAmount += money(order.stripeNetAmount);
  target.tax += money(order.tax);
  target.grossTotal += money(order.grossTotal);
  target.storeNetTotal += money(order.storeNetTotal);
  target.platformNetTotal += money(order.platformNetTotal);
  target.discount += money(order.discount);

  if (order.orderType === "pickup") target.pickupSales += money(order.grossTotal);
  else target.deliverySales += money(order.grossTotal);

  if (order.paymentProvider === "stripe") {
    target.stripeSales += money(order.grossTotal);
    target.onlinePaidSales += money(order.grossTotal);
  }
  if (order.paymentMethod === "cash_on_delivery") target.cashOnDeliverySales += money(order.grossTotal);
  if (order.paymentMethod === "cash_at_store") target.cashAtStoreSales += money(order.grossTotal);
  if (order.cashCollectedBy === "store") target.storeCollectedCash += money(order.grossTotal);
  if (order.cashCollectedBy === "community_driver" || order.cashCollectedBy === "store_driver") {
    target.driverCollectedCash += money(order.grossTotal);
  }

  if (order.cancelledAt || order.orderStatus === "cancelled") target.cancelled += money(order.grossTotal);
  if (order.refundedAt || order.paymentStatus === "refunded") target.refunded += money(order.grossTotal);
  if (order.settlementStatus !== "settled" && order.settlementStatus !== "cancelled" && order.settlementStatus !== "refunded") {
    if (order.paymentProvider === "stripe") {
      target.pendingSettlement += money(order.storeNetTotal) + money(order.driverPayout);
    } else if (order.cashCollectedBy !== "none") {
      target.pendingSettlement += money(order.grossTotal);
    }
  }
}

export async function getAdminFinanceSnapshot(dateKey = getMexicoDateKey()) {
  const { start, end } = getMexicoDayRange(dateKey);
  const rawOrders = await backendClient.fetch<FinanceOrder[]>(FINANCE_QUERY, { startAt: start, endAt: end });
  const orders = (rawOrders ?? []).map(normalizeOrder);

  const totals = createBucket("totals", "Totales");
  const storeMap = new Map<string, ReturnType<typeof createBucket>>();
  const driverMap = new Map<string, ReturnType<typeof createBucket>>();

  for (const order of orders) {
    addSummary(totals, order);

    const storeId = order.storeId || "unknown-store";
    const storeBucket = storeMap.get(storeId) ?? createBucket(storeId, order.storeName || "Tienda sin nombre");
    addSummary(storeBucket, order);
    storeMap.set(storeId, storeBucket);

    if (order.driverId) {
      const driverBucket = driverMap.get(order.driverId) ?? createBucket(order.driverId, order.driverName || "Repartidor sin nombre");
      addSummary(driverBucket, order);
      driverMap.set(order.driverId, driverBucket);
    }
  }

  return {
    dateKey,
    range: { start, end },
    totals,
    byStore: Array.from(storeMap.values()).sort((a, b) => b.grossTotal - a.grossTotal),
    byDriver: Array.from(driverMap.values()).sort((a, b) => b.driverCollectedCash - a.driverCollectedCash),
    orders: orders.sort((a, b) => a.orderDate.localeCompare(b.orderDate)).reverse(),
  };
}
