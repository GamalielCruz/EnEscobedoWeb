import "server-only";

import { createHmac } from "node:crypto";
import { backendClient } from "@/sanity/lib/backendClient";
import { legalVersions } from "@/lib/legal-config";

function limitedIpHash(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const secret = process.env.LEGAL_AUDIT_SECRET || process.env.DELIVERY_PIN_SECRET;
  return ip && secret ? createHmac("sha256", secret).update(ip).digest("hex") : undefined;
}

export async function recordCurrentLegalAcceptance(request: Request, userId: string, source: string, role = "customer") {
  const acceptedAt = new Date().toISOString();
  const userAgentSummary = request.headers.get("user-agent")?.slice(0, 160);
  const ipHashOrLimitedIp = limitedIpHash(request);
  const documents = [
    ["customer_terms", legalVersions.customerTerms],
    ["privacy", legalVersions.privacy],
    ["cancellations", legalVersions.cancellations],
  ] as const;

  await Promise.all(documents.map(([documentType, documentVersion]) => backendClient.createIfNotExists({
    _id: `legalAcceptance.${userId}.${documentType}.${documentVersion}`.replace(/[^a-zA-Z0-9._-]/g, "-"),
    _type: "legalAcceptance",
    documentType,
    documentVersion,
    acceptedAt,
    userId,
    role,
    acceptanceSource: source,
    ipHashOrLimitedIp,
    userAgentSummary,
  })));
}
