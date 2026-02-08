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

async function checkOrder() {
  const orderId = "2t02yp6piNjowebjmdc5QM";
  const order = await client.fetch(`*[_id == $orderId || _id == "drafts." + $orderId][0]`, { orderId });
  console.log("Order Type:", order?._type);
  console.log("Full Order:", JSON.stringify(order, null, 2));
}

checkOrder();
