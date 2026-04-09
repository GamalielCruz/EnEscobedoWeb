const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 't93gr28n',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2024-07-25'
});

async function checkUserStore() {
  try {
    const stores = await client.fetch('*[_type == "affiliateStore" && ownerClerkUserId == "user_39PJAdoHsbEvxZpKcZEmhIVzNHL"]{name, _id, ownerClerkUserId}');
    console.log('🔍 Tiendas asignadas al usuario:');
    console.log(JSON.stringify(stores, null, 2));
    
    // También verificar todas las tiendas
    const allStores = await client.fetch('*[_type == "affiliateStore"]{name, _id, ownerClerkUserId}');
    console.log('\n🏪 Todas las tiendas:');
    console.log(JSON.stringify(allStores, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

checkUserStore();
