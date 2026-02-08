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

const ORDERS_QUERY = `*[
  !(_id in path('drafts.**')) && (
    (_type == "clickCollectOrder" && storeInfo.storeId == $storeId)
    || (_type == "order" && (pickupStore._ref == $storeId || affiliateStore._ref == $storeId))
  )
] | order(coalesce(createdAt, orderDate) desc)`;

async function checkOrders() {
  const storeId = "800938b2-ded4-402e-8e2b-1bcb8630e8ec";
  const orders = await client.fetch(ORDERS_QUERY, { storeId });
  console.log("Count:", orders.length);
  orders.forEach(o => {
    console.log(`ID: ${o._id}, OrderNumber: ${o.orderNumber}, Status: ${o.status}`);
  });
}

checkOrders();
