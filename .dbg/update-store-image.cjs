const { createClient } = require("@sanity/client");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: ".env.local" });
const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});
const storeId = process.argv[2];
const mode = process.argv[3];
(async () => {
  if (!storeId || !mode) throw new Error("usage: node update-store-image.cjs <storeId> <unset|upload-og|set-ref>");
  if (mode === "unset") {
    const res = await client.patch(storeId).set({ image: null }).commit({ autoGenerateArrayKeys: true });
    console.log(JSON.stringify({ mode, storeId, image: res.image ?? null, _updatedAt: res._updatedAt }, null, 2));
    return;
  }
  if (mode === "upload-og") {
    const filePath = path.join(process.cwd(), "public", "og-image.png");
    const asset = await client.assets.upload("image", fs.createReadStream(filePath), { filename: "debug-og-image.png" });
    const image = { _type: "image", asset: { _type: "reference", _ref: asset._id } };
    const res = await client.patch(storeId).set({ image }).commit({ autoGenerateArrayKeys: true });
    console.log(JSON.stringify({ mode, storeId, assetId: asset._id, image: res.image ?? null, _updatedAt: res._updatedAt }, null, 2));
    return;
  }
  if (mode === "set-ref") {
    const ref = process.argv[4];
    if (!ref) throw new Error("missing ref");
    const image = { _type: "image", asset: { _type: "reference", _ref: ref } };
    const res = await client.patch(storeId).set({ image }).commit({ autoGenerateArrayKeys: true });
    console.log(JSON.stringify({ mode, storeId, image: res.image ?? null, _updatedAt: res._updatedAt }, null, 2));
    return;
  }
  throw new Error(`unknown mode: ${mode}`);
})().catch((e) => { console.error(e); process.exit(1); });
