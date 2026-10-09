/**
 * Centralized settlement calculations module
 * 
 * This module handles all settlement calculations for restaurants, drivers, and platform
 * using the stored payment processor fees to ensure consistency across the application.
 * 
 * All calculations use configurable settlement policies and create immutable snapshots.
 */

import { calculateFeeBreakdown, type StoredProcessorFees } from "./payment-processor-fees";
import { 
  calculateFeeDistribution, 
  getSettlementPolicy, 
  type FeeDistributionPolicy,
  type PolicyContext 
} from "./settlement-policies";

export interface OrderFinancials {
  grossTotal: number;
  productsSubtotal: number;
  shippingFee: number;
  platformServiceFee: number;
  platformCommission: number;
  paymentProcessingFee: number;
  paymentProcessingFeePercentage: number;
  paymentProcessingFixedFee: number;
  paymentNetAmount: number;
  driverPayout: number;
  storeNetTotal: number;
  platformNetTotal: number;
}

export interface SettlementBreakdown {
  // Restaurant settlement
  restaurantSubtotal: number;
  restaurantCommission: number;
  restaurantProcessingFee: number;
  restaurantNetAmount: number;

  // Driver settlement
  deliveryAmount: number;
  driverProcessingFee: number;
  driverNetAmount: number;

  // Platform settlement
  platformCommission: number;
  platformServiceFee: number;
  platformProcessingFee: number;
  platformNetRevenue: number;
}

/**
 * Financial settlement snapshot - immutable record taken when amounts become definitive
 * This is the single source of truth for all financial calculations
 * 
 * The snapshot is created at different moments depending on payment method:
 * - Stripe: When payment is authorized/captured (amounts cannot change)
 * - Cash: When order is accepted (amounts are definitive)
 * - Cash on delivery: When driver confirms collection (settlement becomes definitive)
 */
export interface SettlementSnapshot {
  version: number; // Snapshot schema version for future migrations
  createdAt: string; // ISO timestamp when snapshot was created
  paymentProvider: string; // stripe, cash, mercadopago, etc.
  settlementPolicy: FeeDistributionPolicy; // Policy used for calculations
  currency: string; // Currency code (e.g., "MXN")
  
  // Financial amounts (all definitive, never recalculate)
  restaurantSubtotal: number;
  deliveryAmount: number;
  platformCommission: number;
  platformServiceFee: number;
  paymentProcessingFee: number;
  paymentProcessingFeePercentage: number;
  paymentProcessingFixedFee: number;
  restaurantProcessingFee: number;
  courierProcessingFee: number;
  platformProcessingFee: number;
  restaurantSettlement: number;
  courierSettlement: number;
  platformNetRevenue: number;
  grossTotal: number;
}

/**
 * Calculate complete settlement breakdown for an order
 * This uses configurable policies to distribute fees
 * 
 * IMPORTANT: This should only be called when creating a new snapshot.
 * For reading existing data, use readSettlementFromSnapshot() instead.
 */
export function calculateSettlementBreakdown(
  financials: OrderFinancials,
  context?: PolicyContext
): SettlementBreakdown {
  const {
    grossTotal,
    productsSubtotal,
    shippingFee,
    platformServiceFee,
    platformCommission,
    paymentProcessingFee,
    driverPayout,
  } = financials;

  // Get settlement policy
  const policyContext = context || {
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "stripe",
  };
  const policy = getSettlementPolicy(policyContext);

  // Restaurant amount (products + shipping - driver payout)
  const restaurantAmount = productsSubtotal + shippingFee - driverPayout;

  // Platform amount (commission + service fee)
  const platformAmount = platformCommission + platformServiceFee;

  // Distribute processing fee based on policy
  const feeDistribution = calculateFeeDistribution(
    paymentProcessingFee,
    restaurantAmount,
    driverPayout,
    platformAmount,
    grossTotal,
    policy
  );

  // Restaurant settlement
  const restaurantSubtotal = restaurantAmount;
  const restaurantCommission = platformCommission * (restaurantAmount / grossTotal);
  const restaurantProcessingFee = feeDistribution.restaurantFee;
  const restaurantNetAmount = restaurantSubtotal - restaurantCommission - restaurantProcessingFee;

  // Driver settlement
  const deliveryAmount = driverPayout;
  const driverProcessingFee = feeDistribution.courierFee;
  const driverNetAmount = deliveryAmount - driverProcessingFee;

  // Platform settlement
  const platformCommissionTotal = platformCommission;
  const platformServiceFeeTotal = platformServiceFee;
  const platformProcessingFee = feeDistribution.platformFee;
  const platformNetRevenue = platformCommissionTotal + platformServiceFeeTotal - platformProcessingFee;

  return {
    restaurantSubtotal,
    restaurantCommission,
    restaurantProcessingFee,
    restaurantNetAmount,
    deliveryAmount,
    driverProcessingFee,
    driverNetAmount,
    platformCommission: platformCommissionTotal,
    platformServiceFee: platformServiceFeeTotal,
    platformProcessingFee: platformProcessingFee,
    platformNetRevenue,
  };
}

/**
 * Create immutable financial snapshot for an order
 * This should be called when amounts become definitive (not just when order is confirmed)
 * All subsequent reads should use this snapshot
 */
export function createSettlementSnapshot(
  financials: OrderFinancials,
  context?: PolicyContext,
  paymentProvider?: string
): SettlementSnapshot {
  const breakdown = calculateSettlementBreakdown(financials, context);
  const policy = getSettlementPolicy(context || {
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: paymentProvider || "stripe",
  });

  return {
    version: 1, // Current snapshot schema version
    createdAt: new Date().toISOString(),
    paymentProvider: paymentProvider || context?.paymentProvider || "stripe",
    settlementPolicy: policy.feeDistribution,
    currency: "MXN",
    restaurantSubtotal: breakdown.restaurantSubtotal,
    deliveryAmount: breakdown.deliveryAmount,
    platformCommission: breakdown.platformCommission,
    platformServiceFee: breakdown.platformServiceFee,
    paymentProcessingFee: financials.paymentProcessingFee,
    paymentProcessingFeePercentage: financials.paymentProcessingFeePercentage,
    paymentProcessingFixedFee: financials.paymentProcessingFixedFee,
    restaurantProcessingFee: breakdown.restaurantProcessingFee,
    courierProcessingFee: breakdown.driverProcessingFee,
    platformProcessingFee: breakdown.platformProcessingFee,
    restaurantSettlement: breakdown.restaurantNetAmount,
    courierSettlement: breakdown.driverNetAmount,
    platformNetRevenue: breakdown.platformNetRevenue,
    grossTotal: financials.grossTotal,
  };
}

/**
 * Read settlement breakdown from snapshot
 * This is the preferred method for reading financial data
 * Never recalculate if a snapshot exists
 */
export function readSettlementFromSnapshot(snapshot: SettlementSnapshot): SettlementBreakdown {
  return {
    restaurantSubtotal: snapshot.restaurantSubtotal,
    restaurantCommission: snapshot.platformCommission * (snapshot.restaurantSubtotal / snapshot.grossTotal),
    restaurantProcessingFee: snapshot.restaurantProcessingFee,
    restaurantNetAmount: snapshot.restaurantSettlement,
    deliveryAmount: snapshot.deliveryAmount,
    driverProcessingFee: snapshot.courierProcessingFee,
    driverNetAmount: snapshot.courierSettlement,
    platformCommission: snapshot.platformCommission,
    platformServiceFee: snapshot.platformServiceFee,
    platformProcessingFee: snapshot.platformProcessingFee,
    platformNetRevenue: snapshot.platformNetRevenue,
  };
}

/**
 * Validate that an order has complete financial data for settlements
 */
export function validateFinancialData(financials: Partial<OrderFinancials>): {
  valid: boolean;
  missing: string[];
} {
  const required: (keyof OrderFinancials)[] = [
    "grossTotal",
    "productsSubtotal",
    "shippingFee",
    "platformServiceFee",
    "platformCommission",
    "paymentProcessingFee",
    "driverPayout",
  ];

  const missing = required.filter((field) => financials[field] === undefined || financials[field] === null);

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Get settlement status based on payment status and provider
 */
export function getSettlementStatus(order: {
  paymentProvider?: string;
  paymentStatus?: string;
  settlementStatus?: string;
}): string {
  // If already settled, keep that status
  if (order.settlementStatus && order.settlementStatus !== "pending") {
    return order.settlementStatus;
  }

  // Stripe payments are ready for settlement when paid
  if (order.paymentProvider === "stripe" && order.paymentStatus === "paid") {
    return "ready";
  }

  // Cash payments are pending until collected
  if (order.paymentProvider === "cash") {
    return "pending";
  }

  // Default to pending
  return "pending";
}

/**
 * Calculate platform profit margin
 */
export function calculatePlatformMargin(settlement: SettlementBreakdown, grossTotal: number): number {
  if (settlement.platformNetRevenue <= 0 || grossTotal <= 0) return 0;
  return (settlement.platformNetRevenue / grossTotal) * 100;
}

/**
 * Format financial data for Baserow sync
 * Uses snapshot data if available
 */
export interface BaserowFinancialData {
  paymentProvider: string;
  paymentProcessingFee: number;
  paymentProcessingFeePercentage: number;
  paymentProcessingFixedFee: number;
  paymentNetAmount: number;
  restaurantSubtotal: number;
  deliveryAmount: number;
  restaurantSettlement: number;
  courierSettlement: number;
  platformCommission: number;
  platformNetRevenue: number;
}

export function formatForBaserow(
  financials: OrderFinancials,
  paymentProvider: string,
  snapshot?: SettlementSnapshot
): BaserowFinancialData {
  // Audit: if snapshot exists, always use it and log warning if recalculation was attempted
  if (snapshot) {
    console.info("[AUDIT] Using settlement snapshot for Baserow sync", {
      snapshotVersion: snapshot.version,
      snapshotCreatedAt: snapshot.createdAt,
      paymentProvider: snapshot.paymentProvider,
    });
    const data = {
      restaurantSubtotal: snapshot.restaurantSubtotal,
      deliveryAmount: snapshot.deliveryAmount,
      restaurantSettlement: snapshot.restaurantSettlement,
      courierSettlement: snapshot.courierSettlement,
      platformCommission: snapshot.platformCommission,
      platformNetRevenue: snapshot.platformNetRevenue,
    };
    return {
      paymentProvider,
      paymentProcessingFee: financials.paymentProcessingFee,
      paymentProcessingFeePercentage: financials.paymentProcessingFeePercentage,
      paymentProcessingFixedFee: financials.paymentProcessingFixedFee,
      paymentNetAmount: financials.paymentNetAmount,
      ...data,
    };
  }

  // No snapshot exists, calculate (this is expected for orders without snapshots)
  console.info("[AUDIT] No settlement snapshot found, calculating for Baserow sync");
  const breakdown = calculateSettlementBreakdown(financials);
  return {
    paymentProvider,
    paymentProcessingFee: financials.paymentProcessingFee,
    paymentProcessingFeePercentage: financials.paymentProcessingFeePercentage,
    paymentProcessingFixedFee: financials.paymentProcessingFixedFee,
    paymentNetAmount: financials.paymentNetAmount,
    restaurantSubtotal: breakdown.restaurantSubtotal,
    deliveryAmount: breakdown.deliveryAmount,
    restaurantSettlement: breakdown.restaurantNetAmount,
    courierSettlement: breakdown.driverNetAmount,
    platformCommission: breakdown.platformCommission,
    platformNetRevenue: breakdown.platformNetRevenue,
  };
}

/**
 * Audit validation: detect if a module attempts to recalculate a settled order
 * Logs a warning if recalculation is attempted on an order with a snapshot
 */
export function auditRecalculationAttempt(order: {
  _id?: string;
  orderNumber?: string;
  settlementSnapshot?: SettlementSnapshot | null;
  orderStatus?: string;
}): { shouldProceed: boolean; warning?: string } {
  if (order.settlementSnapshot) {
    const warning = `[AUDIT] Recalculation attempted on settled order ${order.orderNumber || order._id}. Snapshot v${order.settlementSnapshot.version} exists from ${order.settlementSnapshot.createdAt}. Using snapshot instead.`;
    console.warn(warning);
    return { shouldProceed: false, warning };
  }

  if (order.orderStatus === "completed" || order.orderStatus === "settled") {
    const warning = `[AUDIT] Recalculation attempted on completed order ${order.orderNumber || order._id}. Order status is ${order.orderStatus}.`;
    console.warn(warning);
    return { shouldProceed: false, warning };
  }

  return { shouldProceed: true };
}
