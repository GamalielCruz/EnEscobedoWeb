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
  
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  
  // Fallback based on environment
  if (process.env.NODE_ENV === "production") {
    // In production, NEXT_PUBLIC_SITE_URL must be set in Vercel environment variables
    console.warn("NEXT_PUBLIC_SITE_URL not set in production, using NEXT_PUBLIC_APP_URL fallback");
    return process.env.NEXT_PUBLIC_APP_URL || "https://en-escobedo-web.vercel.app";
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