import assert from "node:assert/strict";
import test from "node:test";

import { classifySupportMessageWithAi } from "./classify-support-message.ts";

test("uses deterministic rules before AI and AI only for short unknown messages", async () => {
  const failIfCalled = async () => {
    throw new Error("AI should not be called");
  };

  assert.equal(
    (await classifySupportMessageWithAi("Hola", failIfCalled)).category,
    "greeting",
  );
  assert.equal(
    (
      await classifySupportMessageWithAi(
        "¿Hay servicio en Santa Rosa?",
        async () => "coverage",
      )
    ).category,
    "coverage",
  );
  assert.equal(
    (await classifySupportMessageWithAi("x".repeat(1_001), failIfCalled)).category,
    "unknown",
  );
});
