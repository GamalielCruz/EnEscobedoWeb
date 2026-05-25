import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

export const getAllAffiliateStores = async () => {
    const ALL_STORES_QUERY = defineQuery(`
        *[_type == "affiliateStore" && isActive == true] | order(name asc) {
            _id,
            _type,
            _createdAt,
            _updatedAt,
            _rev,
            name,
            storeId,
            image,
            coverImage,
            storeCategories[]->{
                _id,
                title,
                slug,
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
                }
            },
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
        const stores = await sanityFetch({
            query: ALL_STORES_QUERY,
        });

        // Debug: ver qué categorías tienen las tiendas
        console.log('Stores from Sanity:', JSON.stringify(stores.data?.map((s: any) => ({
            name: s.name,
            storeCategories: s.storeCategories
        })), null, 2));

        return stores.data || [];
    } catch (error) {
        console.log("Error fetching all affiliate stores: ", error);
        return [];
    }
};

