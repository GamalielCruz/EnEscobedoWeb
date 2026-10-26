import { sanitizeText } from "@/lib/utils";

const GENERATED_IMAGE_BASE_URL =
  "https://coreva-normal.trae.ai/api/ide/v1/text_to_image";

type ProductCategoryLike = {
  title?: string | null;
  name?: string | null;
} | null;

type RetailProductImageSize =
  | "square_hd"
  | "square"
  | "portrait_4_3"
  | "portrait_16_9"
  | "landscape_4_3"
  | "landscape_16_9";

export function getPrimaryProductCategoryName(
  categories: unknown[] | null | undefined
) {
  const firstCategory = categories?.find(
    (category) => {
      const candidate = category as ProductCategoryLike;
      return sanitizeText(candidate?.title || candidate?.name);
    }
  );

  const candidate = firstCategory as ProductCategoryLike;
  return sanitizeText(candidate?.title || candidate?.name);
}

export function getRetailProductImageUrl({
  productName,
  categoryName,
  imageSize = "square_hd",
}: {
  productName?: string | null;
  categoryName?: string | null;
  imageSize?: RetailProductImageSize;
}) {
  const cleanProductName = sanitizeText(productName) || "producto de supermercado";
  const cleanCategoryName = sanitizeText(categoryName);

  const prompt = [
    `Photorealistic studio packshot of ${cleanProductName}`,
    cleanCategoryName
      ? `Mexican supermarket product from the ${cleanCategoryName} category`
      : "Mexican supermarket retail product",
    "professional ecommerce photography",
    "centered single item",
    "front facing packaging",
    "pure white seamless background",
    "soft natural shadow",
    "high detail",
    "no people, no hands, no shelf, no props, no shopping cart, no watermark, no text overlay",
  ].join(", ");

  return `${GENERATED_IMAGE_BASE_URL}?prompt=${encodeURIComponent(prompt)}&image_size=${imageSize}`;
}
