import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateEtaMinutes,
  formatCompactDuration,
  formatWaitingTime,
  shortOrderCode,
} from "./dispatch-format.ts";

test("shortOrderCode es determinista y corto (nunca muestra el UUID)", () => {
  const uuid = "a4514f9b-9ba8-4f26-a9b9-a5c66fda8481";
  const code = shortOrderCode(uuid);
  assert.match(code, /^\d{6}$/);
  assert.equal(shortOrderCode(uuid), code); // determinista
  assert.notEqual(shortOrderCode("a4514f9b-9ba8-4f26-a9b9-a5c66fda8482"), code);
  assert.equal(shortOrderCode(""), "—");
  assert.equal(shortOrderCode(null), "—");
  assert.ok(code.length < uuid.length, "el folio corto debe ser más corto que el UUID");
});

test("formatWaitingTime usa días a partir de 24 h en lugar de horas gigantes", () => {
  assert.equal(formatWaitingTime(0), "< 1 min");
  assert.equal(formatWaitingTime(45), "45 min");
  assert.equal(formatWaitingTime(60), "1 h");
  assert.equal(formatWaitingTime(90), "1 h 30 min");
  assert.equal(formatWaitingTime(219 * 60 + 45), "9 días 3 h");
  assert.equal(formatWaitingTime(145 * 60 + 18), "6 días 1 h");
  assert.equal(formatWaitingTime(24 * 60), "1 día");
  assert.equal(formatWaitingTime(48 * 60 + 30), "2 días"); // 48h30m exacto → 2 días
  assert.equal(formatWaitingTime(-5), "< 1 min");
});

test("formatCompactDuration es compacto para sesiones largas", () => {
  assert.equal(formatCompactDuration(5), "5 min");
  assert.equal(formatCompactDuration(200), "3 h 20 min");
  assert.equal(formatCompactDuration(24 * 60 + 15), "1 d");
});

test("estimateEtaMinutes deriva un ETA honesto de la distancia o null", () => {
  assert.equal(estimateEtaMinutes(0), 1);
  assert.equal(estimateEtaMinutes(2.5), 6); // 2.5 km @ 25 km/h → 6 min
  assert.equal(estimateEtaMinutes(10), 24);
  assert.equal(estimateEtaMinutes(null), null);
  assert.equal(estimateEtaMinutes(undefined), null);
  assert.equal(estimateEtaMinutes(-1), null);
});
