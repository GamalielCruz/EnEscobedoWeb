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

async function findAnything() {
  const id = "800938b2-ded4-402e-8e2b-1bcb8630e8ec";
  const doc = await client.fetch(`*[_id == $id || _id == "drafts." + $id][0]`, { id });
  console.log("Found Document JSON:", JSON.stringify(doc, null, 2));
}

findAnything();
