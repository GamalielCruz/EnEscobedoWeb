/**
 * Centralized payment processor fee calculation module
 * 
 * This module handles all payment processor fee calculations in a single place
 * to ensure consistency across the application and facilitate maintenance.
 * 
 * Design principles:
 * - Never recalculate fees for historical orders
 * - Use actual processor fees when available
 * - Fall back to estimated calculations only when necessary
 * - Support multiple payment processors (Stripe, Mercado Pago, OpenPay, etc.)
 * - All financial calculations should use this module
 * - Use generic field names (paymentProcessingFee) instead of processor-specific names
 */

export type PaymentProcessorType = "stripe" | "mercadopago" | "openpay" | "cash" | "external_pos" | "none";

export interface ProcessorFeeConfig {
  processor: PaymentProcessorType;
  percentage: number; // Fee percentage as decimal (e.g., 0.036 for 3.6%)
  fixedFee: number; // Fixed fee in MXN
  currency: string; // Currency code (default: "mxn")
}

export interface CalculatedProcessorFees {
  fee: number; // Total fee amount
  percentage: number; // Percentage used for calculation
  fixedFee: number; // Fixed fee used for calculation
  netAmount: number; // Amount after processor fee
}

export interface StoredProcessorFees extends CalculatedProcessorFees {
  processor: PaymentProcessorType;
  calculatedAt: string; // ISO timestamp when calculated
  isEstimated: boolean; // true if using fallback calculation
}

/**
 * Default fee configurations for each payment processor
 * These are used as fallbacks when actual fees are not available
 */
const DEFAULT_FEE_CONFIGS: Record<PaymentProcessorType, ProcessorFeeConfig> = {
  stripe: {
    processor: "stripe",
    percentage: 0.036, // 3.6%
    fixedFee: 3.0, // $3.00 MXN
    currency: "mxn",
  },
  mercadopago: {
    processor: "mercadopago",
    percentage: 0.0399, // 3.99%
    fixedFee: 3.0, // $3.00 MXN
    currency: "mxn",
  },
  openpay: {
    processor: "openpay",
    percentage: 0.035, // 3.5%
    fixedFee: 2.5, // $2.50 MXN
    currency: "mxn",
  },
  cash: {
    processor: "cash",
    percentage: 0,
    fixedFee: 0,
    currency: "mxn",
  },
  external_pos: {
    processor: "external_pos",
    percentage: 0,
    fixedFee: 0,
    currency: "mxn",
  },
  none: {
    processor: "none",
    percentage: 0,
    fixedFee: 0,
    currency: "mxn",
  },
};

/**
 * Get the default fee configuration for a payment processor
 */
export function getDefaultFeeConfig(processor: PaymentProcessorType): ProcessorFeeConfig {
  return DEFAULT_FEE_CONFIGS[processor] || DEFAULT_FEE_CONFIGS.none;
}

/**
 * Calculate processor fees using the default configuration
 * This should only be used as a fallback when actual fees are not available
 */
export function calculateEstimatedFees(
  amount: number,
  processor: PaymentProcessorType
): CalculatedProcessorFees {
  const config = getDefaultFeeConfig(processor);
  const fee = Math.round((amount * config.percentage + config.fixedFee) * 100) / 100;
  const netAmount = Math.max(0, amount - fee);

  return {
    fee,
    percentage: config.percentage,
    fixedFee: config.fixedFee,
    netAmount,
  };
}

/**
 * Calculate processor fees with actual values from the payment processor
 * This should be used when the processor returns the actual fee amount
 */
export function calculateFeesFromActual(
  amount: number,
  actualFee: number,
  processor: PaymentProcessorType
): CalculatedProcessorFees {
  const config = getDefaultFeeConfig(processor);
  const netAmount = Math.max(0, amount - actualFee);

  // Estimate the percentage that was applied (for reporting purposes)
  const estimatedPercentage = actualFee > config.fixedFee
    ? Math.round(((actualFee - config.fixedFee) / amount) * 10000) / 10000
    : config.percentage;

  return {
    fee: actualFee,
    percentage: estimatedPercentage,
    fixedFee: config.fixedFee,
    netAmount,
  };
}

/**
 * Create stored fee record for persistence
 */
export function createStoredFeeRecord(
  fees: CalculatedProcessorFees,
  processor: PaymentProcessorType,
  isEstimated: boolean = false
): StoredProcessorFees {
  return {
    ...fees,
    processor,
    calculatedAt: new Date().toISOString(),
    isEstimated,
  };
}

/**
 * Parse stored fee record from database using generic field names
 */
export function parseStoredFeeRecord(record: {
  paymentProcessingFee?: number;
  paymentProcessingFeePercentage?: number;
  paymentProcessingFixedFee?: number;
  paymentNetAmount?: number;
  paymentProvider?: string;
}): StoredProcessorFees | null {
  if (!record.paymentProcessingFee || !record.paymentProvider) {
    return null;
  }

  const processor = getProcessorType(record.paymentProvider);

  return {
    fee: record.paymentProcessingFee,
    percentage: record.paymentProcessingFeePercentage ?? 0,
    fixedFee: record.paymentProcessingFixedFee ?? 0,
    netAmount: record.paymentNetAmount ?? 0,
    processor,
    calculatedAt: new Date().toISOString(),
    isEstimated: record.paymentProcessingFeePercentage === undefined,
  };
}

/**
 * Migrate legacy Stripe-specific fields to generic payment processing fields
 * This maintains backward compatibility while using the new generic structure
 */
export function migrateLegacyStripeFields(record: {
  stripeFee?: number;
  stripeFeePercentage?: number;
  stripeFixedFee?: number;
  stripeNetAmount?: number;
  paymentProvider?: string;
  paymentProcessingFee?: number;
  paymentProcessingFeePercentage?: number;
  paymentProcessingFixedFee?: number;
  paymentNetAmount?: number;
}): {
  paymentProcessingFee?: number;
  paymentProcessingFeePercentage?: number;
  paymentProcessingFixedFee?: number;
  paymentNetAmount?: number;
} {
  // If generic fields already exist, use them
  if (record.paymentProcessingFee !== undefined) {
    return {
      paymentProcessingFee: record.paymentProcessingFee,
      paymentProcessingFeePercentage: record.paymentProcessingFeePercentage,
      paymentProcessingFixedFee: record.paymentProcessingFixedFee,
      paymentNetAmount: record.paymentNetAmount,
    };
  }

  // Otherwise migrate from Stripe-specific fields
  if (record.paymentProvider === "stripe" && record.stripeFee !== undefined) {
    return {
      paymentProcessingFee: record.stripeFee,
      paymentProcessingFeePercentage: record.stripeFeePercentage,
      paymentProcessingFixedFee: record.stripeFixedFee,
      paymentNetAmount: record.stripeNetAmount,
    };
  }

  return {};
}

/**
 * Get fee breakdown for settlements
 * This distributes the processor fee proportionally between restaurant and delivery
 */
export interface FeeBreakdown {
  restaurantFee: number;
  deliveryFee: number;
  restaurantNetAmount: number;
  deliveryNetAmount: number;
}

export function calculateFeeBreakdown(
  totalFee: number,
  restaurantAmount: number,
  deliveryAmount: number,
  totalAmount: number
): FeeBreakdown {
  if (totalAmount <= 0) {
    return {
      restaurantFee: 0,
      deliveryFee: 0,
      restaurantNetAmount: restaurantAmount,
      deliveryNetAmount: deliveryAmount,
    };
  }

  const restaurantRatio = restaurantAmount / totalAmount;
  const deliveryRatio = deliveryAmount / totalAmount;

  const restaurantFee = Math.round(totalFee * restaurantRatio * 100) / 100;
  const deliveryFee = Math.round(totalFee * deliveryRatio * 100) / 100;

  // Adjust for rounding errors
  const roundingError = totalFee - restaurantFee - deliveryFee;
  const adjustedDeliveryFee = deliveryFee + roundingError;

  return {
    restaurantFee,
    deliveryFee: adjustedDeliveryFee,
    restaurantNetAmount: restaurantAmount - restaurantFee,
    deliveryNetAmount: deliveryAmount - adjustedDeliveryFee,
  };
}

/**
 * Validate that stored fees are not recalculated for historical orders
 * This is a safety check to prevent accidental recalculation
 */
export function shouldRecalculateFees(order: {
  paymentProcessingFee?: number;
  stripeFee?: number;
  paymentProvider?: string;
  orderDate?: string;
}): boolean {
  // If generic fees are already stored, never recalculate
  if (order.paymentProcessingFee !== undefined && order.paymentProcessingFee > 0) {
    return false;
  }

  // If legacy Stripe fees are stored, never recalculate (migration will handle it)
  if (order.stripeFee !== undefined && order.stripeFee > 0) {
    return false;
  }

  // If payment provider is not a processor that charges fees, no calculation needed
  if (order.paymentProvider === "cash" || order.paymentProvider === "external_pos" || order.paymentProvider === "none") {
    return false;
  }

  // Only calculate if no fees are stored and payment requires it
  return true;
}

/**
 * Get processor type from payment provider string
 */
export function getProcessorType(paymentProvider?: string): PaymentProcessorType {
  switch (paymentProvider) {
    case "stripe":
      return "stripe";
    case "mercadopago":
      return "mercadopago";
    case "openpay":
      return "openpay";
    case "cash":
      return "cash";
    case "external_pos":
      return "external_pos";
    case "none":
      return "none";
    default:
      return "none";
  }
}
