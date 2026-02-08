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

async function checkCC() {
  const orders = await client.fetch(`*[_type == "clickCollectOrder"] { _id, orderNumber }`);
  console.log("CC Orders:", JSON.stringify(orders, null, 2));
}

checkCC();
