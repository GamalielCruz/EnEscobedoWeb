/**
 * Utility functions for handling URLs consistently across the application
 */

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

  if (configuredUrl && !(process.env.NODE_ENV === "production" && configuredUrl.includes("en-escobedo-web.vercel.app"))) {
    return configuredUrl.replace(/\/$/, "");
  }
  
  // Fallback based on environment
  if (process.env.NODE_ENV === "production") {
    console.warn("NEXT_PUBLIC_SITE_URL missing or deprecated in production, using canonical domain");
    return "https://elmenu.site";
  }
  
  return "http://localhost:3000";
}

/**
 * Get the internal URL for server-side operations
 * This can use VERCEL_URL for internal Vercel operations
 */
export function getInternalUrl(): string {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_URL) {
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
