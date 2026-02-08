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

async function dump() {
  const result = await client.fetch(`*[_id == "2t02yp6piNjowebjmdc5QM"][0]`);
  const fs = require('fs');
  fs.writeFileSync('order-dump.json', JSON.stringify(result, null, 2));
  console.log("Dumped to order-dump.json");
}

dump();
