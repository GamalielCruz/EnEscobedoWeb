const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 't93gr28n',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2024-03-19'
});

async function checkStoreOwners() {
  try {
    console.log('🔍 Verificando asignación de tiendas...');
    
    const stores = await client.fetch('*[_type == "affiliateStore"]{ _id, name, ownerClerkUserId, storeId }');
    
    console.log('\n📋 Tiendas y sus dueños:');
    stores.forEach(store => {
      console.log(`- ${store.name}: ${store.ownerClerkUserId}`);
    });
    
    console.log('\n👤 Usuarios esperados:');
    console.log('- Crepas Dulces: user_39PJAdoHsbEvxZpKcZEmhIVzNHL');
    console.log('- Borona Pizza: user_392Q7p9ahx7GuGwIit2aWNeWaak');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkStoreOwners();
