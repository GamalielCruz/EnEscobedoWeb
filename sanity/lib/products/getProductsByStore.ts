import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

export const getProductsByStore = async (storeId: string, categorySlug?: string) => {
  const PRODUCTS_BY_STORE_QUERY = defineQuery(`
    *[_type == "product" && affiliateStore._ref == $storeId] | order(name asc) {
      _id,
      _createdAt,
      name,
      slug,
      image,
      price,
      stock,
      description,
      categories[]->{
        _id,
        title,
        slug
      },
      affiliateStore->{
        _id,
        name,
        categories,
        averageDeliveryTime,
        deliveryFee,
        deliveryTimeMin,
        deliveryTimeMax
      }
    }
  `);

  try {
    const products = await sanityFetch({
      query: PRODUCTS_BY_STORE_QUERY,
      params: { storeId },
    });

    return products.data || [];
  } catch (error) {
    console.error("Error fetching products by store:", error);
    return [];
  }
};
