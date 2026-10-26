import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_RELEASE_CONFLICT_RETRIES,
  releaseOrderFromDriverCore,
} from "./dispatch-release.ts";
import { classifyReleaseState } from "./dispatch-validation.ts";

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

const order = (over = {}) => ({
  _id: "o1",
  _rev: "rev-1",
  orderNumber: "ORD-001",
  orderType: "delivery",
  orderStatus: "pending",
  paymentStatus: "paid",
  paymentMethod: "stripe",
  dispatchStatus: "accepted",
  driverId: "d1",
  ...over,
});

const driver = (over = {}) => ({ _id: "d1", telefono: "5214427958919", ...over });

/** Error de Sanity idéntico al documentRevisionIDDoesNotMatchError real. */
function revisionConflict(currentRevision, expectedRevision, documentId = "d1") {
  const error = new Error(
    `Mutation failed: Document "${documentId}" has unexpected revision ID\n` +
      `currentRevisionID: ${currentRevision}\n` +
      `expectedRevisionID: ${expectedRevision}\n` +
      `type: documentRevisionIDDoesNotMatchError`
  );
  error.statusCode = 409;
  return error;
}

function makeDeps(over = {}) {
  const calls = {
    fetchOrder: 0,
    fetchDriver: 0,
    fetchRemainingCount: 0,
    commitRelease: 0,
    afterCommit: 0,
    logs: [],
  };
  const base = {
    fetchOrder: async () => {
      calls.fetchOrder++;
      return order();
    },
    fetchDriver: async () => {
      calls.fetchDriver++;
      return driver();
    },
    fetchRemainingCount: async () => {
      calls.fetchRemainingCount++;
      return 0;
    },
    commitRelease: async () => {
      calls.commitRelease++;
    },
    afterCommit: async () => {
      calls.afterCommit++;
    },
    log: (tag, payload) => {
      calls.logs.push({ tag, payload });
    },
  };
  const deps = { ...base, ...over };
  // Acceso conveniente a contadores y logs desde el objeto de dependencias.
  deps.calls = calls;
  deps.logs = calls.logs;
  return deps;
}

// ──────────────────────────────────────────────────────────────────────
// classifyReleaseState (puro)
// ──────────────────────────────────────────────────────────────────────

test("classifyReleaseState: pedido inexistente", () => {
  assert.equal(classifyReleaseState(null, "d1").kind, "order_missing");
});

test("classifyReleaseState: pedido sin repartidor = ya liberado (idempotente)", () => {
  assert.equal(classifyReleaseState(order({ driverId: null }), "d1").kind, "already_released");
});

test("classifyReleaseState: pedido asignado a OTRO repartidor = no liberar", () => {
  const outcome = classifyReleaseState(order({ driverId: "d-otro" }), "d1");
  assert.equal(outcome.kind, "assigned_to_other");
});

test("classifyReleaseState: pedido terminado asignado a mí = no liberar", () => {
  for (const orderStatus of ["delivered", "completed", "cancelled"]) {
    assert.equal(classifyReleaseState(order({ orderStatus }), "d1").kind, "terminal");
  }
});

test("classifyReleaseState: pedido asignado a mí y activo = liberar", () => {
  assert.equal(classifyReleaseState(order(), "d1").kind, "assigned_to_me");
});

// ──────────────────────────────────────────────────────────────────────
// releaseOrderFromDriverCore
// ──────────────────────────────────────────────────────────────────────

test("RELEASE: liberación normal commitea una vez y ejecuta efectos secundarios una vez", async () => {
  const deps = makeDeps();
  const result = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);
  assert.deepEqual(result, { ok: true });
  assert.equal(deps.calls.commitRelease, 1);
  assert.equal(deps.calls.afterCommit, 1);
  assert.ok(deps.logs.some((entry) => entry.tag === "RELEASE_ATTEMPT"));
  assert.ok(deps.logs.some((entry) => entry.tag === "RELEASE_SUCCESS"));
});

test("RELEASE: primer intento 409 → segundo intento exitoso con revisión fresca", async () => {
  let fetchCalls = 0;
  let commitCalls = 0;
  const committedRevisions = [];
  const deps = makeDeps({
    fetchOrder: async () => {
      fetchCalls++;
      // Primera lectura con rev-1; tras el conflicto Sanity ya tiene rev-2.
      return order({ _rev: fetchCalls === 1 ? "rev-1" : "rev-2" });
    },
    commitRelease: async ({ order: targetOrder }) => {
      commitCalls++;
      committedRevisions.push(targetOrder._rev);
      if (commitCalls === 1) throw revisionConflict("rev-2", "rev-1");
    },
  });

  const result = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);

  assert.deepEqual(result, { ok: true });
  assert.equal(commitCalls, 2);
  // El segundo commit usó la revisión FRESCA (rev-2), nunca la obsoleta.
  assert.deepEqual(committedRevisions, ["rev-1", "rev-2"]);
  assert.ok(deps.logs.some((entry) => entry.tag === "RELEASE_CONFLICT"));
  assert.ok(deps.logs.some((entry) => entry.tag === "RELEASE_SUCCESS"));
});

test("RELEASE: varios 409 consecutivos → error de conflicto sin efectos secundarios", async () => {
  let fetchCalls = 0;
  let commitCalls = 0;
  const deps = makeDeps({
    fetchOrder: async () => {
      fetchCalls++;
      return order({ _rev: "rev-2" });
    },
    commitRelease: async () => {
      commitCalls++;
      throw revisionConflict("rev-3", "rev-2");
    },
  });

  const result = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);

  assert.equal(result.ok, false);
  assert.equal(result.code, "conflict");
  // MAX intentos + 1 lectura final para decidir por el estado real.
  assert.equal(commitCalls, MAX_RELEASE_CONFLICT_RETRIES);
  assert.equal(fetchCalls, MAX_RELEASE_CONFLICT_RETRIES + 1);
  assert.equal(deps.calls.afterCommit, 0);
  assert.equal(deps.calls.logs.filter((entry) => entry.tag === "RELEASE_CONFLICT").length, MAX_RELEASE_CONFLICT_RETRIES);
});

test("RELEASE: documento ya liberado → éxito idempotente sin commit ni efectos", async () => {
  const deps = makeDeps({
    fetchOrder: async () => order({ driverId: null }),
  });
  const result = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);

  assert.deepEqual(result, { ok: true, idempotent: true });
  assert.equal(deps.calls.commitRelease, 0);
  assert.equal(deps.calls.afterCommit, 0);
  assert.ok(deps.logs.some((entry) => entry.tag === "RELEASE_IDEMPOTENT"));
});

test("RELEASE: documento asignado a OTRO repartidor → error y no toca nada", async () => {
  const deps = makeDeps({
    fetchOrder: async () => order({ driverId: "d-otro" }),
  });
  const result = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);

  assert.equal(result.ok, false);
  assert.ok(result.error.includes("no está asignado"));
  assert.equal(deps.calls.commitRelease, 0);
  assert.equal(deps.calls.afterCommit, 0);
});

test("RELEASE: doble liberación concurrente → una sola liberación, sin duplicar efectos", async () => {
  let released = false;
  let commitCalls = 0;
  let afterCommitCalls = 0;
  const deps = makeDeps({
    fetchOrder: async () => (released ? order({ driverId: null }) : order()),
    commitRelease: async () => {
      commitCalls++;
      released = true;
    },
    afterCommit: async () => {
      afterCommitCalls++;
    },
  });

  const first = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);
  const second = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);

  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true, idempotent: true });
  assert.equal(commitCalls, 1); // solo la primera liberó
  assert.equal(afterCommitCalls, 1); // efectos secundarios exactamente una vez
});

test("RELEASE: tras 409 final el pedido quedó liberado → éxito idempotente recuperado", async () => {
  // El commit siempre falla con 409, pero en la lectura final el pedido ya no
  // tiene repartidor (otro proceso lo liberó): el resultado es idempotente.
  let fetchCalls = 0;
  const deps = makeDeps({
    fetchOrder: async () => {
      fetchCalls++;
      return fetchCalls <= MAX_RELEASE_CONFLICT_RETRIES ? order() : order({ driverId: null });
    },
    commitRelease: async () => {
      throw revisionConflict("rev-2", "rev-1");
    },
  });

  const result = await releaseOrderFromDriverCore({ orderId: "o1", driverId: "d1" }, deps);

  assert.deepEqual(result, { ok: true, idempotent: true });
  assert.equal(deps.calls.afterCommit, 0);
  assert.ok(deps.logs.some((entry) => entry.tag === "RELEASE_RECOVERED_IDEMPOTENT"));
});
