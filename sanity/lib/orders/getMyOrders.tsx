import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

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

 try {
  const orders = await sanityFetch({
    query: MY_ORDERS_QUERY,
    params: { userId },
  });

  return orders.data || [];
 } catch (error) {
  console.error("Error fetching orders: ", error);
  throw new Error("Error fetching orders");
 }
}
