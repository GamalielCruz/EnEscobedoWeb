import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function buildProductUrl(slug: string): string {
  // Use environment variable if available, otherwise fallback to production URL
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.pixelaplastico.com/";
  
  // Ensure we don't have double slashes
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  
  // Ensure slug is clean (remove any leading/trailing slashes)
  const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
  
  return `${cleanBaseUrl}/product/${cleanSlug}`;
}
