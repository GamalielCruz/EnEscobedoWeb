const URL_ERROR = "debe ser una URL absoluta con protocolo http o https";

export function getPublicBaseUrl(): string {
  const candidates = [
    ["NEXT_PUBLIC_APP_URL", process.env.NEXT_PUBLIC_APP_URL],
    ["NEXT_PUBLIC_BASE_URL", process.env.NEXT_PUBLIC_BASE_URL],
    ["NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL],
    ["VERCEL_URL", process.env.VERCEL_URL],
  ] as const;

  for (const [name, value] of candidates) {
    const configuredUrl = value?.trim();
    if (!configuredUrl) continue;

    const hasProtocol = /^[a-z][a-z\d+.-]*:/i.test(configuredUrl);
    const absoluteUrl = name === "VERCEL_URL" && !hasProtocol
      ? `https://${configuredUrl}`
      : configuredUrl;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(absoluteUrl);
    } catch {
      throw new Error(`${name} ${URL_ERROR}`);
    }

    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error(`${name} ${URL_ERROR}`);
    }

    return parsedUrl.toString().replace(/\/+$/, "");
  }

  return "http://localhost:3000";
}

/**
 * Build a full URL from a path
 */
export function buildUrl(path: string): string {
  const baseUrl = getPublicBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
