import { defineQuery } from "next-sanity";
import type { Product } from "@/sanity.types";
import { sanityFetch } from "../live";

export const getAllProducts = async (): Promise<Product[]> => {
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
        const products = await sanityFetch<Product[]>({
            query: ALL_PRODUCTS_QUERY,
        });

        return products.data || [];
    } catch (error) {
        console.error("Error fetching All Products: ", error);
        return [];
    }
};
