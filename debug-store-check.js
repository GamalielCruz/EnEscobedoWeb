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

async function checkStore() {
  const storeId = "800938b2-ded4-402e-8e2b-1bcb8630e8ec";
  const store = await client.fetch(`*[_id == $storeId][0]`, { storeId });
  console.log("Store Name:", store?.name);
  console.log("Store ID field:", store?.storeId);
  console.log("Owner ID:", store?.ownerClerkUserId);
}

checkStore();
