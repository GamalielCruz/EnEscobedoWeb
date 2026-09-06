import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";
import { client } from "../client";
import { sanitizeText } from "@/lib/utils";
import { getCommercialSettings } from "@/lib/commercial-config";
import { resolveEffectiveCommercialConditions } from "@/lib/commercial-rules";

export const getStoreById = async (storeId: string) => {
  const STORE_BY_ID_QUERY = defineQuery(`
    *[_type == "affiliateStore" && _id == $storeId][0] {
      _id,
      name,
      slug,
      storeId,
      image,
      coverImage,
      categories,
      address,
      coordinates,
      contact,
      operatingHours,
      isActive,
      isOpen,
      manualOperationalStatus,
      highDemandMode,
      commercialPlanId,
      commercialOverrides,
      commercialReviewRequired,
      commercialPlanStartedAt,
      capacity,
      averageDeliveryTime,
      deliveryFee,
      deliveryTimeMin,
      deliveryTimeMax,
      scheduledOrdersEnabled,
      minimumPreparationMinutes,
      scheduledOrderIntervalMinutes,
      maximumScheduledDays,
      lastDeliveryOrderMinutesBeforeClose,
      lastPickupOrderMinutesBeforeClose,
      serviceTypes
    }
  `);

  // Primary: sanityFetch (supports live updates)
  try {
    const store = await sanityFetch({
      query: STORE_BY_ID_QUERY,
      params: { storeId },
    });

    if (!store.data) return null;

    const commercial = resolveEffectiveCommercialConditions(store.data, await getCommercialSettings());

    return {
      ...store.data,
      premiumBadgeEnabled: commercial.premiumBadgeEnabled,
      commercial,
      name: sanitizeText(store.data.name),
      address: store.data.address
        ? {
            ...store.data.address,
            street: sanitizeText(store.data.address.street),
            city: sanitizeText(store.data.address.city),
            state: sanitizeText(store.data.address.state),
            postalCode: sanitizeText(store.data.address.postalCode),
            country: sanitizeText(store.data.address.country),
          }
        : store.data.address,
    };
  } catch (liveError) {
    console.error("[getStoreById] sanityFetch failed, trying client.fetch fallback:", liveError);
  }

  // Fallback: direct client fetch (no live, but reliable)
  try {
    const data = await client.fetch(STORE_BY_ID_QUERY, { storeId });

    if (!data) return null;

    let commercial: ReturnType<typeof resolveEffectiveCommercialConditions>;
    try {
      commercial = resolveEffectiveCommercialConditions(data, await getCommercialSettings());
    } catch {
      commercial = resolveEffectiveCommercialConditions(data, null);
    }

    return {
      ...data,
      premiumBadgeEnabled: commercial.premiumBadgeEnabled,
      commercial,
      name: sanitizeText(data.name),
      address: data.address
        ? {
            ...data.address,
            street: sanitizeText(data.address.street),
            city: sanitizeText(data.address.city),
            state: sanitizeText(data.address.state),
            postalCode: sanitizeText(data.address.postalCode),
            country: sanitizeText(data.address.country),
          }
        : data.address,
    };
  } catch (clientError) {
    console.error("[getStoreById] client.fetch also failed:", clientError);
    return null;
  }
};
