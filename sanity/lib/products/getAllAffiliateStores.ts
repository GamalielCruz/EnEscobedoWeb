import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

function cleanStoreText(value?: string | null) {
    return value
        ?.replace(/[\u200B-\u200D\uFEFF\u2060\uFE00-\uFE0F\uE000-\uF8FF\uFFF0-\uFFFF]/g, "")
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
        .trim();
}

export const getAllAffiliateStores = async () => {
    const ALL_STORES_QUERY = defineQuery(`
        *[_type == "affiliateStore" && isActive == true] | order(coalesce(homepageOrder, 2147483647) asc, name asc) {
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
            isOpen,
            manualOperationalStatus,
            highDemandMode,
            promotionalMessages,
            capacity,
            averageDeliveryTime,
            deliveryFee,
            deliveryTimeMin,
            deliveryTimeMax,
            serviceTypes
        }
    `);

    try {
        const stores = await sanityFetch({
            query: ALL_STORES_QUERY,
        });

        console.log('Stores from Sanity:', JSON.stringify(stores.data?.map((s: any) => ({
            name: s.name,
            storeCategories: s.storeCategories
        })), null, 2));

        return (stores.data || []).map((store: any) => ({
            ...store,
            name: cleanStoreText(store.name),
            address: store.address
                ? {
                    ...store.address,
                    street: cleanStoreText(store.address.street),
                    city: cleanStoreText(store.address.city),
                    state: cleanStoreText(store.address.state),
                    postalCode: cleanStoreText(store.address.postalCode),
                    country: cleanStoreText(store.address.country),
                }
                : store.address,
        }));
    } catch (error) {
        console.log("Error fetching all affiliate stores: ", error);
        return [];
    }
};
