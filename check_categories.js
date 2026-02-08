const { createClient } = require('next-sanity');

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: '2023-01-01',
});

async function checkCategories() {
  try {
    const query = `*[_type == "storeCategory"] { title, description }`;
    const categories = await client.fetch(query);
    console.log('--- ALL CATEGORIES ---');
    console.log(JSON.stringify(categories, null, 2));
  } catch (e) {
    console.error('Error fetching categories:', e);
  }
}

checkCategories();
