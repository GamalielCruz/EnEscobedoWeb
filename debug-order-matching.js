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

async function findOrder() {
  const result = await client.fetch(`*[_id == "2t02yp6piNjowebjmdc5QM" || _id == "drafts.2t02yp6piNjowebjmdc5QM"][0]`);
  console.log("Result Type:", result?._type);
  console.log("Result Keys:", Object.keys(result || {}));
  console.log("PickupStore Ref:", result?.pickupStore?._ref);
  console.log("AffiliateStore Ref:", result?.affiliateStore?._ref);
}

findOrder();
