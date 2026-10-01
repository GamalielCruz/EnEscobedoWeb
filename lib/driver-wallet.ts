// ────────────────────────────────────────────────────────────────────
// WALLET DEL REPARTIDOR — agregación PURA (sin I/O) sobre pedidos.
//
// Filosofía (igual que el resto de Drive): el saldo NO se guarda, se
// DERIVA de los pedidos. Cada pedido ya trae `driverPayout` = la parte
// del repartidor con el porcentaje de ElMenu YA descontado (ver
// lib/order-pricing.ts → computeFinancials: deliveryBaseFee × tasa de
// payout; en mandados, polygonPrice). Aquí solo sumamos.
//
// Regla de negocio v1: un servicio se cuenta como GANADO cuando el
// pedido quedó ENTREGADO (status "delivered", con deliveredAt). Los
// pedidos cancelled/refunded nunca cuentan. `settlementStatus`
// "settled" marca lo YA PAGADO (retirado/liquidado); el resto del
// total ganado es "disponible" para retiro. Nota: para pagos en
// efectivo la conciliación real es neta (el driver recogió el total y
// ElMenu le debe solo su fee); eso se resuelve en el settlement — la
// vista muestra siempre su fee por servicio.
//
// Este módulo es PURO para poder probarse con
// `node --experimental-strip-types --test`.
// ────────────────────────────────────────────────────────────────────

export type WalletOrderInput = {
  orderNumber: string;
  /** Fecha de ENTREGA (deliveredAt). Si falta, el pedido no cuenta. */
  deliveredAt?: string | null;
  orderDate?: string | null;
  serviceKind?: string | null;
  storeName?: string | null;
  destLabel?: string | null;
  /** Parte del repartidor (porcentaje de ElMenu ya descontado). */
  driverPayout?: number | null;
  settlementStatus?: string | null;
  orderStatus?: string | null;
  status?: string | null;
};

export type WalletDeliveryDTO = {
  orderNumber: string;
  /** Folio corto mostrado al repartidor (6 dígitos). */
  folio: string;
  /** ISO de la entrega. */
  deliveredAt: string;
  serviceKind: "restaurant" | "mandado";
  /** Punto de recogida (tienda) o inicio del mandado. */
  placeLabel: string;
  /** Ganancia neta del repartidor por este servicio (MXN). */
  payout: number;
  /** true ⇔ ya liquidado/pagado (settlementStatus "settled"). */
  settled: boolean;
};

export type WalletSummary = {
  /** Ganancias del día (hora de México), entregas completadas. */
  today: number;
  /** Servicios completados hoy. */
  todayCount: number;
  /** Ganancias de los últimos 7 días. */
  week: number;
  /** Total histórico ganado (entregado, no cancelado/reembolsado). */
  totalEarned: number;
  /** Parte del total ya liquidada (settlementStatus "settled"). */
  totalSettled: number;
  /** totalEarned − totalSettled: disponible para retiro. */
  available: number;
};

export type DriverWallet = {
  summary: WalletSummary;
  deliveries: WalletDeliveryDTO[];
};

function money(value: number): number {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

/** Folio corto (misma regla que shortOrderCode del Dispatch Center). */
function shortFolio(orderNumber: string): string {
  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET;
  for (let i = 0; i < orderNumber.length; i++) {
    hash ^= orderNumber.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  hash = hash >>> 0;
  return String(100_000 + (hash % 900_000));
}

function isDelivered(order: WalletOrderInput): boolean {
  if (order.orderStatus === "cancelled" || order.status === "cancelled") return false;
  if (order.orderStatus === "refunded" || order.settlementStatus === "refunded") return false;
  if (!order.deliveredAt) return false;
  return Number.isFinite(new Date(order.deliveredAt).getTime());
}

/**
 * Agrega las ganancias del repartidor. `todayKey` es la fecha (YYYY-MM-DD,
 * hora de México) contra la que se calcula "hoy"; `weekStartMs` el inicio
 * (ms epoch) de la ventana de 7 días.
 */
export function buildDriverWallet(
  orders: WalletOrderInput[],
  todayKey: string,
  weekStartMs: number
): DriverWallet {
  const dayStartMs = new Date(`${todayKey}T00:00:00-06:00`).getTime();
  const dayEndMs = dayStartMs + 24 * 60 * 60 * 1000;

  const summary: WalletSummary = {
    today: 0,
    todayCount: 0,
    week: 0,
    totalEarned: 0,
    totalSettled: 0,
    available: 0,
  };
  const deliveries: WalletDeliveryDTO[] = [];

  for (const order of orders) {
    if (!isDelivered(order)) continue;
    const payout = money(order.driverPayout ?? 0);
    const deliveredMs = new Date(order.deliveredAt!).getTime();
    const settled = order.settlementStatus === "settled";

    summary.totalEarned = money(summary.totalEarned + payout);
    if (settled) summary.totalSettled = money(summary.totalSettled + payout);
    if (deliveredMs >= weekStartMs) summary.week = money(summary.week + payout);
    if (deliveredMs >= dayStartMs && deliveredMs < dayEndMs) {
      summary.today = money(summary.today + payout);
      summary.todayCount += 1;
    }

    deliveries.push({
      orderNumber: order.orderNumber,
      folio: shortFolio(order.orderNumber),
      deliveredAt: order.deliveredAt!,
      serviceKind: order.serviceKind === "mandado" ? "mandado" : "restaurant",
      placeLabel:
        (order.storeName || "").trim() ||
        (order.destLabel || "").trim() ||
        "Servicio",
      payout,
      settled,
    });
  }

  summary.available = money(summary.totalEarned - summary.totalSettled);
  deliveries.sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));

  return { summary, deliveries };
}
