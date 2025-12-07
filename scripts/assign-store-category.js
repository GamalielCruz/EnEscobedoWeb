// Script para asignar categoría a una tienda
// Ejecutar con: node scripts/assign-store-category.js

const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  useCdn: false,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
});

async function assignCategory() {
  console.log('🔍 Buscando tienda y categoría...\n');

  // Buscar la tienda "Borona Pizza"
  const store = await client.fetch(`
    *[_type == "affiliateStore" && name == "Borona Pizza"][0] {
      _id,
      name
    }
  `);

  if (!store) {
    console.error('❌ No se encontró la tienda "Borona Pizza"');
    return;
  }

  console.log(`✓ Tienda encontrada: ${store.name} (${store._id})`);

  // Buscar la categoría "Pizza"
  const category = await client.fetch(`
    *[_type == "storeCategory" && title == "Pizza"][0] {
      _id,
      title
    }
  `);

  if (!category) {
    console.error('❌ No se encontró la categoría "Pizza"');
    console.log('\nPrimero crea la categoría en Sanity Studio');
    return;
  }

  console.log(`✓ Categoría encontrada: ${category.title} (${category._id})\n`);

  // Asignar la categoría a la tienda
  console.log('📝 Asignando categoría a la tienda...');
  
  await client
    .patch(store._id)
    .set({
      storeCategories: [
        {
          _type: 'reference',
          _ref: category._id,
        },
      ],
    })
    .commit();

  console.log('✅ Categoría asignada exitosamente!');
  console.log('\nAhora recarga tu aplicación para ver los cambios.');
}

assignCategory()
  .then(() => {
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Error:', err);
    process.exit(1);
  });
