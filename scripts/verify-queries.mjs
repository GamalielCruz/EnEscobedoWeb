import { createClient } from "next-sanity";
import dotenv from "dotenv";

dotenv.config();

const writeClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

async function verify() {
  console.log("\n=== VERIFICATION QUERIES ===\n");

  // Query 1: All productUpdateRequest documents
  console.log("1. All productUpdateRequest documents:");
  const allRequests = await writeClient.fetch(
    `*[_type == "productUpdateRequest"]{ _id, status, submittedAt, product->{name}, approvedAt, rejectionReason }`,
    {}
  );
  console.log(`Total: ${allRequests.length}`);
  allRequests.forEach(r => {
    console.log(`  - ${r._id.slice(0, 8)}... [${r.status}] ${r.product?.name || "no product"} at ${r.submittedAt?.split('T')[0]}`);
  });

  // Query 2: Only pending documents
  console.log("\n2. Only pending documents:");
  const pending = await writeClient.fetch(
    `*[_type == "productUpdateRequest" && status == "pending"]{ _id, product->{name} }`,
    {}
  );
  console.log(`Total: ${pending.length}`);
  pending.forEach(r => console.log(`  - ${r._id.slice(0, 8)}... ${r.product?.name || "no product"}`));

  // Query 3: Only pending OR rejected documents
  console.log("\n3. Only pending OR rejected documents:");
  const pendingOrRejected = await writeClient.fetch(
    `*[_type == "productUpdateRequest" && (status == "pending" || status == "rejected")]{ _id, status, product->{name} }`,
    {}
  );
  console.log(`Total: ${pendingOrRejected.length}`);
  pendingOrRejected.forEach(r => console.log(`  - ${r._id.slice(0, 8)}... [${r.status}] ${r.product?.name || "no product"}`));

  // Query 4: Check for approved documents
  console.log("\n4. Only approved documents:");
  const approved = await writeClient.fetch(
    `*[_type == "productUpdateRequest" && status == "approved"]{ _id, product->{name}, approvedAt }`,
    {}
  );
  console.log(`Total: ${approved.length}`);
  approved.forEach(r => console.log(`  - ${r._id.slice(0, 8)}... ${r.product?.name || "no product"} at ${r.approvedAt?.split('T')[0]}`));
}

verify().catch(e => console.error("Error:", e));
