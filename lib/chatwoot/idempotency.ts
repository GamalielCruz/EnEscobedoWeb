import "server-only";

import { backendClient } from "@/sanity/lib/backendClient";

const receiptId = (messageId: string) =>
  `chatwoot-message-${messageId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96)}`;

const isConflict = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  (error as { statusCode?: number }).statusCode === 409;

export async function claimChatwootMessage(
  messageId: string,
  conversationId: number,
) {
  try {
    await backendClient.create({
      _id: receiptId(messageId),
      _type: "chatwootWebhookReceipt",
      messageId,
      conversationId,
      status: "processing",
      receivedAt: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    if (isConflict(error)) return false;
    throw error;
  }
}

export async function completeChatwootMessage(
  messageId: string,
  result: {
    autoReplied: boolean;
    category: string;
    outcome: string;
  },
) {
  await backendClient
    .patch(receiptId(messageId))
    .set({
      ...result,
      status: "completed",
      processedAt: new Date().toISOString(),
    })
    .commit();
}

export async function releaseChatwootMessage(messageId: string) {
  await backendClient.delete(receiptId(messageId));
}

export async function wasCategoryRecentlyReplied(
  conversationId: number,
  category: string,
) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const existingId = await backendClient.fetch<string | null>(
    `*[
      _type == "chatwootWebhookReceipt" &&
      conversationId == $conversationId &&
      category == $category &&
      autoReplied == true &&
      processedAt > $since
    ][0]._id`,
    { category, conversationId, since },
  );

  return Boolean(existingId);
}
