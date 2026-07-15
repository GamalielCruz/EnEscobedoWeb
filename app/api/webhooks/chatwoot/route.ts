import { after } from "next/server";
import { NextResponse } from "next/server";

import {
  addConversationLabels,
  getChatwootConversation,
  getChatwootServerConfig,
  markConversationForHuman,
  sendChatwootMessage,
} from "@/lib/chatwoot/client";
import {
  claimChatwootMessage,
  completeChatwootMessage,
  releaseChatwootMessage,
  wasCategoryRecentlyReplied,
} from "@/lib/chatwoot/idempotency";
import {
  parseChatwootWebhookBody,
  processChatwootMessage,
  verifyChatwootSignature,
} from "@/lib/chatwoot/webhook";
import { classifySupportMessageWithAi } from "@/lib/support/classify-support-message";
import { getFixedResponse } from "@/lib/support/fixed-responses";
import { getLatestOrderStatusResponse } from "@/lib/support/order-status";
import type { SupportClassification } from "@/lib/support/support-categories";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ accepted: false }, { status: 413 });
  }

  const webhookSecret = process.env.CHATWOOT_WEBHOOK_SECRET;
  let accountId: number;

  try {
    accountId = getChatwootServerConfig().accountId;
    if (!webhookSecret) throw new Error("CHATWOOT_WEBHOOK_SECRET no configurado");
  } catch {
    console.error("[chatwoot webhook] Configuración de servidor incompleta");
    return NextResponse.json({ accepted: false }, { status: 503 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ accepted: false }, { status: 413 });
  }

  const validSignature = verifyChatwootSignature({
    rawBody,
    secret: webhookSecret,
    signature: request.headers.get("x-chatwoot-signature"),
    timestamp: request.headers.get("x-chatwoot-timestamp"),
  });

  if (!validSignature) {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }

  const parsed = parseChatwootWebhookBody(body);
  if (parsed.kind === "invalid") {
    return NextResponse.json({ accepted: false }, { status: 400 });
  }
  if (parsed.kind === "ignored") {
    return NextResponse.json({ accepted: true, ignored: true }, { status: 202 });
  }
  if (parsed.event.accountId && parsed.event.accountId !== accountId) {
    return NextResponse.json({ accepted: false }, { status: 401 });
  }

  after(async () => {
    const result = await processChatwootMessage(parsed.event, {
      addLabels: addConversationLabels,
      claim: claimChatwootMessage,
      classify: classifySupportMessageWithAi,
      complete: completeChatwootMessage,
      getConversation: getChatwootConversation,
      getOperationalResponse: (conversation) =>
        getLatestOrderStatusResponse(conversation.contactIdentifier),
      getResponse: (classification) =>
        getFixedResponse(classification as SupportClassification),
      markHuman: markConversationForHuman,
      release: releaseChatwootMessage,
      sendReply: (conversationId, content, category) =>
        sendChatwootMessage({ category, content, conversationId }),
      wasRecentlyReplied: wasCategoryRecentlyReplied,
    });

    if (result.outcome === "error") {
      console.error("[chatwoot webhook] Error de procesamiento", {
        conversationId: parsed.event.conversationId,
        errorType: result.reason,
        messageId: parsed.event.messageId,
      });
    }
  });

  return NextResponse.json({ accepted: true }, { status: 202 });
}
