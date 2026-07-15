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

type ChatwootName = {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
};

const nameWords = (value?: string | null) =>
  value
    ?.trim()
    .split(/\s+/)
    .filter((word) => !/^(undefined|null)$/i.test(word)) ?? [];

export function formatChatwootDisplayName({
  firstName,
  lastName,
  fullName,
}: ChatwootName) {
  const firstWords = nameWords(firstName);
  const fullWords = nameWords(fullName);
  const first = (firstWords[0] ?? fullWords[0])?.replace(/\.+$/, "");

  if (!first) return "Cliente";

  const last = nameWords(lastName)[0] ?? fullWords[firstWords.length || 1];
  const initial = Array.from(last ?? "").find((character) => /\p{L}/u.test(character));

  return initial ? `${first} ${initial.toLocaleUpperCase("es-MX")}.` : first;
}

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
