import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";
import { sanitizeText } from "@/lib/utils";

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

  try {
    const store = await sanityFetch({
      query: STORE_BY_ID_QUERY,
      params: { storeId },
    });

    if (!store.data) return null;

    return {
      ...store.data,
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
  } catch (error) {
    console.error("Error fetching store by ID:", error);
    return null;
  }
};
