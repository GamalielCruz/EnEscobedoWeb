const { createClient } = require("@sanity/client");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

async function findOwner() {
  const stores = await client.fetch(`*[_type == "affiliateStore"]`);
  stores.forEach(s => {
    console.log(`Store: ${s.name} | Owner: ${s.ownerClerkUserId}`);
  });
}

findOwner();
