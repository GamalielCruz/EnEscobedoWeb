
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 't93gr28n', 
  dataset: 'production', 
  apiVersion: '2023-05-03',
  useCdn: false,
});

async function checkStores() {
  try {
    const stores = await client.fetch(`*[_type == "affiliateStore"] {
      _id,
      name,
      ownerClerkUserId
    }`);
    
    console.log('Stores found:', stores.length);
    stores.forEach(store => {
      console.log(`Store: ${store.name} (ID: ${store._id}) - Owner: ${store.ownerClerkUserId}`);
    });
  } catch (error) {
    console.error('Error fetching stores:', error);
  }
}

checkStores();
