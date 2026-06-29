import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function buildProductUrl(slug: string): string {
  return buildStoreProductUrl("", slug, true);
}

export function buildStoreProductUrl(
  storeId: string,
  productSlug: string,
  fallbackToProductRoute = false
): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.pixelaplastico.com/";
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanStoreId = storeId.replace(/^\/+|\/+$/g, "");
  const cleanProductSlug = productSlug.replace(/^\/+|\/+$/g, "");

  if (cleanStoreId) {
    return `${cleanBaseUrl}/store/${cleanStoreId}?product=${encodeURIComponent(cleanProductSlug)}`;
  }

  if (fallbackToProductRoute) {
    return `${cleanBaseUrl}/product/${cleanProductSlug}`;
  }

  return `${cleanBaseUrl}/store?product=${encodeURIComponent(cleanProductSlug)}`;
}
