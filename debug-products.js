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

async function checkProduct() {
  const products = await client.fetch(`*[_type == "product"][0...10] { name, "sid": affiliateStore._ref }`);
  products.forEach(p => {
    console.log(`Product: ${p.name} | StoreID: ${p.sid}`);
  });
}

checkProduct();
