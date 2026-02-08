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

async function listOwners() {
  const owners = await client.fetch(`*[_type == "affiliateStore"] { name, ownerClerkUserId }`);
  console.log("Owners:", JSON.stringify(owners, null, 2));
}

listOwners();
