import { defineQuery } from "next-sanity";
import { sanityFetch } from "../live";

export async function getMyOrders(userId: string) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // Define the query to get both regular orders and click & collect orders
  const MY_ORDERS_QUERY = defineQuery(`
    *[(_type == "order" || _type == "clickCollectOrder") && (clerkUserId == $userId || customerInfo.clerkUserId == $userId)] | order(coalesce(orderDate, createdAt) desc) {
      ...,
      // For regular orders
      _type == "order" => {
        ...,
        products[]{
          ...,
          product->
        }
      },
      // For click & collect orders
      _type == "clickCollectOrder" => {
        ...,
        "orderDate": createdAt,
        "totalPrice": totalAmount,
        "currency": "mxn",
        "customerName": customerInfo.name,
        "email": customerInfo.email,
        "phone": customerInfo.phone,
        "clerkUserId": customerInfo.clerkUserId,
        "products": items[]{
          "quantity": quantity,
          "product": {
            "_id": productId,
            "name": productName,
            "price": price
          }
        },
        "isClickCollect": true,
        "pickupCode": pickupCode,
        "storeInfo": storeInfo
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
