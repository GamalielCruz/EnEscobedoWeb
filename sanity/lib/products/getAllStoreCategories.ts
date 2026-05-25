import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

export const getAllStoreCategories = async () => {
  const ALL_STORE_CATEGORIES_QUERY = defineQuery(`
    *[_type == "storeCategory"] | order(order asc, title asc) {
      _id,
      title,
      slug,
      description,
      icon {
        type,
        emoji,
        image {
          asset->{
            _id,
            url
          },
          alt
        }
      },
      order
    }
  `);

  try {
    const categories = await sanityFetch({
      query: ALL_STORE_CATEGORIES_QUERY,
    });

    return categories.data || [];
  } catch (error) {
    console.error("Error fetching store categories:", error);
    return [];
  }
};
