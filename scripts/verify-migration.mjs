import { createClient } from "@sanity/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const client = createClient({
  projectId: "t93gr28n",
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

const migrated = await client.fetch(
  `*[_type == "order" && _id in path("cc-migrated-*")]{
    _id, orderNumber, orderType, status, pickupStatus, pickupCode, totalPrice,
    "store": pickupStore->name, "products": products[]{ "name": product->name, quantity, notes }
  } | order(orderNumber asc)`
);
console.log("Migrated orders:", JSON.stringify(migrated, null, 2));
console.log("\nTotal migrated:", migrated.length);
