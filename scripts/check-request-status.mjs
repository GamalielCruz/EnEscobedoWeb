import { createClient } from "next-sanity";

const client = createClient({
  projectId: "t93gr28n",
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  apiVersion: "2024-07-25",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

const requestId = process.argv[2] || "2t02yp6piNjowebjmZa8H9";

console.log(`Checking status of request: ${requestId}`);

try {
  const doc = await client.fetch(
    `*[_type == "productUpdateRequest" && _id == $id][0]{ _id, status, submittedAt, approvedAt, rejectedAt, product->{name} }`,
    { id: requestId }
  );

  if (doc) {
    console.log("Request found in Sanity:");
    console.log(JSON.stringify(doc, null, 2));
  } else {
    console.log("Request NOT found in Sanity");
  }

  // Also check how many pending/rejected exist
  const all = await client.fetch(
    `*[_type == "productUpdateRequest"] | order(submittedAt desc)[0..10]{ _id, status, product->{name}, submittedAt }`
  );
  console.log("\nLast 10 requests in Sanity:");
  console.log(JSON.stringify(all, null, 2));
} catch (e) {
  console.error("Error:", e);
  process.exit(1);
}
