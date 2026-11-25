import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We test the pure functions by importing them.
// Since the file uses TypeScript, we rely on --experimental-strip-types.

const mod = await import("./delivery-pin-gate.ts");
const { checkDeliveryPinGate, validateDeliveryPin, buildFailedPinPatch } = mod;

// ── Helpers ────────────────────────────────────────────────────────

function baseOrder(overrides = {}) {
  return {
    _id: "order-1",
    _rev: "rev-1",
    orderNumber: "test-order-001",
    serviceKind: "mandado",
    dispatchStatus: "at_door",
    mandadoEntregaSegura: false,
    deliveryVerificationMethod: undefined,
    deliveryVerificationStatus: undefined,
    deliveryPinHash: undefined,
    deliveryPinExpiresAt: undefined,
    deliveryPinLockedUntil: undefined,
    deliveryPinAttemptCount: 0,
    nipDeliveryStatus: undefined,
    ...overrides,
  };
}

// ── checkDeliveryPinGate ───────────────────────────────────────────

describe("checkDeliveryPinGate", () => {
  it("returns complete_without_pin when order does not require NIP", () => {
    const order = baseOrder({ mandadoEntregaSegura: false });
    const result = checkDeliveryPinGate(order);
    assert.equal(result.action, "complete_without_pin");
    assert.equal(result.reason, "no_pin_required");
  });

  it("returns complete_without_pin when NIP already verified", () => {
    const order = baseOrder({
      mandadoEntregaSegura: true,
      deliveryVerificationStatus: "verified",
    });
    const result = checkDeliveryPinGate(order);
    assert.equal(result.action, "complete_without_pin");
    assert.equal(result.reason, "already_verified");
  });

  it("returns request_pin when NIP required and gate open", () => {
    const order = baseOrder({
      mandadoEntregaSegura: true,
      nipDeliveryStatus: "delivered",
    });
    const result = checkDeliveryPinGate(order);
    assert.equal(result.action, "request_pin");
    assert.equal(result.reason, "pin_required");
  });

  it("returns block when NIP required but not delivered to channel", () => {
    const order = baseOrder({
      mandadoEntregaSegura: true,
      nipDeliveryStatus: "pending",
    });
    const result = checkDeliveryPinGate(order);
    assert.equal(result.action, "block");
    assert.equal(result.reason, "not_delivered");
  });

  it("returns block when NIP expired", () => {
    const pastDate = new Date(Date.now() - 100000).toISOString();
    const order = baseOrder({
      mandadoEntregaSegura: true,
      nipDeliveryStatus: "delivered",
      deliveryPinExpiresAt: pastDate,
    });
    const result = checkDeliveryPinGate(order);
    assert.equal(result.action, "block");
    assert.equal(result.reason, "expired");
  });

  it("returns complete_without_pin for restaurant without pin requirement", () => {
    const order = baseOrder({
      serviceKind: "restaurant",
      mandadoEntregaSegura: false,
      deliveryVerificationMethod: undefined,
      deliveryVerificationStatus: undefined,
    });
    const result = checkDeliveryPinGate(order);
    assert.equal(result.action, "complete_without_pin");
  });
});

// ── validateDeliveryPin ────────────────────────────────────────────

describe("validateDeliveryPin", () => {
  it("rejects when not at_door", () => {
    const order = baseOrder({ dispatchStatus: "accepted" });
    const result = validateDeliveryPin(order, "123456");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "not_at_door");
  });

  it("rejects when no pin required", () => {
    const order = baseOrder({ mandadoEntregaSegura: false });
    const result = validateDeliveryPin(order, "123456");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "no_pin_required");
  });

  it("returns ok when already verified (idempotent)", () => {
    const order = baseOrder({
      mandadoEntregaSegura: true,
      deliveryVerificationStatus: "verified",
    });
    const result = validateDeliveryPin(order, "123456");
    assert.equal(result.ok, true);
    assert.equal(result.verified, true);
  });

  it("rejects when locked", () => {
    const futureDate = new Date(Date.now() + 600000).toISOString();
    const order = baseOrder({
      mandadoEntregaSegura: true,
      nipDeliveryStatus: "delivered",
      deliveryPinLockedUntil: futureDate,
    });
    const result = validateDeliveryPin(order, "123456");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "locked");
  });

  it("rejects when expired", () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const order = baseOrder({
      mandadoEntregaSegura: true,
      nipDeliveryStatus: "delivered",
      deliveryPinExpiresAt: pastDate,
    });
    const result = validateDeliveryPin(order, "123456");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
  });

  it("rejects when gate blocked (NIP not delivered)", () => {
    const order = baseOrder({
      mandadoEntregaSegura: true,
      nipDeliveryStatus: "pending",
    });
    const result = validateDeliveryPin(order, "123456");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "blocked");
  });
});

// ── buildFailedPinPatch ────────────────────────────────────────────

describe("buildFailedPinPatch", () => {
  it("increments attempt count", () => {
    const order = baseOrder({ deliveryPinAttemptCount: 0 });
    const { patch, attempts, locked } = buildFailedPinPatch(order, new Date());
    assert.equal(attempts, 1);
    assert.equal(locked, false);
    assert.equal(patch.deliveryPinAttemptCount, 1);
    assert.equal(patch.deliveryVerificationStatus, "pending");
  });

  it("locks after max attempts", () => {
    const order = baseOrder({ deliveryPinAttemptCount: 4 });
    const { patch, attempts, locked } = buildFailedPinPatch(order, new Date());
    assert.equal(attempts, 5);
    assert.equal(locked, true);
    assert.equal(patch.deliveryVerificationStatus, "locked");
    assert.ok(patch.deliveryPinLockedUntil);
  });
});
