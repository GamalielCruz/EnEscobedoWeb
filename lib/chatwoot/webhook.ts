import { createHmac, timingSafeEqual } from "node:crypto";

type SupportClassification = {
  category: string;
  confidence: "high" | "medium" | "low";
  matchedRule?: string;
};

export type ChatwootMessageCreated = {
  accountId?: number;
  content: string;
  contentType?: string;
  conversationId: number;
  conversationStatus?: string;
  createdAt?: number | string;
  messageId: string;
  messageType: string | number;
  private: boolean;
  senderType?: string;
};

export type ChatwootConversationContext = {
  labels: string[];
  messages: Array<{
    content_attributes?: Record<string, unknown>;
    message_type?: string | number;
    sender?: { type?: string };
    sender_type?: string;
  }>;
  status?: string;
};

type ProcessingOutcome =
  | "auto_replied"
  | "duplicate"
  | "error"
  | "escalated"
  | "ignored";

export type ChatwootProcessingResult = {
  category?: string;
  outcome: ProcessingOutcome;
  reason?: string;
};

type ChatwootProcessingDependencies = {
  addLabels: (
    conversationId: number,
    labels: string[],
    currentLabels: string[],
  ) => Promise<void>;
  claim: (messageId: string, conversationId: number) => Promise<boolean>;
  classify: (message: string) => SupportClassification;
  complete: (
    messageId: string,
    result: { autoReplied: boolean; category: string; outcome: string },
  ) => Promise<void>;
  getConversation: (conversationId: number) => Promise<ChatwootConversationContext>;
  getResponse: (classification: SupportClassification) => string | undefined;
  markHuman: (
    conversationId: number,
    category: string,
    currentLabels: string[],
  ) => Promise<void>;
  release: (messageId: string) => Promise<void>;
  sendReply: (
    conversationId: number,
    content: string,
    category: string,
  ) => Promise<void>;
  wasRecentlyReplied: (conversationId: number, category: string) => Promise<boolean>;
};

type ParseResult =
  | { kind: "ignored"; reason: "unsupported_event" }
  | { kind: "invalid" }
  | { event: ChatwootMessageCreated; kind: "message" };

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;

const asPositiveInteger = (value: unknown) => {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isSafeInteger(number) && number > 0
    ? number
    : undefined;
};

export function parseChatwootWebhookBody(body: unknown): ParseResult {
  const payload = asRecord(body);
  if (!payload || typeof payload.event !== "string") return { kind: "invalid" };
  if (payload.event !== "message_created") {
    return { kind: "ignored", reason: "unsupported_event" };
  }

  const conversation = asRecord(payload.conversation);
  const sender = asRecord(payload.sender);
  const account = asRecord(payload.account);
  const conversationId = asPositiveInteger(conversation?.id);
  const messageId =
    typeof payload.id === "string" || typeof payload.id === "number"
      ? String(payload.id)
      : "";

  if (!messageId || !conversationId) return { kind: "invalid" };

  return {
    kind: "message",
    event: {
      accountId: asPositiveInteger(account?.id),
      content: typeof payload.content === "string" ? payload.content : "",
      contentType:
        typeof payload.content_type === "string" ? payload.content_type : undefined,
      conversationId,
      conversationStatus:
        typeof conversation?.status === "string" ? conversation.status : undefined,
      createdAt:
        typeof payload.created_at === "string" ||
        typeof payload.created_at === "number"
          ? payload.created_at
          : undefined,
      messageId,
      messageType:
        typeof payload.message_type === "string" ||
        typeof payload.message_type === "number"
          ? payload.message_type
          : "",
      private: payload.private === true,
      senderType:
        typeof payload.sender_type === "string"
          ? payload.sender_type
          : typeof sender?.type === "string"
            ? sender.type
            : undefined,
    },
  };
}

export function verifyChatwootSignature({
  now = Date.now(),
  rawBody,
  secret,
  signature,
  timestamp,
}: {
  now?: number;
  rawBody: string;
  secret: string;
  signature: string | null;
  timestamp: string | null;
}) {
  if (!signature || !timestamp || !/^\d+$/.test(timestamp)) return false;

  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (age > 300) return false;

  const expected = `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signature);

  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export function getIneligibleMessageReason(event: ChatwootMessageCreated) {
  if (event.messageType !== "incoming" && event.messageType !== 0) return "not_incoming";
  if (event.private) return "private_message";
  if (!event.content.trim()) return "empty_message";
  if (event.contentType && event.contentType !== "text") return "unsupported_content";
  if (event.senderType && event.senderType.toLowerCase() !== "contact") {
    return "not_contact";
  }
}

export function hasHumanAgentIntervened(
  messages: ChatwootConversationContext["messages"],
) {
  return messages.some((message) => {
    const outgoing =
      message.message_type === "outgoing" || message.message_type === 1;
    const senderType = message.sender_type ?? message.sender?.type;
    return (
      outgoing &&
      senderType?.toLowerCase() === "user" &&
      message.content_attributes?.elmenu_automatic !== true
    );
  });
}

export function shouldAutoReply({
  agentIntervened,
  hasResponse,
  recentlyReplied,
  status,
}: {
  agentIntervened: boolean;
  hasResponse: boolean;
  recentlyReplied: boolean;
  status?: string;
}) {
  return (
    status !== "resolved" &&
    status !== "closed" &&
    !agentIntervened &&
    !recentlyReplied &&
    hasResponse
  );
}

const ESCALATION_CATEGORIES = new Set([
  "human_support",
  "operational_query",
  "sensitive_case",
]);

export async function processChatwootMessage(
  event: ChatwootMessageCreated,
  dependencies: ChatwootProcessingDependencies,
): Promise<ChatwootProcessingResult> {
  const ineligibleReason = getIneligibleMessageReason(event);
  if (ineligibleReason) return { outcome: "ignored", reason: ineligibleReason };

  let claimed = false;
  let replied = false;
  let category = "unknown";

  try {
    claimed = await dependencies.claim(event.messageId, event.conversationId);
    if (!claimed) return { outcome: "duplicate" };

    const classification = dependencies.classify(event.content);
    category = classification.category;
    const conversation = await dependencies.getConversation(event.conversationId);
    const status = conversation.status ?? event.conversationStatus;
    const agentIntervened = hasHumanAgentIntervened(conversation.messages);

    if (status === "resolved" || status === "closed" || agentIntervened) {
      const reason = agentIntervened ? "agent_intervened" : "conversation_closed";
      await dependencies.complete(event.messageId, {
        autoReplied: false,
        category,
        outcome: reason,
      });
      return { category, outcome: "ignored", reason };
    }

    if (category === "unknown") {
      await dependencies.complete(event.messageId, {
        autoReplied: false,
        category,
        outcome: "unknown",
      });
      return { category, outcome: "ignored", reason: "unknown" };
    }

    const recentlyReplied = await dependencies.wasRecentlyReplied(
      event.conversationId,
      category,
    );
    const response = dependencies.getResponse(classification);
    const escalation = ESCALATION_CATEGORIES.has(category);

    if (escalation) {
      await dependencies.markHuman(
        event.conversationId,
        category,
        conversation.labels,
      );
    }

    const autoReply = shouldAutoReply({
      agentIntervened,
      hasResponse: Boolean(response) && category !== "operational_query",
      recentlyReplied,
      status,
    });

    if (autoReply && response) {
      await dependencies.sendReply(event.conversationId, response, category);
      replied = true;
    }

    if (!escalation && autoReply) {
      await dependencies.addLabels(
        event.conversationId,
        ["faq_respondida", "respuesta_automatica"],
        conversation.labels,
      );
    }

    const outcome = escalation ? "escalated" : autoReply ? "auto_replied" : "ignored";
    await dependencies.complete(event.messageId, {
      autoReplied: replied,
      category,
      outcome,
    });

    return {
      category,
      outcome,
      reason: recentlyReplied ? "recent_category" : undefined,
    };
  } catch (error) {
    if (claimed) {
      if (replied) {
        await dependencies
          .complete(event.messageId, {
            autoReplied: true,
            category,
            outcome: "partial_error",
          })
          .catch(() => undefined);
      } else {
        await dependencies.release(event.messageId).catch(() => undefined);
      }
    }
    return {
      outcome: "error",
      reason: error instanceof Error ? error.name : "UnknownError",
    };
  }
}
