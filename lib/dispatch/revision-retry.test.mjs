import assert from "node:assert/strict";
import test from "node:test";
import { commitWithRevisionRetry } from "./revision-retry.ts";

/** Error tal como lo lanza el cliente de Sanity en un conflicto de revisión. */
function revisionConflict(current, expected) {
  return Object.assign(
    new Error(
      `Document "order-1" is already in the revision ${current} (expectedRevisionID: ${expected})`
    ),
    { statusCode: 409 }
  );
}

test("sin conflicto: un solo commit, sin relectura", async () => {
  let reads = 0;
  const result = await commitWithRevisionRetry({
    initial: { _rev: "r1" },
    refresh: async () => {
      reads += 1;
      return { _rev: "r2" };
    },
    commit: async () => {},
  });
  assert.deepEqual(result, { ok: true, attempts: 1 });
  assert.equal(reads, 0);
});

test("conflicto de revisión: relee y reintenta con la revisión VIGENTE", async () => {
  const seen = [];
  let reads = 0;
  const result = await commitWithRevisionRetry({
    initial: { _rev: "r1" },
    refresh: async () => {
      reads += 1;
      return { _rev: "r2" };
    },
    commit: async (doc) => {
      seen.push(String(doc._rev));
      if (doc._rev !== "r2") throw revisionConflict("r2", String(doc._rev));
    },
  });
  assert.deepEqual(result, { ok: true, attempts: 2 });
  assert.deepEqual(seen, ["r1", "r2"]); // el 2º intento usa la revisión fresca
  assert.equal(reads, 1);
});

test("conflictos consecutivos: se agota y devuelve ok:false (nunca un 500 mudo)", async () => {
  const conflicts = [];
  const result = await commitWithRevisionRetry({
    initial: { _rev: "r1" },
    attempts: 3,
    refresh: async () => ({ _rev: "r2" }), // la relectura ya no ayuda
    commit: async () => {
      throw revisionConflict("r9", "r2");
    },
    onConflict: (_error, attempt) => conflicts.push(attempt),
  });
  assert.equal(result.ok, false);
  assert.deepEqual(conflicts, [1, 2, 3]);
});

test("error que NO es conflicto de revisión: se propaga sin reintentar", async () => {
  let commits = 0;
  await assert.rejects(
    () =>
      commitWithRevisionRetry({
        initial: { _rev: "r1" },
        refresh: async () => ({ _rev: "r2" }),
        commit: async () => {
          commits += 1;
          throw Object.assign(new Error("sin permisos"), { statusCode: 403 });
        },
      }),
    /sin permisos/
  );
  assert.equal(commits, 1);
});

test("refresh que lanza (pedido reasignado): no se reintenta con datos inválidos", async () => {
  let commits = 0;
  await assert.rejects(
    () =>
      commitWithRevisionRetry({
        initial: { _rev: "r1" },
        refresh: async () => {
          throw new Error("El pedido ya no está asignado a ti");
        },
        commit: async () => {
          commits += 1;
          throw revisionConflict("r2", "r1");
        },
      }),
    /ya no está asignado/
  );
  assert.equal(commits, 1);
});
