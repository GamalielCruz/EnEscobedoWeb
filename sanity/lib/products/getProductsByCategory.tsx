import { defineQuery } from "next-sanity";
import type { Product } from "@/sanity.types";
import { sanityFetch } from "../live";

export const getProductsByCategory = async (categorySlug: string): Promise<Product[]> => {
  const PRODUCTS_BY_CATEGORY_QUERY = defineQuery(`
        *[
            _type == "product"
            && references(*[_type == "category" && slug.current == $categorySlug]._id)
            ] | order(name asc)
        `);

  try {
    const products = await sanityFetch({
      query: PRODUCTS_BY_CATEGORY_QUERY,
      params: {
        categorySlug,
      },
    });

    return products.data || [];
  } catch (error) {
    console.log("Error fetching products by category:", error);
    return [];
  }
};
