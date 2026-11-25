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
// pedidos cancelled/refunded nunca cuentan.
//
// QUIÉN TIENE EL DINERO (esto decide qué está "disponible"):
//  - EFECTIVO RECIBIDO POR EL REPARTIDOR (`cashCollectedBy` =
//    community_driver | store_driver): el repartidor cobró el total al
//    cliente y ya tiene su parte en la mano; ElMenu NO le debe su fee. Se
//    cuenta como YA PAGADO (y no entra en "disponible").
//  - PAGO EN LÍNEA/TARJETA (stripe, card_at_store…): el dinero entró a
//    ElMenu, así que el fee del repartidor queda PENDIENTE y es lo que se
//    acumula en la billetera para pagarle.
//  - EFECTIVO COBRADO POR LA TIENDA (`cashCollectedBy` = "store"): el
//    repartidor no recibió nada → su fee queda pendiente.
//  - `settlementStatus` "settled" siempre cuenta como pagado (liquidación
//    formal, por transferencia o por conciliación de efectivo).
//
// Mismo criterio que el panel de finanzas (lib/admin-finance.ts separa
// `driverCollectedCash` de `storeCollectedCash`): aquí solo cambia que el
// wallet del repartidor muestra SU fee, no el total cobrado.
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
  /** Cómo paga el cliente (cash_on_delivery | cash_at_store | stripe…). */
  paymentMethod?: string | null;
  /**
   * Quién recibió el EFECTIVO físicamente. Valores del esquema de la orden:
   * "store" | "community_driver" | "store_driver" | "admin" | "none".
   */
  cashCollectedBy?: string | null;
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
  /**
   * true ⇔ este dinero YA está resuelto a favor del repartidor: lo cobró en
   * efectivo (lo tiene en la mano) o el servicio ya fue liquidado.
   */
  settled: boolean;
  /** true ⇔ el repartidor cobró el EFECTIVO de este servicio. */
  paidInCash: boolean;
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
  /**
   * Parte del total YA en manos del repartidor: efectivo que cobró él mismo o
   * servicios liquidados (settlementStatus "settled").
   */
  totalSettled: number;
  /** totalEarned − totalSettled: lo que ElMenu todavía le debe. */
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

/** Cobros en efectivo que dejan el dinero EN MANOS DEL REPARTIDOR. */
const CASH_COLLECTED_BY_DRIVER = new Set(["community_driver", "store_driver"]);

/**
 * ¿El repartidor ya tiene su parte en la mano por haber cobrado el efectivo?
 *
 * Legado sin `cashCollectedBy` (pedidos anteriores al campo): un cobro contra
 * entrega lo recibe físicamente quien entrega, así que se asume el repartidor.
 * Es seguro porque `resolveCashCollectedBy` (lib/payment.ts) mapea
 * cash_on_delivery → community_driver/store_driver, nunca "store".
 */
function isPayoutInDriverHands(order: WalletOrderInput): boolean {
  const collectedBy = String(order.cashCollectedBy ?? "");
  if (CASH_COLLECTED_BY_DRIVER.has(collectedBy)) return true;
  return (
    collectedBy === "" && String(order.paymentMethod ?? "") === "cash_on_delivery"
  );
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
    const paidInCash = isPayoutInDriverHands(order);
    const settled = paidInCash || order.settlementStatus === "settled";

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
      paidInCash,
    });
  }

  summary.available = money(summary.totalEarned - summary.totalSettled);
  deliveries.sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));

  return { summary, deliveries };
}
