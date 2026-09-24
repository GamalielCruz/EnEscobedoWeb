// ────────────────────────────────────────────────────────────────────
// Ciclo de vida de una oferta a repartidor (server-driven).
//
// Regla de negocio:
//   "Los 14 segundos comienzan cuando la oferta queda PRESENTADA al
//    repartidor, no cuando el dispatcher la envía."
//
// Estados:
//   PENDING_DELIVERY → la oferta existe y está reservada al repartidor,
//                      pero su ventana de respuesta todavía no empezó.
//   ACTIVE           → el repartidor la tiene en pantalla (ACK) y corre
//                      la ventana de 14 s desde `deliveryOfertaExpiresAt`.
//   ACCEPTED / REJECTED / EXPIRED / CANCELLED → terminales.
//
// Este módulo es PURO (sin imports ni I/O) para poder probarse con
// `node --experimental-strip-types --test`. La persistencia vive en
// delivery-dispatch.ts / las rutas API, que consumen estas decisiones.
// ────────────────────────────────────────────────────────────────────

/** Ventana de respuesta tras presentar la oferta (segundos). */
export const OFFER_ACTIVE_TTL_SECONDS = 14;

/**
 * Ventana máxima para ENTREGAR (presentar) la oferta al repartidor desde
 * que el dispatcher la envía. Es independiente de los 14 s de respuesta.
 * Reutiliza la infraestructura de timeout existente (deliveryOfertaExpiresAt
 * / ofertaExpiraAt) mientras la oferta está en PENDING_DELIVERY.
 */
export const OFFER_PENDING_WINDOW_SECONDS = 45;

/** TTL de ofertas que NO usan ACK de presentación (WhatsApp: restaurantes). */
export const OFFER_WA_TTL_SECONDS_DEFAULT = 10 * 60;

export type DriverOfferStatus =
  | "pending_delivery"
  | "active"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

const TERMINAL_STATUSES: readonly DriverOfferStatus[] = [
  "accepted",
  "rejected",
  "expired",
  "cancelled",
];

export function isTerminalOfferStatus(status?: string | null): boolean {
  return TERMINAL_STATUSES.includes(status as DriverOfferStatus);
}

export function isPendingOfferStatus(status?: string | null): boolean {
  return status === "pending_delivery";
}

export function isActiveOfferStatus(status?: string | null): boolean {
  return status === "active";
}

/**
 * Solo los mandados pasan por el ciclo PENDING_DELIVERY → ACTIVE, porque son
 * los que se presentan en la app del repartidor (Drive). El resto de ofertas
 * (WhatsApp/restaurantes) conservan su TTL existente y se consideran activas
 * desde que se envían (no hay ACK de presentación).
 */
export function offerUsesPresentationAck(serviceKind?: string | null): boolean {
  return serviceKind === "mandado";
}

export type OfferTiming = {
  status: Extract<DriverOfferStatus, "pending_delivery" | "active">;
  offerId: string;
  createdAt: string;
  /** Deadline vigente (pending: ventana de entrega; active: ventana de respuesta). */
  expiresAt: string;
  /** Tiempo máximo para presentar la oferta (solo pending). */
  deliveryDeadlineAt: string;
};

/**
 * Construye la ventana inicial de una oferta recién creada.
 *
 * - Mandados  → PENDING_DELIVERY. `expiresAt` es la ventana de entrega y NO
 *   arranca los 14 s; éstos se fijan al hacer ACK.
 * - Otros    → ACTIVE inmediato con el TTL existente (WhatsApp).
 */
export function buildOfferTiming(
  serviceKind: string | null | undefined,
  now: Date,
  offerId: string
): OfferTiming {
  const createdAt = now.toISOString();

  if (offerUsesPresentationAck(serviceKind)) {
    const deadline = new Date(now.getTime() + OFFER_PENDING_WINDOW_SECONDS * 1000).toISOString();
    return {
      status: "pending_delivery",
      offerId,
      createdAt,
      expiresAt: deadline,
      deliveryDeadlineAt: deadline,
    };
  }

  return {
    status: "active",
    offerId,
    createdAt,
    expiresAt: new Date(now.getTime() + OFFER_WA_TTL_SECONDS_DEFAULT * 1000).toISOString(),
    deliveryDeadlineAt: createdAt,
  };
}

/** Ventana de respuesta que se fija al presentar la oferta (ACK). */
export function buildOfferActivationWindow(now: Date): { shownAt: string; expiresAt: string } {
  const shownAt = now.toISOString();
  return {
    shownAt,
    expiresAt: new Date(now.getTime() + OFFER_ACTIVE_TTL_SECONDS * 1000).toISOString(),
  };
}

function isPast(isoDate: string | null | undefined, now: Date): boolean {
  if (!isoDate) return false;
  const ms = new Date(isoDate).getTime();
  return Number.isFinite(ms) && ms <= now.getTime();
}

// ── Decisión de ACK (OFFER_SHOWN) ──────────────────────────────────

export type OfferAckDecision =
  | { action: "activate" }
  | { action: "already_active"; expiresAt: string }
  | { action: "rejected"; error: string };

/**
 * Decide qué hacer cuando la app del repartidor confirma que la oferta
 * quedó presentada. Idempotente: un segundo ACK NO reinicia la ventana.
 */
export function decideOfferAck(input: {
  offerStatus?: string | null;
  deliveryOfertaExpiresAt?: string | null;
  offerDeliveryDeadlineAt?: string | null;
  offeredToRef?: string | null;
  driverId: string;
  repartidorAsignadoRef?: string | null;
  dispatchStatus?: string | null;
  now: Date;
}): OfferAckDecision {
  const { now } = input;

  if (input.repartidorAsignadoRef) {
    return {
      action: "rejected",
      error:
        input.repartidorAsignadoRef === input.driverId
          ? "La oferta ya fue aceptada."
          : "El pedido ya fue asignado a otro repartidor.",
    };
  }

  if (input.offeredToRef !== input.driverId) {
    return { action: "rejected", error: "Esta oferta no es para ti." };
  }

  if (input.dispatchStatus && input.dispatchStatus !== "offered") {
    return { action: "rejected", error: "El pedido ya no está ofertado." };
  }

  const status = input.offerStatus ?? null;

  if (isTerminalOfferStatus(status)) {
    const message =
      status === "cancelled"
        ? "La oferta fue cancelada."
        : status === "rejected"
          ? "La oferta fue rechazada."
          : status === "accepted"
            ? "La oferta ya fue aceptada."
            : "La oferta expiró.";
    return { action: "rejected", error: message };
  }

  if (isActiveOfferStatus(status)) {
    if (isPast(input.deliveryOfertaExpiresAt, now)) {
      return { action: "rejected", error: "La oferta expiró." };
    }
    return { action: "already_active", expiresAt: input.deliveryOfertaExpiresAt as string };
  }

  if (isPendingOfferStatus(status)) {
    // La ventana de entrega pudo haber vencido antes de que el repartidor la viera.
    if (isPast(input.offerDeliveryDeadlineAt ?? input.deliveryOfertaExpiresAt, now)) {
      return { action: "rejected", error: "La oferta expiró antes de mostrarse." };
    }
    return { action: "activate" };
  }

  // Ofertas legacy (sin offerStatus): ya se consideran presentadas al enviarse.
  if (input.deliveryOfertaExpiresAt && !isPast(input.deliveryOfertaExpiresAt, now)) {
    return { action: "already_active", expiresAt: input.deliveryOfertaExpiresAt };
  }
  return { action: "rejected", error: "La oferta expiró." };
}

// ── Decisión de aceptación ─────────────────────────────────────────

export type OfferAcceptanceDecision =
  | { ok: true; alreadyAssigned: boolean }
  | { ok: false; error: string };

/**
 * Decide si el backend debe permitir la aceptación. Es la autoridad final:
 * jamás acepta una oferta EXPIRED/CANCELLED aunque el frontend muestre un
 * contador incorrecto.
 *
 * Se permite aceptar desde PENDING_DELIVERY (el repartidor respondió antes de
 * que el ACK llegara al servidor); en ese caso la ventana deja de importar.
 */
export function decideOfferAcceptance(input: {
  offerStatus?: string | null;
  deliveryOfertaExpiresAt?: string | null;
  offeredToRef?: string | null;
  driverId: string;
  repartidorAsignadoRef?: string | null;
  now: Date;
}): OfferAcceptanceDecision {
  const { now } = input;

  if (input.repartidorAsignadoRef) {
    if (input.repartidorAsignadoRef === input.driverId) {
      return { ok: true, alreadyAssigned: true };
    }
    return { ok: false, error: "El pedido ya fue asignado a otro repartidor." };
  }

  if (input.offeredToRef !== input.driverId) {
    return { ok: false, error: "Esta oferta no es para ti." };
  }

  const status = input.offerStatus ?? null;

  if (status === "expired") return { ok: false, error: "La oferta expiró." };
  if (status === "cancelled") return { ok: false, error: "La oferta fue cancelada." };
  if (status === "rejected") return { ok: false, error: "La oferta ya fue rechazada." };
  if (status === "accepted") return { ok: false, error: "La oferta ya fue aceptada." };

  if (isActiveOfferStatus(status) || status === null) {
    if (!input.deliveryOfertaExpiresAt || isPast(input.deliveryOfertaExpiresAt, now)) {
      return { ok: false, error: "La oferta ya expiró." };
    }
    return { ok: true, alreadyAssigned: false };
  }

  // pending_delivery
  return { ok: true, alreadyAssigned: false };
}

/** Motivo terminal a registrar cuando el cron/liberación cierra una oferta. */
export function terminalStatusForReason(reason: string | null | undefined): DriverOfferStatus {
  if (!reason) return "expired";
  if (reason.includes("cancel")) return "cancelled";
  if (reason.includes("reject")) return "rejected";
  if (reason.includes("accept")) return "accepted";
  return "expired";
}

/**
 * Estado terminal que corresponde a una liberación de la orden, o `null` si
 * la liberación NO cierra la oferta (p. ej. no había repartidores o se vuelve
 * a la cola por cambio de modo). Permite distinguir EXPIRED / REJECTED /
 * CANCELLED de un simple regreso a `waiting_for_driver`.
 */
export function offerTerminalStatusForReleaseReason(
  reason: string | null | undefined
): DriverOfferStatus | null {
  if (!reason) return null;
  if (reason.includes("reject")) return "rejected";
  if (reason.includes("cancel") || reason === "driver_fin") return "cancelled";
  if (reason.includes("expire")) return "expired";
  if (reason.includes("accept")) return "accepted";
  return null;
}
