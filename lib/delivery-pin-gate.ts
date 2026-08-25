/**
 * Gate de validación NIP / Entrega Segura.
 *
 * Funciones PURAS (sin dependencias de Sanity, WhatsApp, ni React) que
 * encapsulan TODA la lógica de negocio de la validación del NIP.
 *
 * WhatsApp webhook Y Drive API importan estas funciones.
 * Cada canal agrega sus side effects específicos (mensajes, UI, etc.)
 * después de recibir el resultado de estas funciones.
 *
 * Flujo conceptual:
 *   AT_DOOR → checkDeliveryPinGate → puede pedir NIP / completar directamente
 *   NIP ingresado → validateAndCompleteDelivery → valida + completa o rechaza
 */

import { orderRequiresDeliveryPin, isDeliveryPinValid } from "./delivery-pin.ts";
import {
  effectiveNipStatus,
  getDeliveryPinBlockReason,
  type EffectiveNipStatus,
} from "./nip-delivery.ts";

// ── Constants (matching webhook) ──────────────────────────────────

const DELIVERY_PIN_MAX_ATTEMPTS = 5;
const DELIVERY_PIN_LOCK_MS = 15 * 60 * 1000;

// ── Types ──────────────────────────────────────────────────────────

export type DeliveryPinOrder = {
  _id: string;
  _rev: string;
  orderNumber: string;
  serviceKind?: string;
  mandadoEntregaSegura?: boolean;
  deliveryVerificationMethod?: string;
  deliveryVerificationStatus?: string;
  deliveryPinHash?: string;
  deliveryPinExpiresAt?: string;
  deliveryPinLockedUntil?: string;
  deliveryPinAttemptCount?: number;
  nipDeliveryStatus?: string;
  dispatchStatus?: string;
  phone?: string;
  customerName?: string;
  // For completeDeliveredOrder:
  paymentProvider?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  cashCollectedBy?: string;
  settlementStatus?: string;
  fulfillmentTiming?: string;
  mandadoContactStatus?: string;
};

export type GateCheckResult =
  | { action: "complete_without_pin"; reason: "no_pin_required" | "already_verified" }
  | { action: "request_pin"; reason: "pin_required" }
  | { action: "block"; reason: "expired" | "not_delivered" };

export type PinValidationResult =
  | { ok: true; verified: true }
  | { ok: false; reason: "wrong_pin"; attemptsRemaining: number; locked: boolean; lockedUntil?: string }
  | { ok: false; reason: "locked" }
  | { ok: false; reason: "expired" }
  | { ok: false; reason: "blocked"; blockReason: "expired" | "not_delivered" }
  | { ok: false; reason: "no_pin_required" }
  | { ok: false; reason: "not_at_door" };

// ── Gate check ─────────────────────────────────────────────────────

/**
 * Determina qué debe hacer el canal cuando el repartidor llega a la puerta
 * (dispatchStatus === "at_door").
 *
 * Lógica de negocio (sin side effects de canal):
 * 1. Si el NIP ya fue verificado → completar directamente (idempotente).
 * 2. Si la orden requiere NIP Y el gate está abierto → solicitar NIP.
 * 3. Si la orden requiere NIP Y el gate está cerrado → bloquear.
 * 4. Si la orden NO requiere NIP → completar directamente.
 *
 * @param now - Fecha actual
 * @returns GateCheckResult — el canal decide qué hacer según el resultado
 */
export function checkDeliveryPinGate(
  order: DeliveryPinOrder,
  now: Date = new Date()
): GateCheckResult {
  // 1. NIP ya verificado → completar directamente (endurecimiento A)
  if (effectiveNipStatus(order, now) === "verified") {
    return { action: "complete_without_pin", reason: "already_verified" };
  }

  // 2. ¿Requiere NIP?
  if (!orderRequiresDeliveryPin(order)) {
    return { action: "complete_without_pin", reason: "no_pin_required" };
  }

  // 3. Gate de entrega: ¿se puede solicitar el NIP?
  const blockReason = getDeliveryPinBlockReason(order, now);
  if (blockReason) {
    return { action: "block", reason: blockReason };
  }

  // 4. Gate abierto → solicitar NIP al repartidor
  return { action: "request_pin", reason: "pin_required" };
}

// ── Pin validation + delivery completion ───────────────────────────

/**
 * Valida un NIP proporcionado por el repartidor y determina si la entrega
 * puede completarse.
 *
 * Lógica de negocio (sin side effects de canal):
 * 1. Verifica que el pedido esté en at_door
 * 2. Si NIP no requerido → rechazar (usar completeDelivery directamente)
 * 3. Si ya verificado → idempotente (completar)
 * 4. Si bloqueado → rechazar
 * 5. Si expirado → rechazar
 * 6. Si gate cerrado → rechazar
 * 7. Valida el código → incrementa intentos si falla, marca verified si pasa
 *
 * NOTA: Esta función NO completa la entrega. Solo valida el NIP.
 * El llamador debe usar completeDelivery() después si ok=true.
 *
 * @param pin - Código de 6 dígitos
 * @param now - Fecha actual
 * @returns PinValidationResult
 */
export function validateDeliveryPin(
  order: DeliveryPinOrder,
  pin: string,
  now: Date = new Date()
): PinValidationResult {
  // 1. Must be at_door
  if (order.dispatchStatus !== "at_door") {
    return { ok: false, reason: "not_at_door" };
  }

  // 2. NIP not required → use completeDelivery directly
  if (!orderRequiresDeliveryPin(order)) {
    return { ok: false, reason: "no_pin_required" };
  }

  // 3. Already verified → idempotent
  if (effectiveNipStatus(order, now) === "verified") {
    return { ok: true, verified: true };
  }

  // 4. Locked
  if (order.deliveryPinLockedUntil && new Date(order.deliveryPinLockedUntil).getTime() > now.getTime()) {
    return { ok: false, reason: "locked" };
  }

  // 5. Expired
  if (order.deliveryPinExpiresAt && new Date(order.deliveryPinExpiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  // 6. Gate check
  const blockReason = getDeliveryPinBlockReason(order, now);
  if (blockReason) {
    return { ok: false, reason: "blocked", blockReason };
  }

  // 7. Validate the actual pin
  const isValid = isDeliveryPinValid(
    order.orderNumber,
    pin,
    order.deliveryPinHash ?? ""
  );

  if (!isValid) {
    const attempts = (order.deliveryPinAttemptCount ?? 0) + 1;
    const locked = attempts >= DELIVERY_PIN_MAX_ATTEMPTS;
    const lockedUntil = locked
      ? new Date(now.getTime() + DELIVERY_PIN_LOCK_MS).toISOString()
      : undefined;
    return {
      ok: false,
      reason: "wrong_pin",
      attemptsRemaining: Math.max(0, DELIVERY_PIN_MAX_ATTEMPTS - attempts),
      locked,
      lockedUntil,
    };
  }

  return { ok: true, verified: true };
}

// ── Helpers for callers ────────────────────────────────────────────

/**
 * Returns the attempt-related patch data after a failed pin attempt.
 * The caller (WhatsApp/Drive) applies this patch and registers the event.
 */
export function buildFailedPinPatch(
  order: DeliveryPinOrder,
  now: Date
): { patch: Record<string, unknown>; attempts: number; locked: boolean; lockedUntil?: string } {
  const attempts = (order.deliveryPinAttemptCount ?? 0) + 1;
  const locked = attempts >= DELIVERY_PIN_MAX_ATTEMPTS;
  const lockedUntil = locked
    ? new Date(now.getTime() + DELIVERY_PIN_LOCK_MS).toISOString()
    : undefined;
  return {
    patch: {
      deliveryPinAttemptCount: attempts,
      deliveryVerificationStatus: locked ? "locked" : "pending",
      deliveryPinLockedUntil: lockedUntil,
      updatedAt: now.toISOString(),
    },
    attempts,
    locked,
    lockedUntil,
  };
}
