import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { buildUrl } from "@/lib/urls"

const INVISIBLE_UNICODE =
  /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0\u{E0000}-\u{E007F}]/gu

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizeText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFC").replace(INVISIBLE_UNICODE, "").replace(/\s+/g, " ").trim()
    : ""
}

export function portableTextToPlainText(value: unknown): string {
  if (typeof value === "string") return sanitizeText(value)
  if (!Array.isArray(value)) return ""

  return sanitizeText(
    value
      .filter((block) => block && typeof block === "object" && "_type" in block && block._type === "block")
      .flatMap((block) => {
        const children: unknown[] =
          "children" in block && Array.isArray(block.children) ? block.children : []
        return children.map((child: unknown) =>
          child && typeof child === "object" && "text" in child ? child.text : ""
        )
      })
      .join(" ")
  )
}

export function buildProductUrl(slug: string): string {
  return buildStoreProductUrl("", slug, true);
}

export function buildStoreProductUrl(
  storeId: string,
  productSlug: string,
  fallbackToProductRoute = false
): string {
  const cleanStoreId = storeId.replace(/^\/+|\/+$/g, "");
  const cleanProductSlug = productSlug.replace(/^\/+|\/+$/g, "");

  if (cleanStoreId) {
    return buildUrl(`/store/${cleanStoreId}?product=${encodeURIComponent(cleanProductSlug)}`);
  }

  if (fallbackToProductRoute) {
    return buildUrl(`/product/${cleanProductSlug}`);
  }

  return buildUrl(`/store?product=${encodeURIComponent(cleanProductSlug)}`);
}
