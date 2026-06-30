import { defineQuery } from "next-sanity";
import { SanityImageSource } from "@sanity/image-url/lib/types/types";
import { sanityFetch } from "../live";

export type PromoBannerType = "promotion" | "announcement" | "info" | "featured" | "warning" | "event";

export type PromoBannerStore = {
  _id: string;
  name?: string;
  image?: SanityImageSource | null;
};

export type PromoBannerSale = {
  _id: string;
  title?: string;
  description?: string;
  discountAmount?: number;
  couponCode?: string;
};

export type PromoBannerItem = {
  _id: string;
  title?: string;
  description?: string;
  bannerType?: PromoBannerType;
  mainColor?: string;
  desktopImage?: SanityImageSource | null;
  mobileImage?: SanityImageSource | null;
  sortOrder?: number;
  displayDurationSeconds?: number;
  ctaText?: string;
  ctaLink?: string;
  affiliateStore?: PromoBannerStore | null;
  sale?: PromoBannerSale | null;
};

const ACTIVE_PROMO_BANNERS_QUERY = defineQuery(`
  *[
    _type == "promoBanner"
    && isActive == true
    && (!defined(validFrom) || validFrom <= now())
    && (!defined(validUntil) || validUntil >= now())
  ] | order(sortOrder asc, _createdAt desc) {
    _id,
    title,
    description,
    bannerType,
    mainColor,
    desktopImage,
    mobileImage,
    sortOrder,
    displayDurationSeconds,
    ctaText,
    ctaLink,
    affiliateStore-> {
      _id,
      name,
      image
    },

    "sale": select(
      defined(sale)
      && sale->isActive == true
      && (!defined(sale->validFrom) || sale->validFrom <= now())
      && (!defined(sale->validUntil) || sale->validUntil >= now()) => sale->{
        _id,
        title,
        description,
        discountAmount,
        couponCode
      },
      null
    )
  }
`);

export async function getActivePromoBanners(): Promise<PromoBannerItem[]> {
  try {
    const result = await sanityFetch({
      query: ACTIVE_PROMO_BANNERS_QUERY,
    });

    return Array.isArray(result.data) ? result.data : [];
  } catch (error) {
    console.error("Error fetching active promo banners:", error);
    return [];
  }
}
