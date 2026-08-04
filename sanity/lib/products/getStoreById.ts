import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";
import { client } from "../client";
import { sanitizeText } from "@/lib/utils";
import { getCommercialSettings } from "@/lib/commercial-config";
import { resolveEffectiveCommercialConditions } from "@/lib/commercial-rules";

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildStoreResult(data: Record<string, any> & { _id: string }, commercial: ReturnType<typeof resolveEffectiveCommercialConditions>) {
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
}

export const getStoreById = async (storeId: string) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let storeData: (Record<string, any> & { _id: string }) | null = null;

  // Primary: sanityFetch (live updates)
  try {
    const store = await sanityFetch({
      query: STORE_BY_ID_QUERY,
      params: { storeId },
    });
    storeData = store.data ?? null;
  } catch (liveError) {
    console.error("[getStoreById] sanityFetch failed, falling back to client.fetch:", liveError);
  }

  // Fallback: direct client fetch (no live, but reliable)
  if (!storeData) {
    try {
      storeData = await client.fetch(STORE_BY_ID_QUERY, { storeId });
    } catch (clientError) {
      console.error("[getStoreById] client.fetch also failed:", clientError);
      return null;
    }
  }

  if (!storeData) return null;

  try {
    const commercial = resolveEffectiveCommercialConditions(storeData as Parameters<typeof resolveEffectiveCommercialConditions>[0], await getCommercialSettings());
    return buildStoreResult(storeData, commercial);
  } catch (error) {
    console.error("[getStoreById] commercial resolution failed:", error);
    // Return store without commercial data rather than null
    const commercial = resolveEffectiveCommercialConditions(storeData as Parameters<typeof resolveEffectiveCommercialConditions>[0], null);
    return buildStoreResult(storeData, commercial);
  }
};
