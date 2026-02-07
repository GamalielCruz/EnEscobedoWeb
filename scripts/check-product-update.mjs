import { createClient } from "next-sanity";
import dotenv from "dotenv";

dotenv.config();

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

async function check() {
  console.log("\n=== CHECKING PIZZA DE PEPPERONI PRODUCT ===\n");
  
  // Get the Pizza de Pepperoni product
  const products = await client.fetch(
    `*[_type == 'product' && name match '*Pepperoni*'] | order(_updatedAt desc)[0..0]`
  );
  
  if (!products.length) {
    console.log("❌ No Pizza de Pepperoni found");
    return;
  }
  
  const product = products[0];
  console.log("✅ Found Product:");
  console.log(`  ID: ${product._id}`);
  console.log(`  Name: ${product.name.substring(0, 50)}...`);
  console.log(`  Price: $${product.price}`);
  console.log(`  Stock: ${product.stock}`);
  console.log(`  ApprovalStatus: ${product.approvalStatus}`);
  console.log(`  LastUpdated: ${product._updatedAt}`);
  
  // Now check if this is the recently approved one
  console.log("\n=== CHECKING IF THIS MATCHES APPROVAL ===");
  const recentlyApproved = await client.fetch(
    `*[_type == 'productUpdateRequest' && status == 'approved' && _updatedAt > now()-10m][0]`
  );
  
  if (recentlyApproved) {
    console.log("✅ Found recently approved request:");
    console.log(`  Request ID: ${recentlyApproved._id}`);
    console.log(`  Product Ref: ${recentlyApproved.product?._ref}`);
    console.log(`  Changes Made:`, Object.keys(recentlyApproved.changes || {}));
    
    if (recentlyApproved.changes?.price) {
      console.log(`\n  Expected price: $${recentlyApproved.changes.price}`);
      console.log(`  Actual price: $${product.price}`);
      if (product.price === recentlyApproved.changes.price) {
        console.log("  ✅ PRICE MATCHES - Changes were applied!"); 
      } else {
        console.log("  ❌ PRICE MISMATCH - Changes NOT applied!");
      }
    }
  }
}

check().catch(e => console.error("Error:", e.message));
