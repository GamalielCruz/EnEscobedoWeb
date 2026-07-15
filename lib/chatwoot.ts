const HIDDEN_ROUTES = [
  "/dashboard",
  "/sign-in",
  "/sign-up",
  "/admin",
  "/click-collect-orders",
  "/pending-products",
  "/test",
  "/studio",
  "/access-denied",
  "/draft-mode",
  "/api",
] as const;

export function isChatwootHiddenRoute(pathname: string) {
  return HIDDEN_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function getChatwootConfig() {
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
