import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

function cleanStoreText(value?: string | null) {
  return value
    ?.replace(/[\u200B-\u200D\uFEFF\u2060\uFE00-\uFE0F\uE000-\uF8FF\uFFF0-\uFFFF]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim();
}

export const getStoreById = async (storeId: string) => {
  const STORE_BY_ID_QUERY = defineQuery(`
    *[_type == "affiliateStore" && _id == $storeId][0] {
      _id,
      name,
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
      name: cleanStoreText(store.data.name),
      address: store.data.address
        ? {
            ...store.data.address,
            street: cleanStoreText(store.data.address.street),
            city: cleanStoreText(store.data.address.city),
            state: cleanStoreText(store.data.address.state),
            postalCode: cleanStoreText(store.data.address.postalCode),
            country: cleanStoreText(store.data.address.country),
          }
        : store.data.address,
    };
  } catch (error) {
    console.error("Error fetching store by ID:", error);
    return null;
  }
};
