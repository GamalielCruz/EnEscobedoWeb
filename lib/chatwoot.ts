import { isProductionDeployment } from "./deployment-environment";

export function isChatwootHiddenRoute(pathname: string) {
  return pathname !== "/";
}

export function getChatwootConfig() {
  if (!isProductionDeployment()) return null;
  const baseUrl = process.env.NEXT_PUBLIC_CHATWOOT_BASE_URL?.replace(/\/$/, "");
  const websiteToken = process.env.NEXT_PUBLIC_CHATWOOT_WEBSITE_TOKEN;

  if (!baseUrl || !websiteToken) return null;

  try {
    const url = new URL(baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  } catch {
    return null;
  }

  return { baseUrl, websiteToken };
}
