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

async function checkStores() {
  const userId = "user_39KE3c0MdXkAxuta4OVvCPhEM9c"; // The clerk ID from the order dump
  const stores = await client.fetch(`*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id, name }`, { userId });
  console.log("Owned Stores:", JSON.stringify(stores, null, 2));
}

checkStores();
