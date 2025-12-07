import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

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
      capacity,
      averageDeliveryTime,
      deliveryFee,
      deliveryTimeMin,
      deliveryTimeMax
    }
  `);

  try {
    const store = await sanityFetch({
      query: STORE_BY_ID_QUERY,
      params: { storeId },
    });

    return store.data || null;
  } catch (error) {
    console.error("Error fetching store by ID:", error);
    return null;
  }
};
