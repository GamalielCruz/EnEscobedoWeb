/**
 * Snapshot del estado del repartidor en `localStorage` (Fase 9, punto 2).
 *
 * QUÉ SE GUARDA (y qué NO): solo la respuesta de **nuestro** backend
 * (`/api/driver/state`: pedido, etapa, tienda y coordenadas del pedido). NO
 * se guarda nada de Mapbox: la geometría de Directions (`path`/`steps`) queda
 * fuera a propósito — los Product Terms §2.10.1 prohíben exportar, descargar,
 * cachear o almacenar resultados de una Navigation API, y §1.9(v) prohíbe
 * cachear «resultados de los Service Offerings». La duda está documentada en
 * el reporte de la Fase 9; ante conflicto, no se persiste la ruta.
 *
 * QUÉ PROBLEMA RESUELVE: si Safari iOS descarta la pestaña al cambiar de app
 * y el repartidor vuelve sin señal, el primer sondeo falla, `state` es null y
 * la página mostraba la pantalla de error (o `SignIn`) sin mapa. Con el
 * snapshot se restaura el pedido en curso y la navegación se reanuda al
 * volver la red.
 *
 * GARANTÍAS:
 *  - TTL corto (`DRIVER_STATE_SNAPSHOT_TTL_MS`): nunca resucita un viaje
 *    terminado ni un pedido reasignado hace rato.
 *  - Solo se restaura si hay trabajo activo (pedido u oferta): un snapshot de
 *    «disponible» no aporta nada y mostraría un estado de conexión viejo.
 *  - Solo LECTURA en la UI: restaurar no habilita ninguna acción de servidor;
 *    cualquier acción sigue exigiendo un POST que falla sin red.
 *  - MÍNIMO DATO PERSONAL (Fase 10, punto 1): el payload pasa por
 *    `sanitizeDriverStateForSnapshot`, que copia SOLO los campos que la
 *    navegación necesita mostrar. Se descartan nombre del cliente, dirección
 *    completa de la tienda, notas/indicaciones del mandado, qué recoger y la
 *    última ubicación del repartidor. El NIP de entrega NUNCA viaja en esta
 *    respuesta (el backend solo manda el booleano `requiresDeliveryPin`), y
 *    el snapshot tampoco guarda el NIP tecleado.
 *  - Atribuido al usuario: el sobre lleva `owner` (id de Clerk). Un snapshot
 *    de otro usuario no se restaura y se borra.
 *  - Nunca lanza: storage lleno (QuotaExceededError), privado o ausente se
 *    tratan como «no hay snapshot».
 *
 * La lista campo por campo vive en `ORDER_SNAPSHOT_FIELDS`,
 * `OFFER_SNAPSHOT_FIELDS` y `sanitizeDriverStateForSnapshot`.
 */

export const DRIVER_STATE_SNAPSHOT_KEY = "elmenu-drive-state-snapshot";

/** Caducidad del snapshot (10 min). Suficiente para un corte de LTE. */
export const DRIVER_STATE_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

/**
 * Versión del formato: un cambio incompatible descarta el snapshot viejo.
 * v2 (Fase 10): payload sanitizado + `owner`. Los sobres v1 se descartan a
 * propósito: podían contener datos personales que hoy ya no se guardan.
 */
const SNAPSHOT_VERSION = 2;

/** Desfase de reloj tolerado (ms) antes de considerar el snapshot corrupto. */
const MAX_CLOCK_SKEW_MS = 60_000;

/** Subconjunto de `Storage` que usa el módulo (permite dobles en pruebas). */
export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type SnapshotRead<T> =
  | { status: "ok"; payload: T; savedAt: number }
  | { status: "empty" | "corrupt" | "expired" | "invalid" }
  /** escrito por OTRO usuario: no se restaura y el llamador lo borra. */
  | { status: "foreign" };

type SnapshotEnvelope = {
  version: number;
  savedAt: number;
  /** id de Clerk del repartidor al que pertenece el snapshot. */
  owner: string | null;
  payload: unknown;
};

// ── Qué se guarda, campo por campo (Fase 10, punto 1) ────────────────
//
// PEDIDO: solo lo que la tarjeta, el panel y la navegación leen para pintar
// el viaje y decidir la etapa. NADA de nombre del cliente, dirección
// completa de la tienda, notas/referencias del mandado, productos ni la
// ubicación del repartidor (esa la da el GPS, no el snapshot).
const ORDER_SNAPSHOT_FIELDS = [
  "orderNumber",
  "serviceKind",
  "storeName",
  "destLabel",
  "storeLat",
  "storeLng",
  "destLat",
  "destLng",
  "routeKm",
  "etaMinutes",
  "dispatchStatus",
  "mandadoState",
  "mandadoOriginLabel",
  "mandadoDestinationLabel",
  "paymentLabel",
  "totalPrice",
  // Booleano de POLÍTICA del servidor, no el NIP: el código nunca se envía
  // al repartidor, así que no hay NIP que excluir de este payload.
  "requiresDeliveryPin",
] as const;

// OFERTA: la ventana de respuesta y los datos de la tarjeta de oferta.
const OFFER_SNAPSHOT_FIELDS = [
  "orderNumber",
  "serviceKind",
  "storeName",
  "destLabel",
  "storeLat",
  "storeLng",
  "destLat",
  "destLng",
  "routeKm",
  "etaMinutes",
  "paymentLabel",
  "totalPrice",
  "offerExpiresAt",
  "offerStatus",
  "offerId",
  "offerCreatedAt",
  "offerDeliveryDeadlineAt",
  "offerShownAt",
  "serverNow",
  "mandadoOriginLabel",
  "mandadoDestinationLabel",
] as const;

/** Campos EXCLUIDOS a propósito del pedido (se listan para la auditoría). */
export const ORDER_EXCLUDED_FROM_SNAPSHOT = [
  "customerName",
  "storeAddress",
  "mandadoDetails",
  "mandadoOriginReference",
  "mandadoDestinationReference",
  "itemsSummary",
  "itemsQuantity",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Copia SOLO las claves presentes de la lista blanca (nunca `undefined`). */
function pickFields(
  source: Record<string, unknown>,
  fields: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in source && source[field] !== undefined) out[field] = source[field];
  }
  return out;
}

/**
 * Reduce el estado del repartidor a lo mínimo que la restauración necesita.
 * Devuelve `null` si no hay trabajo activo (no se persiste nada).
 */
export function sanitizeDriverStateForSnapshot(
  payload: unknown
): Record<string, unknown> | null {
  if (!isRecord(payload) || !hasActiveWork(payload)) return null;
  const orders = Array.isArray(payload.orders)
    ? payload.orders.filter(isRecord).map((order) => pickFields(order, ORDER_SNAPSHOT_FIELDS))
    : [];
  const offer = isRecord(payload.offer)
    ? pickFields(payload.offer, OFFER_SNAPSHOT_FIELDS)
    : null;
  return {
    connected: payload.connected === true,
    estado: typeof payload.estado === "string" ? payload.estado : "busy",
    connectedMinutes:
      typeof payload.connectedMinutes === "number" ? payload.connectedMinutes : 0,
    // La posición la aporta el GPS; la del servidor sería una foto vieja.
    location: null,
    orders,
    offer,
    inService: payload.inService === true,
    sessionValid: payload.sessionValid === true,
    aceptaNuevasOfertas: payload.aceptaNuevasOfertas !== false,
  };
}

/**
 * ¿El estado guardado representa trabajo activo? Un pedido en curso o una
 * oferta en pantalla. «Disponible» o «desconectado» no se restauran.
 */
export function hasActiveWork(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as { orders?: unknown; offer?: unknown };
  const orders = Array.isArray(candidate.orders) ? candidate.orders.length : 0;
  return orders > 0 || Boolean(candidate.offer);
}

/** Solo se persiste lo que tiene sentido restaurar. */
export function shouldPersistDriverState(payload: unknown): boolean {
  return hasActiveWork(payload);
}

/** Serializa el snapshot. Devuelve null si el payload no es persistible. */
export function encodeDriverStateSnapshot(
  payload: unknown,
  nowMs: number,
  ownerId: string | null = null
): string | null {
  const sanitized = sanitizeDriverStateForSnapshot(payload);
  if (sanitized == null) return null;
  const envelope: SnapshotEnvelope = {
    version: SNAPSHOT_VERSION,
    savedAt: nowMs,
    owner: ownerId ?? null,
    payload: sanitized,
  };
  try {
    return JSON.stringify(envelope);
  } catch {
    return null;
  }
}

/**
 * Decodifica y valida un snapshot. Cualquier anomalía (JSON roto, versión
 * desconocida, forma inválida, reloj adelantado, TTL vencido, sin trabajo
 * activo) devuelve un estado distinto de `ok`; el llamador simplemente no
 * restaura nada.
 */
export function decodeDriverStateSnapshot<T>(
  raw: string | null | undefined,
  nowMs: number,
  ttlMs: number = DRIVER_STATE_SNAPSHOT_TTL_MS,
  ownerId: string | null = null
): SnapshotRead<T> {
  if (raw == null || raw === "") return { status: "empty" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "corrupt" };
  }

  if (!parsed || typeof parsed !== "object") return { status: "invalid" };
  const envelope = parsed as Partial<SnapshotEnvelope>;
  if (envelope.version !== SNAPSHOT_VERSION) return { status: "invalid" };
  if (typeof envelope.savedAt !== "number" || !Number.isFinite(envelope.savedAt)) {
    return { status: "invalid" };
  }
  if (envelope.savedAt - nowMs > MAX_CLOCK_SKEW_MS) return { status: "invalid" };

  const age = nowMs - envelope.savedAt;
  if (age > ttlMs) return { status: "expired" };

  // Atribución: si sabemos quién es el usuario actual, el snapshot debe ser
  // suyo. Un sobre sin dueño solo se acepta cuando el dueño actual tampoco
  // se conoce (Clerk aún resolviendo).
  const snapshotOwner = typeof envelope.owner === "string" ? envelope.owner : null;
  if (ownerId && snapshotOwner !== ownerId) return { status: "foreign" };

  const sanitized = sanitizeDriverStateForSnapshot(envelope.payload);
  if (sanitized == null) return { status: "invalid" };

  return { status: "ok", payload: sanitized as T, savedAt: envelope.savedAt };
}

/** Lee el snapshot del storage dado (null si no hay storage disponible). */
export function readDriverStateSnapshot<T>(
  storage: StorageLike | null,
  nowMs: number,
  ttlMs: number = DRIVER_STATE_SNAPSHOT_TTL_MS,
  ownerId: string | null = null
): SnapshotRead<T> {
  if (!storage) return { status: "empty" };
  let raw: string | null = null;
  try {
    raw = storage.getItem(DRIVER_STATE_SNAPSHOT_KEY);
  } catch {
    return { status: "empty" };
  }
  const read = decodeDriverStateSnapshot<T>(raw, nowMs, ttlMs, ownerId);
  // Cambio de usuario: el snapshot ajeno se borra en el acto (Fase 10, punto 2).
  if (read.status === "foreign") clearDriverStateSnapshot(storage);
  return read;
}

/**
 * Guarda el snapshot. Devuelve `false` si no se pudo (cuota llena, modo
 * privado, storage ausente): en ese caso la navegación funciona igual, solo
 * que una recarga sin red no tendrá pedido que restaurar.
 */
export function writeDriverStateSnapshot(
  storage: StorageLike | null,
  payload: unknown,
  nowMs: number,
  ownerId: string | null = null
): boolean {
  if (!storage) return false;
  const raw = encodeDriverStateSnapshot(payload, nowMs, ownerId);
  if (raw == null) return false;
  try {
    storage.setItem(DRIVER_STATE_SNAPSHOT_KEY, raw);
    return true;
  } catch {
    // Cuota llena: liberar la entrada propia y reintentar UNA vez. Si sigue
    // fallando se abandona en silencio (nunca rompe la navegación).
    try {
      storage.removeItem(DRIVER_STATE_SNAPSHOT_KEY);
      storage.setItem(DRIVER_STATE_SNAPSHOT_KEY, raw);
      return true;
    } catch {
      return false;
    }
  }
}

/** Borra el snapshot (tramo cerrado, sin trabajo activo, cancelación). */
export function clearDriverStateSnapshot(storage: StorageLike | null): void {
  if (!storage) return;
  try {
    storage.removeItem(DRIVER_STATE_SNAPSHOT_KEY);
  } catch {
    /* nada que hacer */
  }
}

/**
 * `localStorage` del navegador o null. Safari en modo privado puede lanzar al
 * acceder; aquí solo se comprueba su existencia.
 */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}
