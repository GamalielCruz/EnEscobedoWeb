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
  if (order) {
    console.log("Order found!");
    console.log("Order Number:", order.orderNumber);
    console.log("Pickup Store Ref:", order.pickupStore?._ref);
    console.log("Affiliate Store Ref:", order.affiliateStore?._ref);
    console.log("Status:", order.status);
    console.log("_id:", order._id);
  } else {
    console.log("Order not found");
  }
}

checkOrder();
