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

async function checkAllOrders() {
  const orders = await client.fetch(`*[_type == "order"] { _id, orderNumber, status }`);
  console.log("Total Orders:", orders.length);
  orders.forEach(o => {
    console.log(`ID: ${o._id} | Num: ${o.orderNumber} | Status: ${o.status}`);
  });
}

checkAllOrders();
