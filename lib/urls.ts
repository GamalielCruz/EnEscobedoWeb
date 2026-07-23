/**
 * Utility functions for handling URLs consistently across the application
 */
import { getDeploymentEnvironment } from "./deployment-environment";

/**
 * Get the public base URL for the application
 * This should be used for external redirects, webhooks, and public-facing URLs
 */
export function getPublicUrl(): string {
  // Priority order:
  // 1. NEXT_PUBLIC_SITE_URL (explicit public URL)
  // 2. NEXT_PUBLIC_BASE_URL (fallback)
  // 3. Environment-specific defaults
  
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_BASE_URL;
  const environment = getDeploymentEnvironment();

  const invalidProductionUrl =
    environment === "production" &&
    Boolean(
      configuredUrl?.includes("en-escobedo-web.vercel.app") ||
      configuredUrl?.includes("localhost")
    );

  if (environment === "production" && configuredUrl && !invalidProductionUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  if (environment === "production") {
    return "https://elmenu.site";
  }

  if (environment === "preview") {
    const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL;
    if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  }

  return "http://localhost:3000";
}

/**
 * Get the internal URL for server-side operations
 * This can use VERCEL_URL for internal Vercel operations
 */
export function getInternalUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  return getPublicUrl();
}

/**
 * Build a full URL from a path
 */
export function buildUrl(path: string, usePublic: boolean = true): string {
  const baseUrl = usePublic ? getPublicUrl() : getInternalUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${cleanPath}`;
}
