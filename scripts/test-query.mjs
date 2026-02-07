import { createClient } from "next-sanity";

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  apiVersion: "2024-07-25",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

console.log("Testing query to find pending/rejected requests...");

try {
  const query = `*[_type == "productUpdateRequest" && (status == 'pending' || status == 'rejected')]{ _id, status, product->{name}, submittedAt }`;
  const items = await client.fetch(query);

  console.log("Query result:", JSON.stringify(items, null, 2));
  console.log("Total items found:", items.length);
} catch (e) {
  console.error("Error:", e);
  process.exit(1);
}
