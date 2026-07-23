import { createClient } from "next-sanity";
import dotenv from "dotenv";

dotenv.config();

const writeClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  apiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

async function testEndToEnd() {
  console.log("\n=== TEST END-TO-END APPROVAL FLOW ===\n");

  // Find the approved request
  const approvedRequest = await writeClient.fetch(
    `*[_type == "productUpdateRequest" && status == "approved"][0]`,
    {}
  );

  if (!approvedRequest) {
    console.log("❌ No approved request found. Create one first.");
    return;
  }

  console.log("✅ Found approved request:");
  console.log(`   ID: ${approvedRequest._id}`);
  console.log(`   Product ID: ${approvedRequest.product?._id}`);
  console.log(`   Status: ${approvedRequest.status}`);
  console.log(`   Changes made:`, Object.keys(approvedRequest.changes || {}));

  // Now fetch the actual product to see if changes were applied
  const product = await writeClient.fetch(
    `*[_type == "product" && _id == $productId][0]`,
    { productId: approvedRequest.product?._id }
  );

  if (!product) {
    console.log("❌ Product not found");
    return;
  }

  console.log("\n✅ Current product state:");
  console.log(`   Name: ${product.name}`);
  console.log(`   Price: $${product.price}`);
  console.log(`   Stock: ${product.stock ?? "N/A"}`);
  console.log(`   ApprovalStatus: ${product.approvalStatus}`);
  console.log(`   IsVisible: ${product.isVisible}`);

  // Compare with requested changes
  const changes = approvedRequest.changes || {};
  console.log("\n📋 Changes that were approved:");
  if (changes.name) console.log(`   ✓ Name changed to: "${changes.name}"`);
  if (changes.price != null) console.log(`   ✓ Price changed to: $${changes.price}`);
  if (changes.stock != null) console.log(`   ✓ Stock changed to: ${changes.stock}`);
  if (changes.description) console.log(`   ✓ Description updated`);
  if (changes.categories) console.log(`   ✓ Categories updated`);

  // Verification
  console.log("\n🔍 Verification:");
  let allApplied = true;
  if (changes.name && product.name !== changes.name) {
    console.log(`   ❌ Name NOT updated (expected "${changes.name}", got "${product.name}")`);
    allApplied = false;
  }
  if (changes.price != null && product.price !== changes.price) {
    console.log(`   ❌ Price NOT updated (expected $${changes.price}, got $${product.price})`);
    allApplied = false;
  }
  if (changes.stock != null && product.stock !== changes.stock) {
    console.log(`   ❌ Stock NOT updated (expected ${changes.stock}, got ${product.stock})`);
    allApplied = false;
  }

  if (allApplied && Object.keys(changes).length > 0) {
    console.log("   ✅ All approved changes were successfully applied!");
  } else if (Object.keys(changes).length === 0) {
    console.log("   ⚠️ No specific changes to verify (empty changes object)");
  }
}

testEndToEnd().catch(e => console.error("Error:", e));
