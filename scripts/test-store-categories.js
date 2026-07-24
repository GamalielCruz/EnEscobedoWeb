// Script para probar las categorías de tiendas
// Ejecutar con: node scripts/test-store-categories.js

const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  useCdn: false,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
});

async function testStoreCategories() {
  console.log('🔍 Verificando categorías de tiendas...\n');

  // Obtener todas las categorías de tiendas
  const categories = await client.fetch(`
    *[_type == "storeCategory"] {
      _id,
      title,
      icon
    }
  `);

  console.log('📋 Categorías disponibles:');
  categories.forEach(cat => {
    console.log(`  ${cat.icon || '📁'} ${cat.title} (${cat._id})`);
  });
  console.log('');

  // Obtener todas las tiendas con sus categorías
  const stores = await client.fetch(`
    *[_type == "affiliateStore"] {
      _id,
      name,
      storeCategories[]->{
        _id,
        title,
        icon
      }
    }
  `);

  console.log('🏪 Tiendas y sus categorías:');
  stores.forEach(store => {
    console.log(`\n  ${store.name}:`);
    if (store.storeCategories && store.storeCategories.length > 0) {
      store.storeCategories.forEach(cat => {
        console.log(`    ✓ ${cat.icon || '📁'} ${cat.title}`);
      });
    } else {
      console.log('    ⚠️  Sin categorías asignadas');
    }
  });
}

testStoreCategories()
  .then(() => {
    console.log('\n✅ Verificación completada');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
