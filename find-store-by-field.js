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

async function findStoreByField() {
  const sid = "800938b2-ded4-402e-8e2b-1bcb8630e8ec";
  const store = await client.fetch(`*[_type == "affiliateStore" && storeId == $sid][0]`, { sid });
  console.log("Found Store Name:", store?.name);
  console.log("Actual _id:", store?._id);
  console.log("Owner ID:", store?.ownerClerkUserId);
}

findStoreByField();
