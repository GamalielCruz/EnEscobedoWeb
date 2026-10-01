import assert from "node:assert/strict";
import test from "node:test";
import { buildDriverWallet } from "./driver-wallet.ts";

const TODAY_KEY = "2026-09-30";
// 7 días antes del inicio de hoy (hora de México).
const WEEK_START_MS =
  new Date(`${TODAY_KEY}T00:00:00-06:00`).getTime() - 7 * 24 * 60 * 60 * 1000;

const base = {
  orderNumber: "ord-1",
  serviceKind: "restaurant",
  storeName: "Pizzería Don Gallo",
  driverPayout: 40,
  settlementStatus: "pending",
};

function order(overrides = {}) {
  return {
    ...base,
    deliveredAt: "2026-09-30T13:00:00-06:00",
    ...overrides,
  };
}

test("Solo cuentan servicios ENTREGADOS: pending/cancelled/refunded quedan fuera", () => {
  const wallet = buildDriverWallet(
    [
      // Sin deliveredAt (en curso) → no cuenta.
      order({ orderNumber: "a", deliveredAt: null }),
      // Cancelado → no cuenta.
      order({ orderNumber: "b", orderStatus: "cancelled" }),
      // Reembolsado → no cuenta.
      order({ orderNumber: "c", settlementStatus: "refunded" }),
      // Entregado → cuenta.
      order({ orderNumber: "d" }),
    ],
    TODAY_KEY,
    WEEK_START_MS
  );
  assert.equal(wallet.deliveries.length, 1);
  assert.equal(wallet.summary.totalEarned, 40);
  assert.equal(wallet.summary.today, 40);
  assert.equal(wallet.summary.todayCount, 1);
});

test("El driverPayout YA trae el porcentaje de ElMenu descontado: se suma tal cual", () => {
  // 44.55 = fee del repartidor tras descontar el porcentaje; el wallet NO
  // vuelve a deducir nada.
  const wallet = buildDriverWallet(
    [order({ orderNumber: "x", driverPayout: 44.55 })],
    TODAY_KEY,
    WEEK_START_MS
  );
  assert.equal(wallet.summary.totalEarned, 44.55);
  assert.equal(wallet.summary.available, 44.55);
});

test("Hoy / semana / total se agregan por fecha de ENTREGA", () => {
  const wallet = buildDriverWallet(
    [
      order({ orderNumber: "hoy", driverPayout: 30 }),
      order({ orderNumber: "ayer", driverPayout: 20, deliveredAt: "2026-09-29T10:00:00-06:00" }),
      order({ orderNumber: "viejo", driverPayout: 50, deliveredAt: "2026-09-15T10:00:00-06:00" }),
      // Entregado ayer pero con fecha de creación hoy: NO cuenta como hoy.
      order({
        orderNumber: "crea-hoy-entrega-ayer",
        driverPayout: 99,
        deliveredAt: "2026-09-29T23:59:00-06:00",
      }),
    ],
    TODAY_KEY,
    WEEK_START_MS
  );
  assert.equal(wallet.summary.today, 30);
  assert.equal(wallet.summary.todayCount, 1);
  // hoy 30 + ayer 20 + 23:59 (dentro de la semana) = 149; el viejo no.
  assert.equal(wallet.summary.week, 149);
  assert.equal(wallet.summary.totalEarned, 199);
});

test("Disponible = total ganado − ya liquidado (settled)", () => {
  const wallet = buildDriverWallet(
    [
      order({ orderNumber: "pagado", driverPayout: 40, settlementStatus: "settled" }),
      order({ orderNumber: "por-pagar", driverPayout: 25, settlementStatus: "ready" }),
      order({ orderNumber: "otro", driverPayout: 35.5, settlementStatus: "pending" }),
    ],
    TODAY_KEY,
    WEEK_START_MS
  );
  assert.equal(wallet.summary.totalEarned, 100.5);
  assert.equal(wallet.summary.totalSettled, 40);
  assert.equal(wallet.summary.available, 60.5);
});

test("Entregas ordenadas por fecha DESC y folio corto estable (6 dígitos)", () => {
  const wallet = buildDriverWallet(
    [
      order({ orderNumber: "b-antiguo", deliveredAt: "2026-09-30T09:00:00-06:00" }),
      order({ orderNumber: "a-reciente", deliveredAt: "2026-09-30T14:00:00-06:00" }),
    ],
    TODAY_KEY,
    WEEK_START_MS
  );
  assert.equal(wallet.deliveries[0].orderNumber, "a-reciente");
  assert.equal(wallet.deliveries[1].orderNumber, "b-antiguo");
  for (const d of wallet.deliveries) {
    assert.match(d.folio, /^\d{6}$/);
  }
  const again = buildDriverWallet(
    [
      order({ orderNumber: "b-antiguo", deliveredAt: "2026-09-30T09:00:00-06:00" }),
      order({ orderNumber: "a-reciente", deliveredAt: "2026-09-30T14:00:00-06:00" }),
    ],
    TODAY_KEY,
    WEEK_START_MS
  );
  assert.deepEqual(wallet.deliveries, again.deliveries);
});
