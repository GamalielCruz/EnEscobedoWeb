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

async function checkDuplicates() {
  const orderNumber = "COD-1770512765635-FZ39C"; // ID derived from previous mangled output
  const orders = await client.fetch(`*[(orderNumber == $orderNumber || _id == "2t02yp6piNjowebjmdc5QM" || _id == "drafts.2t02yp6piNjowebjmdc5QM")]`, { orderNumber });
  console.log("Found:", orders.length, "orders");
  orders.forEach(o => {
    console.log(`ID: ${o._id}, Status: ${o.status}`);
  });
}

checkDuplicates();
