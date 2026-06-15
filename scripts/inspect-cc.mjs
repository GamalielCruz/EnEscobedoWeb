import { createClient } from "@sanity/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

const docs = await client.fetch(`*[_type == "clickCollectOrder"]`);
console.log(JSON.stringify(docs, null, 2));
