// ────────────────────────────────────────────────────────────────────
// Helpers de formato del Dispatch Center (puros, client-safe).
// No importan módulos de servidor para poder usarse en componentes.
// ────────────────────────────────────────────────────────────────────

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a32(input: string): number {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/**
 * Folio corto y determinista derivado del orderNumber (UUID).
 * Mismo pedido → mismo folio; el UUID completo solo se muestra en "Ver detalles".
 */
export function shortOrderCode(orderNumber?: string | null): string {
  if (!orderNumber) return "—";
  const hash = fnv1a32(String(orderNumber));
  return String(100_000 + (hash % 900_000));
}

/**
 * Dirección CORTA para superficies de conducción ("Tu ruta"): se queda con el
 * primer segmento (antes de la primera coma) y, si aún excede el presupuesto,
 * recorta en límite de palabra con elipsis. Nunca devuelve la dirección
 * completa ni el texto desbordado: la lectura debe caber en un vistazo.
 */
export function shortAddress(input?: string | null, maxLength = 28): string {
  const value = String(input ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "—";
  const firstSegment = value.split(",")[0]?.trim() || value;
  if (firstSegment.length <= maxLength) return firstSegment;
  const cut = firstSegment.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > Math.floor(maxLength / 2) ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

/** Estados terminales del ciclo de vida de una oferta (mirror de offer-lifecycle). */
const TERMINAL_OFFER_STATUSES: ReadonlySet<string> = new Set([
  "accepted",
  "rejected",
  "expired",
  "cancelled",
]);

/**
 * true ⇔ la orden tiene una oferta ACTIVA (requiere respuesta del repartidor).
 *
 * Una oferta EXPIRED / REJECTED / CANCELLED / ACCEPTED NO es una intención
 * activa de asignación: la orden vuelve a "Sin asignar" y la oferta termina
 * solo como registro histórico. Con esto, la pestaña "Ofertas" y su contador
 * dejan de contar ofertas terminadas (el estado de negocio lo corrige el
 * backend; este filtro solo refleja el estado ya corregido).
 */
export function hasActiveOffer(order: {
  dispatchStatus?: string | null;
  offerStatus?: string | null;
}): boolean {
  return order.dispatchStatus === "offered" && !TERMINAL_OFFER_STATUSES.has(order.offerStatus ?? "");
}

/**
 * Tiempo de espera legible. A partir de 24 h usa "X días Y h"
 * en lugar de "219 h 45 min".
 */
export function formatWaitingTime(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const remMinutes = m % 60;
  if (hours < 24) {
    return remMinutes === 0 ? `${hours} h` : `${hours} h ${remMinutes} min`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  const dayLabel = days === 1 ? "día" : "días";
  return remHours === 0 ? `${days} ${dayLabel}` : `${days} ${dayLabel} ${remHours} h`;
}

/** Duración compacta (sesiones de repartidor, tiempos de conexión). */
export function formatCompactDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 1) return "< 1 min";
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const remMinutes = m % 60;
  if (hours < 24) {
    return remMinutes === 0 ? `${hours} h` : `${hours} h ${remMinutes} min`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days} d` : `${days} d ${remHours} h`;
}

/**
 * ETA estimado en minutos a partir de distancia lineal (km) y velocidad
 * urbana promedio. Es un cálculo transparente sobre distancia real; si no
 * hay distancia devuelve null (la UI muestra "Sin estimar").
 */
export function estimateEtaMinutes(distanceKm: number | null | undefined, avgKmh = 25): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  return Math.max(1, Math.round((distanceKm / avgKmh) * 60));
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "—";
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return "—";
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "hace un momento";
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)} h`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}
