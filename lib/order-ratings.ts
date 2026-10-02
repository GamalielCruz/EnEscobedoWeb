// ────────────────────────────────────────────────────────────────────
// Evaluación bilateral cliente ↔ repartidor (sistema de 5 pulgares).
//
// Este módulo es PURO (sin I/O, sin imports) para poder probarse con
// `node --experimental-strip-types --test`. La persistencia (Sanity) y las
// rutas API consumen estas decisiones; la UI solo pinta lo que aquí se decide.
//
// Principios:
//   - Sustituye las estrellas por 5 pulgares (1 = muy mala … 5 = excelente).
//   - El menú de motivos es CONTEXTUAL por calificación y por ROL: cada nivel
//     ofrece su propio catálogo y el cliente nunca ve motivos del repartidor
//     (ni al revés).
//   - Al cambiar de nivel se descartan los motivos incompatibles; nunca se
//     guarda un motivo que no pertenezca al nivel final.
//   - Un incidente grave NO es una acusación: activa un reporte privado para
//     revisión humana, no una sanción automática.
//   - La evaluación del cliente y la del repartidor son INDEPENDIENTES: viven
//     en documentos separados con id determinista por (orden, rol).
//
// IMPORTANTE (integración): este módulo NO toca `repartidor.calificacion`,
// porque ese campo alimenta el ranking del algoritmo de despacho. Las nuevas
// evaluaciones se guardan aparte.
// ────────────────────────────────────────────────────────────────────

export type RatingRole = "customer" | "driver";
export type RatingLevel = 1 | 2 | 3 | 4 | 5;

export type RatingReason = {
  /** Código estable (se persiste; no cambiar sin migración). */
  code: string;
  /** Texto visible para el usuario. */
  label: string;
  /** true = incidente grave → genera reporte privado para administración. */
  serious?: boolean;
};

export const RATING_LEVELS: RatingLevel[] = [1, 2, 3, 4, 5];
export const RATING_COMMENT_MAX = 1000;
export const RATING_INCIDENT_MAX = 2000;

/**
 * Intro contextual por rol y nivel. El nivel 5 no muestra menú de problemas
 * (solo mensaje positivo y comentario opcional).
 */
export const RATING_INTRO: Record<RatingRole, Record<RatingLevel, string>> = {
  customer: {
    5: "¡Excelente! Nos alegra que todo haya salido bien.",
    4: "¡Gracias por tu opinión! ¿Qué pequeño detalle podríamos mejorar?",
    3: "¿Qué podríamos mejorar para ofrecerte una mejor experiencia?",
    2: "Lamentamos que tu experiencia no haya sido la esperada. ¿Qué ocurrió?",
    1: "Lamentamos mucho lo ocurrido. Cuéntanos qué pasó para que podamos revisar tu experiencia.",
  },
  driver: {
    5: "¡Excelente entrega! Gracias por hacer que todo fuera sencillo.",
    4: "¿Hubo algún pequeño detalle durante la entrega?",
    3: "¿Qué dificultad encontraste durante esta entrega?",
    2: "Cuéntanos qué complicó esta entrega.",
    1: "Lamentamos que hayas tenido una mala experiencia. ¿Qué sucedió?",
  },
};

/** Etiqueta accesible del pulgar seleccionado (ARIA + refuerzo visual). */
export const RATING_LEVEL_LABEL: Record<RatingRole, Record<RatingLevel, string>> = {
  customer: {
    5: "Excelente experiencia",
    4: "Buena experiencia, con algún detalle menor",
    3: "Experiencia regular",
    2: "Mala experiencia",
    1: "Experiencia muy mala",
  },
  driver: {
    5: "Excelente entrega",
    4: "Buena entrega, con algún detalle",
    3: "Entrega regular",
    2: "Entrega con problemas",
    1: "Entrega muy difícil",
  },
};

export const RATING_COMMENT_PLACEHOLDER: Record<RatingRole, string> = {
  customer: "¿Quieres contarnos algo más? (opcional)",
  driver: "¿Quieres añadir algún detalle? (opcional)",
};

export const RATING_INCIDENT_PLACEHOLDER =
  "Describe lo sucedido con tus palabras. Lo revisará una persona del equipo de ElMenu. (opcional)";

export const RATING_REPORT_CONTACT_LABEL =
  "Quiero que el equipo de ElMenu se comunique conmigo para revisar este caso.";

export const RATING_THANKS_COPY: Record<RatingRole, string> = {
  customer: "¡Gracias! Tu opinión nos ayuda a mejorar.",
  driver: "¡Gracias! Registramos tu evaluación.",
};

/**
 * Catálogo de motivos por rol y nivel. El nivel 5 no tiene motivos: no hay
 * nada que corregir. Los niveles 1-2 concentran los incidentes graves.
 */
const REASON_CATALOG: Record<RatingRole, Partial<Record<RatingLevel, RatingReason[]>>> = {
  customer: {
    4: [
      { code: "late_minor", label: "La entrega tardó un poco más de lo esperado." },
      { code: "communication_minor", label: "Faltó un poco de comunicación." },
      { code: "friendliness_minor", label: "El repartidor pudo ser más amable." },
      { code: "handling_minor", label: "El pedido pudo manejarse con más cuidado." },
      { code: "instructions_minor", label: "Hubo un detalle con las instrucciones de entrega." },
      { code: "other", label: "Otro motivo." },
    ],
    3: [
      { code: "late", label: "La entrega tardó demasiado." },
      { code: "communication", label: "El repartidor no mantuvo una buena comunicación." },
      { code: "treatment", label: "El trato pudo ser mejor." },
      { code: "instructions_ignored", label: "No se siguieron mis instrucciones." },
      { code: "condition", label: "El pedido llegó en condiciones inadecuadas." },
      { code: "delivery_difficulty", label: "Hubo dificultades durante la entrega." },
      { code: "other", label: "Otro motivo." },
    ],
    2: [
      { code: "unkind", label: "El repartidor fue poco amable o irrespetuoso." },
      { code: "no_information", label: "No recibí información sobre mi pedido." },
      { code: "instructions_not_respected", label: "No se respetaron mis instrucciones." },
      { code: "damaged", label: "El pedido llegó dañado o en malas condiciones." },
      { code: "delivery_problem", label: "Hubo un problema importante con la entrega." },
      {
        code: "inappropriate_conduct",
        label: "El repartidor tuvo una conducta inapropiada.",
        serious: true,
      },
      { code: "other", label: "Otro motivo." },
    ],
    1: [
      { code: "not_delivered", label: "Mi pedido no fue entregado.", serious: true },
      {
        code: "marked_delivered_falsely",
        label: "El repartidor marcó la entrega como completada sin entregarme el pedido.",
        serious: true,
      },
      { code: "disrespectful_conduct", label: "El repartidor tuvo una conducta irrespetuosa.", serious: true },
      { code: "mishandled", label: "El pedido fue manipulado incorrectamente.", serious: true },
      {
        code: "instructions_not_followed",
        label: "El repartidor no respetó las instrucciones de entrega.",
        serious: true,
      },
      { code: "safety_issue", label: "Tuve un problema de seguridad durante la entrega.", serious: true },
      { code: "other", label: "Otro motivo." },
    ],
  },
  driver: {
    4: [
      { code: "address_clarification", label: "La dirección necesitó una pequeña aclaración." },
      { code: "slow_response_minor", label: "El cliente tardó un poco en responder." },
      { code: "unclear_instructions_minor", label: "Las instrucciones pudieron ser más claras." },
      { code: "finding_address_minor", label: "Hubo una pequeña dificultad para encontrar el domicilio." },
      { code: "other", label: "Otro motivo." },
    ],
    3: [
      { code: "slow_response", label: "El cliente tardó en responder." },
      { code: "wrong_address", label: "La dirección era incorrecta o incompleta." },
      { code: "unclear_instructions", label: "Las instrucciones de entrega no eran claras." },
      { code: "hard_to_locate", label: "Hubo dificultades para localizar al cliente." },
      { code: "customer_unavailable", label: "El cliente no estuvo disponible al llegar." },
      { code: "communication", label: "Hubo dificultades de comunicación." },
      { code: "other", label: "Otro motivo." },
    ],
    2: [
      { code: "no_response", label: "El cliente no respondió a mis mensajes o llamadas." },
      { code: "wrong_address_provided", label: "El cliente proporcionó una dirección incorrecta." },
      { code: "unkind", label: "El cliente tuvo un trato poco amable." },
      { code: "unavailable_to_receive", label: "El cliente no estuvo disponible para recibir el pedido." },
      { code: "contradictory_instructions", label: "Hubo instrucciones contradictorias." },
      {
        code: "uncomfortable_situation",
        label: "Se presentó una situación incómoda durante la entrega.",
        serious: true,
      },
      { code: "other", label: "Otro motivo." },
    ],
    1: [
      { code: "disrespectful_conduct", label: "El cliente tuvo una conducta irrespetuosa.", serious: true },
      { code: "threats", label: "El cliente realizó amenazas o agresiones.", serious: true },
      { code: "false_information", label: "El cliente proporcionó información falsa sobre la entrega.", serious: true },
      {
        code: "out_of_scope_request",
        label: "El cliente solicitó acciones fuera de las condiciones del servicio.",
        serious: true,
      },
      {
        code: "safety_compromised",
        label: "Existió una situación que comprometió mi seguridad.",
        serious: true,
      },
      {
        code: "could_not_complete",
        label: "No fue posible completar la entrega por causas atribuibles al cliente.",
        serious: true,
      },
      { code: "other", label: "Otro motivo." },
    ],
  },
};

/** Motivos válidos para un rol y una calificación. Nivel 5 → sin motivos. */
export function reasonsFor(role: RatingRole, level: RatingLevel): RatingReason[] {
  return REASON_CATALOG[role]?.[level] ?? [];
}

/** ¿El pulgar seleccionado abre un menú de motivos? (todos menos el 5). */
export function ratingHasReasons(level: RatingLevel): boolean {
  return level !== 5;
}

/**
 * Descarta motivos que no pertenezcan al rol/nivel actuales y deduplica.
 * Se usa al cambiar de nivel: evita guardar motivos incompatibles.
 */
export function sanitizeReasons(
  role: RatingRole,
  level: RatingLevel,
  codes: readonly unknown[]
): string[] {
  const allowed = new Set(reasonsFor(role, level).map((reason) => reason.code));
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of codes) {
    if (typeof raw !== "string") continue;
    const code = raw.trim();
    if (!code || seen.has(code) || !allowed.has(code)) continue;
    seen.add(code);
    result.push(code);
  }
  return result;
}

/** Motivos marcados como incidente grave dentro del rol/nivel. */
export function seriousReasonCodes(role: RatingRole, level: RatingLevel): string[] {
  return reasonsFor(role, level)
    .filter((reason) => reason.serious === true)
    .map((reason) => reason.code);
}

/** true si alguno de los motivos seleccionados es un incidente grave. */
export function isSeriousIncident(
  role: RatingRole,
  level: RatingLevel | null,
  codes: readonly unknown[]
): boolean {
  if (level == null) return false;
  const serious = new Set(seriousReasonCodes(role, level));
  return sanitizeReasons(role, level, codes).some((code) => serious.has(code));
}

/** Texto del botón final según exista o no un incidente grave. */
export function ratingSubmitLabel(hasSeriousIncident: boolean): string {
  return hasSeriousIncident ? "Enviar evaluación y reporte" : "Enviar evaluación";
}

/** Id determinista por (orden, rol): impide evaluaciones duplicadas. */
export function buildRatingDocumentId(orderId: string, role: RatingRole): string {
  return `orderRating-${orderId}-${role}`;
}

/** El rol EVALUADO es el contrario del evaluador. */
export function counterpartRole(role: RatingRole): RatingRole {
  return role === "customer" ? "driver" : "customer";
}

/** Estados de orden que cuentan como entrega completada. */
const DELIVERED_ORDER_STATES = new Set(["delivered", "completed", "picked_up"]);

export type RateableOrderInput = {
  deliveredAt?: string | null;
  orderStatus?: string | null;
  status?: string | null;
  cancelledAt?: string | null;
};

/**
 * ¿Se puede evaluar esta orden? Solo si la entrega terminó de verdad y no fue
 * cancelada. Fail-closed: sin entrega confirmada, no hay evaluación.
 */
export function isOrderRateable(order: RateableOrderInput): boolean {
  const orderStatus = String(order.orderStatus ?? order.status ?? "").toLowerCase();
  if (orderStatus === "cancelled" || orderStatus === "failed" || orderStatus === "expired") {
    return false;
  }
  if (order.cancelledAt) return false;
  if (order.deliveredAt && Number.isFinite(new Date(order.deliveredAt).getTime())) {
    return true;
  }
  return DELIVERED_ORDER_STATES.has(orderStatus);
}

export type RatingSubmissionInput = {
  role: RatingRole;
  rating: unknown;
  reasons?: readonly unknown[];
  comment?: unknown;
  incidentDescription?: unknown;
  requestContact?: unknown;
};

export type RatingSubmissionValue = {
  role: RatingRole;
  rating: RatingLevel;
  reasons: string[];
  comment: string | null;
  incidentDescription: string | null;
  requestContact: boolean;
  hasSeriousIncident: boolean;
  reportRequested: boolean;
};

export type RatingSubmissionResult =
  | { ok: true; value: RatingSubmissionValue }
  | { ok: false; errors: string[] };

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, max);
}

/**
 * Valida y normaliza un envío de evaluación. Devuelve SIEMPRE motivos
 * filtrados por rol/nivel, comentario recortado y el indicador de incidente
 * grave derivado de los motivos (nunca confiado del cliente).
 */
export function validateRatingSubmission(input: RatingSubmissionInput): RatingSubmissionResult {
  const errors: string[] = [];

  const numeric = typeof input.rating === "number" ? input.rating : Number(input.rating);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 5) {
    errors.push("La calificación debe ser un número entero entre 1 y 5.");
  }
  if (errors.length > 0) return { ok: false, errors };

  const level = numeric as RatingLevel;
  const reasons = sanitizeReasons(input.role, level, input.reasons ?? []);
  const hasSeriousIncident = isSeriousIncident(input.role, level, reasons);
  const comment = cleanText(input.comment, RATING_COMMENT_MAX);
  // La descripción ampliada solo tiene sentido con un incidente grave.
  const incidentDescription = hasSeriousIncident
    ? cleanText(input.incidentDescription, RATING_INCIDENT_MAX)
    : null;

  return {
    ok: true,
    value: {
      role: input.role,
      rating: level,
      reasons,
      comment,
      incidentDescription,
      requestContact: hasSeriousIncident && input.requestContact === true,
      hasSeriousIncident,
      reportRequested: hasSeriousIncident,
    },
  };
}
