import "server-only";

import { assertProductionIntegration } from "@/lib/deployment-environment";
import type { ChatwootConversationContext } from "./webhook";

type ChatwootServerConfig = {
  accountId: number;
  apiAccessToken: string;
  baseUrl: string;
  supportAgentId?: number;
  supportTeamId?: number;
};

export class ChatwootApiError extends Error {
  constructor(public readonly status: number) {
    super(`Chatwoot API respondió con HTTP ${status}`);
    this.name = "ChatwootApiError";
  }
}

const optionalPositiveInteger = (value?: string) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
};

export function getChatwootServerConfig(): ChatwootServerConfig {
  assertProductionIntegration("Chatwoot");
  const baseUrl = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, "");
  const accountId = optionalPositiveInteger(process.env.CHATWOOT_ACCOUNT_ID);
  const apiAccessToken = process.env.CHATWOOT_API_ACCESS_TOKEN;

  if (!baseUrl || !accountId || !apiAccessToken) {
    throw new Error("Configuración privada de Chatwoot incompleta");
  }

  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("CHATWOOT_BASE_URL inválida");
  }

  return {
    accountId,
    apiAccessToken,
    baseUrl,
    supportAgentId: optionalPositiveInteger(process.env.CHATWOOT_SUPPORT_AGENT_ID),
    supportTeamId: optionalPositiveInteger(process.env.CHATWOOT_SUPPORT_TEAM_ID),
  };
}

async function chatwootRequest<T>(path: string, init: RequestInit = {}) {
  const { apiAccessToken, baseUrl } = getChatwootServerConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      api_access_token: apiAccessToken,
      ...init.headers,
    },
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) throw new ChatwootApiError(response.status);
  return (await response.json()) as T;
}

const conversationPath = (conversationId: number) => {
  const { accountId } = getChatwootServerConfig();
  return `/api/v1/accounts/${accountId}/conversations/${conversationId}`;
};

export async function getChatwootConversation(conversationId: number) {
  const conversation = await chatwootRequest<ChatwootConversationContext>(
    conversationPath(conversationId),
    { method: "GET" },
  );

  return {
    contactIdentifier:
      typeof conversation.meta?.sender?.identifier === "string"
        ? conversation.meta.sender.identifier
        : undefined,
    labels: Array.isArray(conversation.labels) ? conversation.labels : [],
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    status: conversation.status,
  } satisfies ChatwootConversationContext;
}

export async function sendChatwootMessage({
  category,
  content,
  conversationId,
}: {
  category: string;
  content: string;
  conversationId: number;
}) {
  await chatwootRequest(`${conversationPath(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      message_type: "outgoing",
      private: false,
      content_type: "text",
      content_attributes: {
        elmenu_automatic: true,
        elmenu_category: category,
      },
    }),
  });
}

export async function addConversationLabels(
  conversationId: number,
  labels: string[],
  currentLabels: string[] = [],
) {
  const mergedLabels = [...new Set([...currentLabels, ...labels])];
  await chatwootRequest(`${conversationPath(conversationId)}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: mergedLabels }),
  });
}

async function assignConversation(conversationId: number) {
  const { supportAgentId, supportTeamId } = getChatwootServerConfig();
  if (!supportAgentId && !supportTeamId) return;

  await chatwootRequest(`${conversationPath(conversationId)}/assignments`, {
    method: "POST",
    body: JSON.stringify({
      ...(supportAgentId ? { assignee_id: supportAgentId } : {}),
      ...(supportTeamId ? { team_id: supportTeamId } : {}),
    }),
  });
}

export async function markConversationForHuman(
  conversationId: number,
  reason: string,
  currentLabels: string[],
) {
  const labels = {
    human_support: ["requiere_humano"],
    operational_query: ["consulta_operativa", "requiere_humano"],
    sensitive_case: ["caso_sensible", "requiere_humano"],
  }[reason] ?? ["requiere_humano"];

  await addConversationLabels(conversationId, labels, currentLabels);
  await chatwootRequest(`${conversationPath(conversationId)}/toggle_status`, {
    method: "POST",
    body: JSON.stringify({ status: "open" }),
  });

  if (reason === "sensitive_case") {
    await chatwootRequest(conversationPath(conversationId), {
      method: "PATCH",
      body: JSON.stringify({ priority: "high" }),
    });
  }

  await assignConversation(conversationId);
}
