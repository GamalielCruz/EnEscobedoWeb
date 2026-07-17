import { defineQuery } from "next-sanity";
import { client } from "../client";

export async function getMyOrders(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // Define the query to get unified orders
  const MY_ORDERS_QUERY = defineQuery(`
    *[_type == "order" && clerkUserId == $userId] | order(orderDate desc) {
      ...,
      "isClickCollect": orderType == "pickup",
      "storeInfo": select(
        orderType == "pickup" => {
          "storeName": pickupStore->name,
          "storeAddress": pickupStore->address.street,
          "storePhone": pickupStore->contact.phone
        }
      ),
      products[]{
        ...,
        product->
      }
    }
 `);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await client.fetch(MY_ORDERS_QUERY, { userId }, { useCdn: false, cache: "no-store" });
    } catch (error) {
      console.error("Error fetching orders: ", error);
      if (attempt === 2) return [];
    }
  }

  return [];
}

