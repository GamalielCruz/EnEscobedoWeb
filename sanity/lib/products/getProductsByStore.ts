import { defineQuery } from "next-sanity";

import { orderProducts } from "@/lib/product-order";

import { sanityFetch } from "../live";

const PRODUCTS_BY_STORE_QUERY = defineQuery(`
  *[
    _type == "product" &&
    affiliateStore._ref == $storeId &&
    approvalStatus == "approved" &&
    isVisible != false
  ] | order(name asc) {
    _id,
    _createdAt,
    name,
    slug,
    image,
    price,
    stock,
    approvalStatus,
    isVisible,
    description,
    categories[]->{
      _id,
      title,
      slug
    },
    optionGroups,
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

const STORE_PRODUCT_ORDER_QUERY = defineQuery(`
  *[_type == "affiliateStore" && _id == $storeId][0]{
    "all": productOrder[]._ref,
    "categories": categoryProductOrders[]{
      "categoryId": category._ref,
      "productIds": products[]._ref
    }
  }
`);

type StoreProductOrdering = {
  all?: string[];
  categories?: Array<{ categoryId?: string; productIds?: string[] }>;
};

export const getProductsByStore = async (storeId: string) => {
  try {
    const [productsResult, orderingResult] = await Promise.all([
      sanityFetch({
        query: PRODUCTS_BY_STORE_QUERY,
        params: { storeId },
      }),
      sanityFetch({
        query: STORE_PRODUCT_ORDER_QUERY,
        params: { storeId },
      }),
    ]);
    const ordering = orderingResult.data as StoreProductOrdering | null;
    const categoryProductOrders = Object.fromEntries(
      (ordering?.categories ?? [])
        .filter((entry) => entry.categoryId)
        .map((entry) => [entry.categoryId as string, entry.productIds ?? []])
    );

    return {
      products: orderProducts(productsResult.data || [], ordering?.all ?? []),
      categoryProductOrders,
    };
  } catch (error) {
    console.error("Error fetching products by store:", error);
    return { products: [], categoryProductOrders: {} };
  }
};
