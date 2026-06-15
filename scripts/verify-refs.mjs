import { createClient } from "@sanity/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

const storeId = "a36a9d33-ee5f-4b17-bedf-40a715577c01";
const productId = "68f32988-af5c-449e-9887-a7fc2763d288";

const store = await client.fetch(`*[_id == $id][0]{_id, _type, name}`, { id: storeId });
const product = await client.fetch(`*[_id == $id][0]{_id, _type, name, price}`, { id: productId });

console.log("affiliateStore ref:", JSON.stringify(store));
console.log("product ref:", JSON.stringify(product));
