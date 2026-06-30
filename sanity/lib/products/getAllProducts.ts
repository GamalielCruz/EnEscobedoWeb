import { defineQuery } from "next-sanity";
import type { ALL_PRODUCTS_QUERY_RESULT } from "@/sanity.types";
import { sanityFetch } from "../live";

export const getAllProducts = async (): Promise<ALL_PRODUCTS_QUERY_RESULT> => {
    const ALL_PRODUCTS_QUERY = defineQuery(`
       *[
           _type == "product"
        ] | order(name asc) {
           ...,
           affiliateStore->{
               _id,
               name,
               storeId,
               deliveryFee,
               deliveryTimeMin,
               deliveryTimeMax,
               averageDeliveryTime
           }
        }
    `);
    try {
        const products = await sanityFetch({
            query: ALL_PRODUCTS_QUERY,
        });

        return products.data || [];
    } catch (error) {
        console.error("Error fetching All Products: ", error);
        return [];
    }
};
