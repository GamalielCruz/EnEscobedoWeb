import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

export const searchProductsByName = async (searchParam: string) => {
    // Soft delete publico: solo productos aprobados y no ocultos; docs viejos sin isVisible siguen visibles.
    const PRODUCT_SEARCH_QUERY = defineQuery(`
     *[
        _type == "product"
        && name match $searchParam
        && approvalStatus == "approved"
        && isVisible != false
     ] | order(name asc)
    {
      ...,
      affiliateStore->{ _id, name }
    }
    `);

    try {
        const products = await sanityFetch({
            query: PRODUCT_SEARCH_QUERY,
            params: {
                searchParam: `${searchParam}`,
            },
        });

        return products.data || [];
    } catch(error) {
        console.log("Error fetching products by name:", error);
        return [];
    }
};
