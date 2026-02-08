const { createClient } = require('next-sanity');

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: '2023-01-01',
});

async function checkAll() {
  try {
    const query = `* { _type, title, name, description, "content": select(_type == "block" => pt::text(body), null) }`;
    const results = await client.fetch(query);
    results.forEach(r => {
      const text = JSON.stringify(r);
      if (text.includes('Explora') || text.includes('necesitas')) {
        console.log('MATCH FOUND IN SANITY:');
        console.log(JSON.stringify(r, null, 2));
      }
    });
    console.log('Search finished');
  } catch (e) {
    console.error('Error:', e);
  }
}

checkAll();
