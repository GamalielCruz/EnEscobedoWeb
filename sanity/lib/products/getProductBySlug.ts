import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";
import { sanitizeText } from "@/lib/utils";

export const getProductBySlug = async (slug: string) => {
    // Soft delete publico: solo productos aprobados y no ocultos; docs viejos sin isVisible siguen visibles.
    const PRODUCT_BY_ID_QUERY = defineQuery(`
        *[
            _type == "product"
            && slug.current == $slug
            && approvalStatus == "approved"
            && isVisible != false
        ] | order(name asc) [0]{
          ...,
          affiliateStore->{
            _id,
            name,
            image,
            averageDeliveryTime,
            deliveryFee,
            deliveryTimeMin,
            deliveryTimeMax
          },
          optionGroups
        }
        `);

        try {
            const product = await sanityFetch({
                query: PRODUCT_BY_ID_QUERY,
                params: {
                    slug,
                },
            });

            return product.data
              ? {
                  ...product.data,
                  name: sanitizeText(product.data.name),
                  affiliateStore: product.data.affiliateStore
                    ? {
                        ...product.data.affiliateStore,
                        name: sanitizeText(product.data.affiliateStore.name),
                      }
                    : product.data.affiliateStore,
                }
              : null;
        } catch (error) {
            console.log("Error fetching product by ID:", error);
            return null;
        }
}
