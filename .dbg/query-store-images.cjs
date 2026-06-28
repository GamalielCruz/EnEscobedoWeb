const { createClient } = require("@sanity/client");
require("dotenv").config({ path: ".env.local" });
const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});
const query = `*[_type == "affiliateStore"]{_id,name,image,coverImage,_updatedAt}`;
client.fetch(query).then((docs) => {
  console.log(JSON.stringify(docs, null, 2));
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
