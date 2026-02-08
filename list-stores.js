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

async function listStores() {
  const stores = await client.fetch(`*[_type == "affiliateStore"] { _id, name, storeId, ownerClerkUserId }`);
  stores.forEach(s => {
    console.log(`ID: ${s._id} | Name: ${s.name} | owner: ${s.ownerClerkUserId}`);
  });
}

listStores();
