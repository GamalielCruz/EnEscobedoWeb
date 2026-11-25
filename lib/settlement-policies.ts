/**
 * Settlement policies module
 * 
 * This module defines configurable policies for distributing payment processor fees
 * and other financial calculations across different parties (restaurant, courier, platform).
 * 
 * Policies can be configured per-store or globally, allowing flexible fee distribution
 * strategies as the business grows.
 */

export type FeeDistributionPolicy =
  | "proportional"
  | "restaurant_absorbs_all"
  | "courier_absorbs_all"
  | "split_equally"
  | "split_equally_two_parties"
  | "platform_absorbs_all";

export interface SettlementPolicyConfig {
  feeDistribution: FeeDistributionPolicy;
  platformAbsorbsServiceFee?: boolean;
  platformAbsorbsCommission?: boolean;
  customSplitRatio?: {
    restaurant: number; // 0-1
    courier: number; // 0-1
    platform: number; // 0-1
  };
}

export interface PolicyContext {
  orderType: "delivery" | "pickup";
  storeHasOwnDelivery: boolean;
  paymentProvider: string;
  storeId?: string;
  serviceKind?: "mandado" | "restaurant";
}

/**
 * Default settlement policy configuration
 * This can be overridden per-store or globally via environment variables
 */
const DEFAULT_POLICY: SettlementPolicyConfig = {
  feeDistribution: "proportional",
  platformAbsorbsServiceFee: false,
  platformAbsorbsCommission: false,
};

/**
 * Get settlement policy for a given context
 * In the future, this could read from store-specific configurations or database
 */
export function getSettlementPolicy(context: PolicyContext): SettlementPolicyConfig {
  // Mandados: only courier + platform participate (50/50).
  // restaurant processing fee = $0 (no restaurant involved).
  if (context.serviceKind === "mandado") {
    return {
      feeDistribution: "split_equally_two_parties",
      platformAbsorbsServiceFee: false,
      platformAbsorbsCommission: false,
    };
  }
  
  // Future: Read from store configuration or database
  // For now, use default policy for restaurants
  return DEFAULT_POLICY;
}

/**
 * Calculate fee distribution based on policy
 */
export interface FeeDistributionResult {
  restaurantFee: number;
  courierFee: number;
  platformFee: number;
  restaurantNetAmount: number;
  courierNetAmount: number;
  platformNetAmount: number;
}

export function calculateFeeDistribution(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number,
  totalAmount: number,
  policy: SettlementPolicyConfig
): FeeDistributionResult {
  switch (policy.feeDistribution) {
    case "proportional":
      return distributeProportionally(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount,
        totalAmount
      );

    case "restaurant_absorbs_all":
      return distributeRestaurantAbsorbsAll(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount
      );

    case "courier_absorbs_all":
      return distributeCourierAbsorbsAll(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount
      );

    case "split_equally":
      return distributeEqually(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount
      );

    case "split_equally_two_parties":
      return distributeEquallyTwoParties(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount
      );

    case "platform_absorbs_all":
      return distributePlatformAbsorbsAll(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount
      );

    default:
      // Fallback to proportional for unknown policies
      return distributeProportionally(
        totalFee,
        restaurantAmount,
        courierAmount,
        platformAmount,
        totalAmount
      );
  }
}

/**
 * Proportional distribution based on each party's share of the total
 */
function distributeProportionally(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number,
  totalAmount: number
): FeeDistributionResult {
  if (totalAmount <= 0) {
    return {
      restaurantFee: 0,
      courierFee: 0,
      platformFee: 0,
      restaurantNetAmount: restaurantAmount,
      courierNetAmount: courierAmount,
      platformNetAmount: platformAmount,
    };
  }

  const restaurantRatio = restaurantAmount / totalAmount;
  const courierRatio = courierAmount / totalAmount;
  const platformRatio = platformAmount / totalAmount;

  const restaurantFee = Math.round(totalFee * restaurantRatio * 100) / 100;
  const courierFee = Math.round(totalFee * courierRatio * 100) / 100;
  const platformFee = totalFee - restaurantFee - courierFee; // Remainder goes to platform

  return {
    restaurantFee,
    courierFee,
    platformFee,
    restaurantNetAmount: restaurantAmount - restaurantFee,
    courierNetAmount: courierAmount - courierFee,
    platformNetAmount: platformAmount - platformFee,
  };
}

/**
 * Restaurant absorbs all processing fees
 */
function distributeRestaurantAbsorbsAll(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number
): FeeDistributionResult {
  return {
    restaurantFee: totalFee,
    courierFee: 0,
    platformFee: 0,
    restaurantNetAmount: restaurantAmount - totalFee,
    courierNetAmount: courierAmount,
    platformNetAmount: platformAmount,
  };
}

/**
 * Courier absorbs all processing fees
 */
function distributeCourierAbsorbsAll(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number
): FeeDistributionResult {
  return {
    restaurantFee: 0,
    courierFee: totalFee,
    platformFee: 0,
    restaurantNetAmount: restaurantAmount,
    courierNetAmount: courierAmount - totalFee,
    platformNetAmount: platformAmount,
  };
}

/**
 * Split fees equally among all parties (3-way: restaurant, courier, platform)
 */
function distributeEqually(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number
): FeeDistributionResult {
  const parties = 3;
  const feePerParty = Math.round((totalFee / parties) * 100) / 100;
  const roundingError = totalFee - (feePerParty * parties);

  return {
    restaurantFee: feePerParty,
    courierFee: feePerParty,
    platformFee: feePerParty + roundingError,
    restaurantNetAmount: restaurantAmount - feePerParty,
    courierNetAmount: courierAmount - feePerParty,
    platformNetAmount: platformAmount - (feePerParty + roundingError),
  };
}

/**
 * Split fees equally between courier and platform only (2-way: 50/50).
 * Used for Mandados where restaurant has no financial participation.
 */
function distributeEquallyTwoParties(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number
): FeeDistributionResult {
  const halfFee = Math.round((totalFee / 2) * 100) / 100;
  const roundingError = totalFee - halfFee * 2;

  return {
    restaurantFee: 0,
    courierFee: halfFee,
    platformFee: halfFee + roundingError,
    restaurantNetAmount: restaurantAmount,
    courierNetAmount: courierAmount - halfFee,
    platformNetAmount: platformAmount - (halfFee + roundingError),
  };
}

/**
 * Platform absorbs all processing fees
 */
function distributePlatformAbsorbsAll(
  totalFee: number,
  restaurantAmount: number,
  courierAmount: number,
  platformAmount: number
): FeeDistributionResult {
  return {
    restaurantFee: 0,
    courierFee: 0,
    platformFee: totalFee,
    restaurantNetAmount: restaurantAmount,
    courierNetAmount: courierAmount,
    platformNetAmount: platformAmount - totalFee,
  };
}

/**
 * Validate policy configuration
 */
export function validatePolicyConfig(policy: SettlementPolicyConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const validPolicies: FeeDistributionPolicy[] = [
    "proportional",
    "restaurant_absorbs_all",
    "courier_absorbs_all",
    "split_equally",
    "split_equally_two_parties",
    "platform_absorbs_all",
  ];

  if (!validPolicies.includes(policy.feeDistribution)) {
    errors.push(`Invalid fee distribution policy: ${policy.feeDistribution}`);
  }

  if (policy.customSplitRatio) {
    const total = policy.customSplitRatio.restaurant + policy.customSplitRatio.courier + policy.customSplitRatio.platform;
    if (Math.abs(total - 1) > 0.01) {
      errors.push(`Custom split ratio must sum to 1, got ${total}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
