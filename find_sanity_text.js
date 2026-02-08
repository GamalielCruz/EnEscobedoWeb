const { createClient } = require('next-sanity');

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: '2023-01-01',
});

async function findText() {
  const target = "Explora nuestras tiendas";
  try {
    const allDocs = await client.fetch(`*`);
    allDocs.forEach(doc => {
      const str = JSON.stringify(doc);
      if (str.includes(target) || str.toLowerCase().includes("encuentra lo que necesitas")) {
        console.log("MATCH FOUND IN DOCUMENT:", doc._id, doc._type);
        console.log(JSON.stringify(doc, null, 2));
      }
    });
    console.log("Search complete.");
  } catch (e) {
    console.error(e);
  }
}

findText();
