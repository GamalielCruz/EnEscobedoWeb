// ────────────────────────────────────────────────────────────────────
// Persistencia de evaluaciones (server-only).
//
// MÓDULO DESACOPLADO: escribe SOLO documentos `orderRating`, con _id
// determinista por (orden, rol). Nunca toca el documento de la orden, los
// estados, los precios, el pago, la disponibilidad ni el reparto.
//
// Guards fail-closed:
//   - El evaluador debe ser quien dice ser (cliente = clerkUserId de la
//     orden; repartidor = repartidorAsignado de la orden).
//   - La orden debe estar ENTREGADA (isOrderRateable).
//   - Una evaluación por orden y dirección (createIfNotExists).
// ────────────────────────────────────────────────────────────────────

import { backendClient } from "@/sanity/lib/backendClient";
import {
  buildRatingDocumentId,
  counterpartRole,
  isOrderRateable,
  isRatingWindowOpen,
  summarizeRatings,
  validateRatingSubmission,
  type RatingRole,
  type RatingSubmissionValue,
  type RatingSummary,
} from "@/lib/order-ratings";

const ORDER_CONTEXT_QUERY = `*[
  _type == "order" && (_id == $id || orderNumber == $id) && !(_id in path('drafts.**'))
][0]{
  _id,
  orderNumber,
  clerkUserId,
  customerName,
  deliveredAt,
  orderStatus,
  status,
  cancelledAt,
  "driverId": repartidorAsignado._ref,
  "driverName": repartidorAsignado->nombre
}`;

type OrderContext = {
  _id: string;
  orderNumber?: string | null;
  clerkUserId?: string | null;
  customerName?: string | null;
  deliveredAt?: string | null;
  orderStatus?: string | null;
  status?: string | null;
  cancelledAt?: string | null;
  driverId?: string | null;
  driverName?: string | null;
};

export type RatingSubmitInput = {
  orderNumber: string;
  role: RatingRole;
  /** clerkUserId (cliente) o repartidor._id (repartidor). */
  evaluatorId: string;
  rating: unknown;
  reasons?: readonly unknown[];
  comment?: unknown;
  incidentDescription?: unknown;
  requestContact?: unknown;
};

export type RatingStatus = {
  ok: true;
  rateable: boolean;
  alreadyRated: boolean;
  rating: number | null;
  /** Nombre de la persona evaluada, para personalizar el copy. */
  evaluateeName: string | null;
};

export type RatingFailure = {
  ok: false;
  code: "not_found" | "not_rateable" | "forbidden" | "duplicate" | "invalid";
  error: string;
};

export type RatingStatusResult = RatingStatus | RatingFailure;
export type RatingSubmitResult =
  | { ok: true; created: boolean; alreadyRated: boolean; value: RatingSubmissionValue }
  | RatingFailure;

/** Motivo humano cuando la orden todavía no puede evaluarse. */
function notRateableMessage(order: OrderContext, role: RatingRole): string | null {
  if (!isOrderRateable(order)) {
    if (order.cancelledAt || String(order.orderStatus ?? order.status ?? "").toLowerCase() === "cancelled") {
      return "Este pedido fue cancelado y no puede evaluarse.";
    }
    return "Podrás evaluar cuando el pedido se confirme como entregado.";
  }
  // Ventana de 72 h: el periodo de evaluación no queda abierto para siempre.
  // Solo aplica si conocemos la fecha real de entrega.
  if (order.deliveredAt && !isRatingWindowOpen(order.deliveredAt)) {
    return "El periodo para evaluar este pedido ya terminó.";
  }
  if (role === "customer" && !order.driverId) {
    return "Este pedido no tuvo un repartidor asignado.";
  }
  return null;
}

/** Verifica que quien evalúa es quien dice ser en la orden. */
function identityMismatch(order: OrderContext, role: RatingRole, evaluatorId: string): boolean {
  if (role === "customer") return !order.clerkUserId || order.clerkUserId !== evaluatorId;
  return !order.driverId || order.driverId !== evaluatorId;
}

async function fetchOrderContext(orderNumber: string): Promise<OrderContext | null> {
  return backendClient.fetch<OrderContext | null>(ORDER_CONTEXT_QUERY, { id: orderNumber });
}

async function fetchExistingRating(ratingId: string): Promise<{ rating?: number | null } | null> {
  return backendClient.fetch<{ rating?: number | null } | null>(
    `*[_id == $id][0]{ rating }`,
    { id: ratingId }
  );
}

/** Estado de la evaluación para una dirección concreta. */
export async function getOrderRatingStatus(input: {
  orderNumber: string;
  role: RatingRole;
  evaluatorId: string;
}): Promise<RatingStatusResult> {
  const order = await fetchOrderContext(input.orderNumber);
  if (!order) {
    return { ok: false, code: "not_found", error: "Pedido no encontrado." };
  }
  if (identityMismatch(order, input.role, input.evaluatorId)) {
    return { ok: false, code: "forbidden", error: "No puedes evaluar este pedido." };
  }

  const ratingId = buildRatingDocumentId(order._id, input.role);
  const existing = await fetchExistingRating(ratingId);

  const evaluateeName =
    input.role === "customer" ? order.driverName ?? null : order.customerName ?? null;

  return {
    ok: true,
    rateable: notRateableMessage(order, input.role) === null,
    alreadyRated: Boolean(existing),
    rating: typeof existing?.rating === "number" ? existing.rating : null,
    evaluateeName,
  };
}

/** Registra una evaluación. Idempotente por (orden, rol). */
export async function submitOrderRating(input: RatingSubmitInput): Promise<RatingSubmitResult> {
  const order = await fetchOrderContext(input.orderNumber);
  if (!order) {
    return { ok: false, code: "not_found", error: "Pedido no encontrado." };
  }
  if (identityMismatch(order, input.role, input.evaluatorId)) {
    return { ok: false, code: "forbidden", error: "No puedes evaluar este pedido." };
  }

  const blocked = notRateableMessage(order, input.role);
  if (blocked) {
    return { ok: false, code: "not_rateable", error: blocked };
  }

  const validation = validateRatingSubmission({
    role: input.role,
    rating: input.rating,
    reasons: input.reasons,
    comment: input.comment,
    incidentDescription: input.incidentDescription,
    requestContact: input.requestContact,
  });
  if (!validation.ok) {
    return { ok: false, code: "invalid", error: validation.errors[0] ?? "Evaluación inválida." };
  }

  const value = validation.value;
  const ratingId = buildRatingDocumentId(order._id, input.role);

  const existing = await fetchExistingRating(ratingId);
  if (existing) {
    return {
      ok: false,
      code: "duplicate",
      error: "Ya enviaste tu evaluación para este pedido. ¡Gracias!",
    };
  }

  const now = new Date().toISOString();
  const evaluateeRole = counterpartRole(input.role);
  const evaluateeId =
    input.role === "customer" ? order.driverId ?? null : order.clerkUserId ?? null;

  await backendClient.createIfNotExists({
    _id: ratingId,
    _type: "orderRating",
    order: { _type: "reference", _ref: order._id },
    orderNumber: order.orderNumber ?? "",
    evaluatorRole: input.role,
    evaluatorId: input.evaluatorId,
    evaluateeRole,
    evaluateeId,
    rating: value.rating,
    reasons: value.reasons,
    comment: value.comment ?? undefined,
    hasSeriousIncident: value.hasSeriousIncident,
    report: {
      requested: value.reportRequested,
      status: value.reportRequested ? "pending_review" : "none",
      requestContact: value.requestContact,
      description: value.incidentDescription ?? undefined,
    },
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, created: true, alreadyRated: false, value };
}

// ────────────────────────────────────────────────────────────────────
// Tarjeta de calificación pendiente (cliente) y promedios recibidos.
// Solo LECTURA: nunca escribe en la orden ni en el repartidor.
// ────────────────────────────────────────────────────────────────────

const PENDING_CUSTOMER_QUERY = `*[
  _type == "order" &&
  !(_id in path('drafts.**')) &&
  clerkUserId == $userId &&
  defined(deliveredAt) &&
  defined(repartidorAsignado._ref) &&
  !(coalesce(orderStatus, status, "") in ["cancelled", "failed", "expired"])
] | order(deliveredAt desc)[0...20]{
  _id,
  orderNumber,
  deliveredAt,
  "driverName": repartidorAsignado->nombre
}`;

type PendingOrderRow = {
  _id: string;
  orderNumber?: string | null;
  deliveredAt?: string | null;
  driverName?: string | null;
};

export type PendingCustomerRating = {
  orderNumber: string;
  deliveredAt: string;
  driverName: string | null;
};

/**
 * El pedido más reciente del cliente que sigue dentro de la ventana de 72 h y
 * aún no fue evaluado. Si no hay ninguno, devuelve null (la tarjeta no se pinta).
 */
export async function getPendingCustomerRating(
  userId: string,
  nowMs: number = Date.now()
): Promise<PendingCustomerRating | null> {
  if (!userId) return null;

  const rows =
    (await backendClient.fetch<PendingOrderRow[] | null>(PENDING_CUSTOMER_QUERY, { userId })) ?? [];
  if (rows.length === 0) return null;

  const candidates = rows.filter(
    (row) => row.deliveredAt && isRatingWindowOpen(row.deliveredAt, nowMs)
  );
  if (candidates.length === 0) return null;

  // Una evaluación por (orden, rol): basta con saber cuáles ya existen.
  const ratingIds = candidates.map((row) => buildRatingDocumentId(row._id, "customer"));
  const existing =
    (await backendClient.fetch<string[] | null>(
      `*[_id in $ids && _type == "orderRating"]._id`,
      { ids: ratingIds }
    )) ?? [];
  const rated = new Set(existing);

  for (const row of candidates) {
    if (rated.has(buildRatingDocumentId(row._id, "customer"))) continue;
    return {
      orderNumber: row.orderNumber ?? row._id,
      deliveredAt: row.deliveredAt as string,
      driverName: row.driverName ?? null,
    };
  }

  return null;
}

const RECEIVED_RATINGS_QUERY = `*[
  _type == "orderRating" &&
  !(_id in path('drafts.**')) &&
  evaluateeRole == $role &&
  evaluateeId == $userId
] | order(createdAt desc)[0...200]{
  rating,
  createdAt,
  orderNumber,
  evaluatorRole
}`;

export type ReceivedRatingRow = {
  rating?: number | null;
  createdAt?: string | null;
  orderNumber?: string | null;
  evaluatorRole?: RatingRole | null;
};

export type RatingSummaryResult =
  | { ok: true; summary: RatingSummary; recent: ReceivedRatingRow[] }
  | RatingFailure;

/**
 * Promedio de las evaluaciones RECIBIDAS por una persona (repartidor o
 * cliente), calculado solo con las evaluaciones nuevas de 3★. No modifica
 * `repartidor.calificacion` (ese campo alimenta el despacho).
 */
export async function getRatingSummary(input: {
  evaluateeId: string;
  evaluateeRole: RatingRole;
}): Promise<RatingSummaryResult> {
  if (!input.evaluateeId) {
    return { ok: false, code: "not_found", error: "Perfil no encontrado." };
  }
  const rows =
    (await backendClient.fetch<ReceivedRatingRow[] | null>(RECEIVED_RATINGS_QUERY, {
      userId: input.evaluateeId,
      role: input.evaluateeRole,
    })) ?? [];

  return {
    ok: true,
    summary: summarizeRatings(rows),
    recent: rows.slice(0, 20),
  };
}
