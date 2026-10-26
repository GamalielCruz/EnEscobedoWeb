import assert from "node:assert/strict";
import test from "node:test";
import { calculateFeeDistribution, getSettlementPolicy, validatePolicyConfig } from "./settlement-policies.ts";

// ============================================================
// TEST 1: Mandado $44 + $10, Stripe fee $6.04
// courierProcessingFee = $3.02, platformProcessingFee = $3.02
// restaurantProcessingFee = $0
// ============================================================
test("Mandado Stripe $6.04 → 50/50 courier/platform, restaurant $0", () => {
  const policy = getSettlementPolicy({
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "stripe",
    serviceKind: "mandado",
  });

  assert.equal(policy.feeDistribution, "split_equally_two_parties");

  const stripeFee = 6.04;
  const result = calculateFeeDistribution(
    stripeFee,
    0,    // restaurantAmount (mandados have $0 restaurant)
    44,   // courierAmount (polygonPrice)
    10,   // platformAmount (serviceFee)
    54,   // totalAmount (polygonPrice + serviceFee)
    policy
  );

  assert.equal(result.restaurantFee, 0, "restaurantProcessingFee = $0");
  assert.equal(result.courierFee, 3.02, "courierProcessingFee = $3.02");
  assert.equal(result.platformFee, 3.02, "platformProcessingFee = $3.02");
  assert.equal(result.courierNetAmount, 44 - 3.02, "courierNet = $40.98");
  assert.equal(result.platformNetAmount, 10 - 3.02, "platformNet = $6.98");
  assert.equal(result.restaurantNetAmount, 0, "restaurantNet = $0");
});

// ============================================================
// TEST 2: Mandado efectivo: Stripe fee = $0
// ============================================================
test("Mandado cash → Stripe fee $0, all processing fees $0", () => {
  const policy = getSettlementPolicy({
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "cash",
    serviceKind: "mandado",
  });

  const result = calculateFeeDistribution(
    0,    // totalFee
    0,    // restaurantAmount
    44,   // courierAmount
    10,   // platformAmount
    54,   // totalAmount
    policy
  );

  assert.equal(result.restaurantFee, 0, "restaurantProcessingFee = $0");
  assert.equal(result.courierFee, 0, "courierProcessingFee = $0");
  assert.equal(result.platformFee, 0, "platformProcessingFee = $0");
  assert.equal(result.courierNetAmount, 44, "courierNet = $44");
  assert.equal(result.platformNetAmount, 10, "platformNet = $10");
});

// ============================================================
// TEST 3: Restaurante con proportional NO fue afectado
// ============================================================
test("Restaurante proportional no cambia", () => {
  const policy = getSettlementPolicy({
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "stripe",
    serviceKind: "restaurant",
  });

  assert.equal(policy.feeDistribution, "proportional", "Restaurante usa proportional");

  // Simular orden restaurante: $200 subtotal, $50 envío, $20 comisión, $8 Stripe
  const stripeFee = 8;
  const result = calculateFeeDistribution(
    stripeFee,
    200,  // restaurantAmount (subtotal)
    50,   // courierAmount (shipping)
    20,   // platformAmount (commission)
    270,  // totalAmount
    policy
  );

  // Con proportional: restaurantRatio = 200/270, courierRatio = 50/270
  // restaurantFee ≈ $5.93, courierFee ≈ $1.48
  assert.ok(result.restaurantFee > 0, "Restaurante paga parte del fee");
  assert.ok(result.courierFee > 0, "Courier paga parte del fee");
  assert.ok(result.restaurantFee + result.courierFee <= stripeFee, "Total no excede fee");
  // Solo verificar que NO es split_equally_two_parties
  assert.notEqual(result.restaurantFee, 0, "Restaurante NO tiene restaurantFee = 0 (no es split_equally_two_parties)");
});

// ============================================================
// TEST 4: getSettlementPolicy devuelve el tipo correcto
// ============================================================
test("getSettlementPolicy retorna policy correcta por serviceKind", () => {
  const mandadoPolicy = getSettlementPolicy({
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "stripe",
    serviceKind: "mandado",
  });
  assert.equal(mandadoPolicy.feeDistribution, "split_equally_two_parties");

  const restaurantPolicy = getSettlementPolicy({
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "stripe",
    serviceKind: "restaurant",
  });
  assert.equal(restaurantPolicy.feeDistribution, "proportional");

  const defaultPolicy = getSettlementPolicy({
    orderType: "delivery",
    storeHasOwnDelivery: false,
    paymentProvider: "stripe",
  });
  assert.equal(defaultPolicy.feeDistribution, "proportional");
});

// ============================================================
// TEST 5: Validación de política
// ============================================================
test("split_equally_two_parties es una política válida", () => {
  const result = validatePolicyConfig({
    feeDistribution: "split_equally_two_parties",
  });
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("split_equally sigue siendo válida (compatibilidad)", () => {
  const result = validatePolicyConfig({
    feeDistribution: "split_equally",
  });
  assert.equal(result.valid, true);
});
