// ────────────────────────────────────────────────────────────────────
// Evaluación bilateral cliente ↔ repartidor (sistema de 3 ESTRELLAS).
//
// Este módulo es PURO (sin I/O, sin imports) para poder probarse con
// `node --experimental-strip-types --test`. La persistencia (Sanity) y las
// rutas API consumen estas decisiones; la UI solo pinta lo que aquí se decide.
//
// Principios:
//   - SOLO 3 niveles: 3 = todo salió bien, 2 = hubo algún inconveniente,
//     1 = mala experiencia. El 3 va PRESELECCIONADO: la mayoría de las
//     evaluaciones se completan con un solo toque en "Listo".
//   - El menú de motivos es CONTEXTUAL por calificación y por ROL: cada nivel
//     ofrece su propio catálogo y el cliente nunca ve motivos del repartidor
//     (ni al revés). El 3★ no muestra ningún menú.
//   - Al cambiar de nivel se descartan los motivos incompatibles (volver a 3★
//     limpia todo); nunca se guarda un motivo que no pertenezca al nivel final.
//   - Un incidente grave NO es una acusación ni una sanción: habilita una
//     opción secundaria (ayuda de ElMenu / reporte privado a administración)
//     y abre un reporte para revisión HUMANA.
//   - La evaluación del cliente y la del repartidor son INDEPENDIENTES: viven
//     en documentos separados con id determinista por (orden, rol).
//
// IMPORTANTE (integración): este módulo NO toca `repartidor.calificacion`,
// porque ese campo alimenta el ranking del algoritmo de despacho. Las nuevas
// evaluaciones se guardan aparte y NO generan sanciones automáticas.
// ────────────────────────────────────────────────────────────────────

export type RatingRole = "customer" | "driver";
export type RatingLevel = 1 | 2 | 3;

export type RatingReason = {
  /** Código estable (se persiste; no cambiar sin migración). */
  code: string;
  /** Texto visible para el usuario. */
  label: string;
  /** true = incidente grave → habilita reporte privado para administración. */
  serious?: boolean;
};

export const RATING_LEVELS: RatingLevel[] = [1, 2, 3];

/** Calificación PRESELECCIONADA: todo salió bien. */
export const DEFAULT_RATING: RatingLevel = 3;

export const RATING_COMMENT_MAX = 1000;
export const RATING_INCIDENT_MAX = 2000;

/**
 * Ventana para evaluar: pasada esta cantidad de horas desde la entrega, la
 * evaluación ya no se muestra ni se acepta. Mantiene la tarjeta relevante y
 * evita recordatorios sobre pedidos muy antiguos.
 */
export const RATING_WINDOW_HOURS = 72;

/**
 * Ventana MÓVIL de reputación: el promedio visible se calcula solo con las
 * últimas 50 evaluaciones disponibles. Cuando entra una nueva y ya había 50, la
 * más antigua sale del cálculo. Nunca es un promedio histórico permanente.
 */
export const RATING_WINDOW_SIZE = 50;

export const RATING_ANONYMITY_NOTE =
  "Tu evaluación es anónima: la otra persona no sabe quién la calificó ni de qué pedido viene.";

const HOUR_MS = 60 * 60 * 1000;

/**
 * ¿Sigue abierta la ventana de evaluación para una entrega? Fail-closed: sin
 * fecha válida no hay ventana (no se muestra la tarjeta).
 */
export function isRatingWindowOpen(
  deliveredAt: string | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!deliveredAt) return false;
  const deliveredMs = new Date(deliveredAt).getTime();
  if (!Number.isFinite(deliveredMs)) return false;
  // Tolerante a relojes adelantados: una entrega "en el futuro" cuenta como
  // recién hecha en lugar de descartarse.
  return nowMs - deliveredMs <= RATING_WINDOW_HOURS * HOUR_MS;
}

export type RatingSummary = {
  /** Promedio 1-3 con un decimal (o null si no hay evaluaciones). */
  average: number | null;
  count: number;
  distribution: Record<RatingLevel, number>;
};

/**
 * Reputación ANÓNIMA de cara al usuario evaluado: solo el promedio de una
 * ventana móvil. No expone la distribución, ni evaluaciones individuales, ni
 * quién calificó, ni el pedido de origen.
 */
export type ReputationSummary = {
  /** Promedio 1-3 con un decimal (o null si no hay evaluaciones). */
  average: number | null;
  /** Evaluaciones consideradas en la ventana (nunca más que `windowSize`). */
  count: number;
  /** Tamaño máximo de la ventana (50). */
  windowSize: number;
};

/**
 * Resume una lista de evaluaciones (solo lectura, puro). Ignora cualquier
 * valor que no sea una calificación válida para no inventar promedios.
 */
export function summarizeRatings(ratings: readonly unknown[]): RatingSummary {
  const distribution: Record<RatingLevel, number> = { 1: 0, 2: 0, 3: 0 };
  let count = 0;
  let sum = 0;

  for (const entry of ratings) {
    const raw = typeof entry === "object" && entry !== null ? (entry as { rating?: unknown }).rating : entry;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 3) continue;
    const level = numeric as RatingLevel;
    distribution[level] += 1;
    count += 1;
    sum += level;
  }

  if (count === 0) return { average: null, count, distribution };
  return { average: Math.round((sum / count) * 10) / 10, count, distribution };
}

/**
 * Promedio sobre una VENTANA MÓVIL de las últimas `windowSize` evaluaciones.
 *
 * La lista debe llegar ordenada de la más reciente a la más antigua: se
 * consideran solo las primeras `windowSize` (las más nuevas) y las más antiguas
 * quedan fuera del cálculo. Los valores inválidos se descartan sin ocupar lugar
 * en la ventana y, si no hay evaluaciones válidas, el promedio es null (nunca
 * se inventan evaluaciones faltantes).
 */
export function summarizeReputation(
  ratings: readonly unknown[],
  windowSize: number = RATING_WINDOW_SIZE
): ReputationSummary {
  const size = Number.isFinite(windowSize) ? Math.max(1, Math.floor(windowSize)) : RATING_WINDOW_SIZE;

  const valid: RatingLevel[] = [];
  for (const entry of ratings) {
    const raw = typeof entry === "object" && entry !== null ? (entry as { rating?: unknown }).rating : entry;
    const numeric = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > 3) continue;
    valid.push(numeric as RatingLevel);
  }

  const window = valid.slice(0, size);
  if (window.length === 0) return { average: null, count: 0, windowSize: size };

  const sum = window.reduce((total, level) => total + level, 0);
  return {
    average: Math.round((sum / window.length) * 10) / 10,
    count: window.length,
    windowSize: size,
  };
}

/**
 * Texto humano de la ventana de reputación. Si hay menos de la ventana completa,
 * se indica el número REAL de entregas evaluadas; nunca se redondea a 50.
 */
export function reputationWindowLabel(
  count: number,
  windowSize: number = RATING_WINDOW_SIZE
): string {
  const size = Number.isFinite(windowSize) ? Math.max(1, Math.floor(windowSize)) : RATING_WINDOW_SIZE;
  const safeCount = Number.isFinite(count) ? Math.max(0, Math.min(Math.floor(count), size)) : 0;
  if (safeCount === 0) return "Aún no tienes evaluaciones";
  return `Basado en tus últimas ${safeCount} ${safeCount === 1 ? "entrega" : "entregas"}`;
}

/** Pregunta inicial del componente, por rol. */
export const RATING_PROMPT: Record<RatingRole, string> = {
  customer: "¿Cómo fue tu experiencia?",
  driver: "¿Cómo fue tu experiencia con el cliente?",
};

/** Significado de cada estrella (ARIA + refuerzo visual). */
export const RATING_LEVEL_LABEL: Record<RatingLevel, string> = {
  3: "Todo salió bien",
  2: "Hubo algún inconveniente",
  1: "Mala experiencia",
};

/**
 * Copy contextual por rol y nivel.
 *   - 3★ → mensaje positivo, SIN menú de motivos.
 *   - 2★ → "¿Qué podríamos mejorar?" + motivos leves.
 *   - 1★ → "¿Qué ocurrió?" + motivos de incidencia.
 */
export const RATING_INTRO: Record<RatingRole, Record<RatingLevel, string>> = {
  customer: {
    3: "¡Gracias! Nos alegra que todo haya salido bien.",
    2: "¿Qué podríamos mejorar?",
    1: "Lamentamos que tu experiencia no haya sido la esperada. ¿Qué ocurrió?",
  },
  driver: {
    3: "¡Excelente! Gracias por completar tu entrega.",
    2: "¿Hubo algún inconveniente durante la entrega?",
    1: "Lamentamos que esta entrega no haya salido como esperabas. ¿Qué ocurrió?",
  },
};

/** Confirmación breve tras guardar (por rol y nivel). */
export const RATING_THANKS_COPY: Record<RatingRole, Record<RatingLevel, string>> = {
  customer: {
    3: "¡Gracias! Nos alegra que todo haya salido bien.",
    2: "Gracias por contarnos qué podemos mejorar.",
    1: "Gracias por contarnos lo sucedido. Lo revisaremos.",
  },
  driver: {
    3: "¡Excelente! Gracias por completar tu entrega.",
    2: "Gracias por contarnos qué complicó la entrega.",
    1: "Gracias por contarnos lo sucedido. Lo revisaremos.",
  },
};

export const RATING_COMMENT_PLACEHOLDER: Record<RatingRole, string> = {
  customer: "¿Quieres contarnos algo más? (opcional)",
  driver: "¿Quieres añadir algún detalle? (opcional)",
};

export const RATING_INCIDENT_PLACEHOLDER =
  "Describe lo sucedido con tus palabras. Lo revisará una persona del equipo. (opcional)";

/** Opción secundaria que se habilita ante un incidente grave, por rol. */
export const RATING_REPORT_OPTION_LABEL: Record<RatingRole, string> = {
  customer: "Solicitar ayuda de ElMenu",
  driver: "Reportar a administración (privado)",
};

/** Aclaración: un reporte abre revisión humana, nunca una sanción automática. */
export const RATING_REPORT_NOTE: Record<RatingRole, string> = {
  customer: "Una persona del equipo de ElMenu revisará tu caso. No es una sanción automática.",
  driver: "El reporte es privado y lo revisará administración. No genera sanciones automáticas.",
};

/**
 * Catálogo de motivos por rol y nivel.
 *   - 3★ no tiene motivos: no hay nada que corregir.
 *   - 2★ recoge inconvenientes.
 *   - 1★ recoge incidencias; las marcadas `serious` habilitan el reporte.
 */
const REASON_CATALOG: Record<RatingRole, Partial<Record<RatingLevel, RatingReason[]>>> = {
  customer: {
    2: [
      { code: "late", label: "La entrega tardó más de lo esperado." },
      { code: "poor_communication", label: "Hubo poca comunicación." },
      { code: "better_treatment", label: "El trato pudo ser mejor." },
      { code: "instructions_not_followed", label: "No se siguieron mis instrucciones." },
      { code: "bad_condition", label: "El pedido llegó en malas condiciones." },
      { code: "other", label: "Otro motivo." },
    ],
    1: [
      { code: "not_delivered", label: "Mi pedido no fue entregado.", serious: true },
      {
        code: "serious_delivery_problem",
        label: "Hubo un problema importante con la entrega.",
      },
      {
        code: "disrespectful_driver",
        label: "El repartidor tuvo una actitud irrespetuosa.",
        serious: true,
      },
      {
        code: "damaged_or_tampered",
        label: "El pedido llegó dañado o manipulado incorrectamente.",
        serious: true,
      },
      { code: "instructions_not_respected", label: "No se respetaron mis instrucciones." },
      {
        code: "safety_problem",
        label: "Tuve un problema de seguridad.",
        serious: true,
      },
      { code: "other", label: "Otro motivo." },
    ],
  },
  driver: {
    2: [
      { code: "slow_response", label: "El cliente tardó en responder." },
      { code: "address_clarification", label: "La dirección necesitó aclaraciones." },
      { code: "unclear_instructions", label: "Las instrucciones no fueron claras." },
      { code: "customer_unavailable", label: "El cliente no estuvo disponible al llegar." },
      { code: "communication_difficulties", label: "Hubo dificultades de comunicación." },
      { code: "other", label: "Otro motivo." },
    ],
    1: [
      { code: "no_response", label: "El cliente no respondió a mis llamadas o mensajes." },
      { code: "wrong_address", label: "La dirección era incorrecta." },
      {
        code: "disrespectful_customer",
        label: "El cliente tuvo una conducta irrespetuosa.",
        serious: true,
      },
      {
        code: "customer_not_available",
        label: "El cliente no estuvo disponible para recibir el pedido.",
      },
      { code: "uncomfortable_situation", label: "Hubo una situación incómoda o conflictiva." },
      {
        code: "safety_compromised",
        label: "Se presentó una situación que comprometió mi seguridad.",
        serious: true,
      },
      { code: "other", label: "Otro motivo." },
    ],
  },
};

/** Motivos válidos para un rol y una calificación. 3★ → sin motivos. */
export function reasonsFor(role: RatingRole, level: RatingLevel): RatingReason[] {
  return REASON_CATALOG[role]?.[level] ?? [];
}

/** ¿La calificación seleccionada abre un menú de motivos? (solo 2★ y 1★) */
export function ratingHasReasons(level: RatingLevel): boolean {
  return level !== DEFAULT_RATING;
}

/**
 * Descarta motivos que no pertenezcan al rol/nivel actuales y deduplica.
 * Se usa al cambiar de nivel: evita guardar motivos incompatibles y limpia
 * todo al volver a 3★.
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

/**
 * Texto del botón final: "Listo" para la evaluación positiva (3★) y
 * "Enviar evaluación" para las de 1★/2★.
 */
export function ratingSubmitLabel(level: RatingLevel | null | undefined): string {
  return level === DEFAULT_RATING ? "Listo" : "Enviar evaluación";
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
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 3) {
    errors.push("La calificación debe ser un número entero entre 1 y 3.");
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