const { createClient } = require('next-sanity');

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: '2023-01-01',
});

async function checkStores() {
  try {
    const query = `*[_type == "affiliateStore"] { name, address }`;
    const stores = await client.fetch(query);
    console.log('--- ALL STORES ---');
    console.log(JSON.stringify(stores, null, 2));
  } catch (e) {
    console.error('Error fetching stores:', e);
  }
}

checkStores();
