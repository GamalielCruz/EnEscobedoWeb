import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  parseChatwootWebhookBody,
  processChatwootMessage,
  verifyChatwootSignature,
} from "./webhook.ts";

const incomingEvent = {
  accountId: 1,
  content: "¿A qué hora cierran?",
  contentType: "text",
  conversationId: 22,
  conversationStatus: "open",
  messageId: "101",
  messageType: "incoming",
  private: false,
  senderType: "Contact",
};

function createDependencies(overrides = {}) {
  const state = {
    addedLabels: 0,
    completed: 0,
    markedHuman: 0,
    released: 0,
    replies: 0,
    tickets: 0,
  };
  const claimed = new Set();

  return {
    state,
    dependencies: {
      addLabels: async () => {
        state.addedLabels += 1;
      },
      claim: async (messageId) => {
        if (claimed.has(messageId)) return false;
        claimed.add(messageId);
        return true;
      },
      classify: () => ({
        category: "business_hours",
        confidence: "high",
        matchedRule: "business_hours",
      }),
      complete: async () => {
        state.completed += 1;
      },
      createTicket: async () => {
        state.tickets += 1;
      },
      getConversation: async () => ({ labels: [], messages: [], status: "open" }),
      getOperationalResponse: async () => undefined,
      getResponse: (classification) =>
        classification.category === "unknown"
          ? undefined
          : "Respuesta fija",
      markHuman: async () => {
        state.markedHuman += 1;
      },
      release: async () => {
        state.released += 1;
      },
      sendReply: async () => {
        state.replies += 1;
      },
      wasRecentlyReplied: async () => false,
      ...overrides,
    },
  };
}

test("verifies the current Chatwoot HMAC signature and rejects stale requests", () => {
  const rawBody = JSON.stringify({ event: "message_created" });
  const secret = "test-secret";
  const now = 1_700_000_000_000;
  const timestamp = String(now / 1000);
  const signature = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;

  assert.equal(
    verifyChatwootSignature({ now, rawBody, secret, signature, timestamp }),
    true,
  );
  assert.equal(
    verifyChatwootSignature({
      now,
      rawBody,
      secret,
      signature,
      timestamp: String(Number(timestamp) - 301),
    }),
    false,
  );
});

test("parses message_created and ignores unknown events", () => {
  assert.equal(
    parseChatwootWebhookBody({ event: "conversation_updated" }).kind,
    "ignored",
  );
  const parsed = parseChatwootWebhookBody({
    event: "message_created",
    id: 101,
    content: "Hola",
    message_type: "incoming",
    private: false,
    conversation: { id: 22, status: "open" },
    sender: { type: "contact" },
  });
  assert.equal(parsed.kind, "message");
  assert.equal(parsed.kind === "message" && parsed.event.conversationId, 22);
});

test("ignores outgoing messages, private notes, and the bot's own replies", async () => {
  for (const event of [
    { ...incomingEvent, messageType: "outgoing" },
    { ...incomingEvent, private: true },
    { ...incomingEvent, messageType: 1, senderType: "User" },
  ]) {
    const { dependencies, state } = createDependencies();
    const result = await processChatwootMessage(event, dependencies);
    assert.equal(result.outcome, "ignored");
    assert.equal(state.replies, 0);
  }
});

test("answers one recognized FAQ and labels it", async () => {
  const { dependencies, state } = createDependencies();
  const result = await processChatwootMessage(incomingEvent, dependencies);

  assert.equal(result.outcome, "auto_replied");
  assert.equal(state.replies, 1);
  assert.equal(state.addedLabels, 1);
  assert.equal(state.completed, 1);
});

test("does not process the same message id twice", async () => {
  const { dependencies, state } = createDependencies();
  await processChatwootMessage(incomingEvent, dependencies);
  const duplicate = await processChatwootMessage(incomingEvent, dependencies);

  assert.equal(duplicate.outcome, "duplicate");
  assert.equal(state.replies, 1);
});

test("escalates sensitive cases and sends only a neutral acknowledgement", async () => {
  const { dependencies, state } = createDependencies({
    classify: () => ({
      category: "sensitive_case",
      confidence: "high",
      matchedRule: "refund_or_conflict",
    }),
  });
  const result = await processChatwootMessage(
    { ...incomingEvent, content: "Quiero un reembolso" },
    dependencies,
  );

  assert.equal(result.outcome, "escalated");
  assert.equal(state.markedHuman, 1);
  assert.equal(state.replies, 1);
  assert.equal(state.tickets, 1);
});

test("answers an operational query with the authenticated customer's order", async () => {
  const { dependencies, state } = createDependencies({
    classify: () => ({ category: "operational_query", confidence: "high" }),
    getOperationalResponse: async () =>
      "Tu pedido #123 está en preparación.",
  });
  const result = await processChatwootMessage(
    { ...incomingEvent, content: "¿Dónde está mi pedido?" },
    dependencies,
  );

  assert.equal(result.outcome, "auto_replied");
  assert.equal(state.markedHuman, 0);
  assert.equal(state.replies, 1);
  assert.equal(state.addedLabels, 1);
});

test("transfers a repeated or unresolved order query to Operations", async () => {
  for (const overrides of [
    { getOperationalResponse: async () => undefined },
    {
      getOperationalResponse: async () => "Estado encontrado",
      wasRecentlyReplied: async () => true,
    },
  ]) {
    const { dependencies, state } = createDependencies({
      classify: () => ({ category: "operational_query", confidence: "high" }),
      ...overrides,
    });
    const result = await processChatwootMessage(
      { ...incomingEvent, content: "¿Dónde está mi pedido?" },
      dependencies,
    );

    assert.equal(result.outcome, "escalated");
    assert.equal(state.markedHuman, 1);
    assert.equal(state.replies, 1);
    assert.equal(state.tickets, 1);
  }
});

test("does not reply to unknown text, recent categories, or after an agent intervened", async () => {
  const unknown = createDependencies({
    classify: () => ({ category: "unknown", confidence: "low" }),
  });
  assert.equal(
    (await processChatwootMessage(incomingEvent, unknown.dependencies)).outcome,
    "ignored",
  );
  assert.equal(unknown.state.replies, 0);

  const recent = createDependencies({ wasRecentlyReplied: async () => true });
  await processChatwootMessage(incomingEvent, recent.dependencies);
  assert.equal(recent.state.replies, 0);

  const intervened = createDependencies({
    getConversation: async () => ({
      labels: [],
      status: "open",
      messages: [{ message_type: "outgoing", sender_type: "User" }],
    }),
  });
  await processChatwootMessage(incomingEvent, intervened.dependencies);
  assert.equal(intervened.state.replies, 0);
});

test("contains dependency errors and releases an unsent receipt for retry", async () => {
  const { dependencies, state } = createDependencies({
    sendReply: async () => {
      throw new Error("internal detail that must not escape");
    },
  });
  const result = await processChatwootMessage(incomingEvent, dependencies);

  assert.deepEqual(result, { outcome: "error", reason: "Error" });
  assert.equal(state.released, 1);
});
