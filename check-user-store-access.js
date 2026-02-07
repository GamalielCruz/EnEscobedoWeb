/**
 * Script para verificar el acceso del usuario a las tiendas
 */

require('dotenv').config();
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

async function checkAccess() {
  console.log('\n🔍 Verificando Acceso del Usuario a las Tiendas\n');
  console.log('═'.repeat(70));

  try {
    // 1. Obtener tiendas con órdenes
    console.log('\n1️⃣  Tiendas con órdenes:');
    console.log('─'.repeat(70));
    
    const stores = await client.fetch(`*[_type == "affiliateStore"] {
      _id,
      name,
      storeId,
      ownerClerkUserId,
      "orderCount": count(*[
        (_type == "clickCollectOrder" && storeInfo.storeId == ^._id)
        || (_type == "order" && deliveryMethod == "click_collect" && pickupStore._ref == ^._id)
      ])
    }`);
    
    stores.forEach((store, i) => {
      console.log(`\n   ${i + 1}. ${store.name}`);
      console.log(`      _id: ${store._id}`);
      console.log(`      ownerClerkUserId: ${store.ownerClerkUserId || 'NO ASIGNADO ❌'}`);
      console.log(`      Órdenes: ${store.orderCount}`);
    });

    // 2. Identificar el problema
    console.log('\n\n2️⃣  Diagnóstico:');
    console.log('─'.repeat(70));
    
    const storesWithOrders = stores.filter(s => s.orderCount > 0);
    const storesWithoutOwner = storesWithOrders.filter(s => !s.ownerClerkUserId);
    
    if (storesWithoutOwner.length > 0) {
      console.log('\n   ❌ PROBLEMA ENCONTRADO:');
      console.log(`   ${storesWithoutOwner.length} tienda(s) con órdenes NO tienen dueño asignado:\n`);
      
      storesWithoutOwner.forEach(store => {
        console.log(`   - ${store.name}`);
        console.log(`     _id: ${store._id}`);
        console.log(`     Órdenes: ${store.orderCount}`);
        console.log(`     ownerClerkUserId: NO ASIGNADO\n`);
      });
      
      console.log('   💡 SOLUCIÓN:');
      console.log('   Necesitas asignar un ownerClerkUserId a estas tiendas en Sanity Studio\n');
    } else {
      console.log('\n   ✅ Todas las tiendas con órdenes tienen dueño asignado\n');
      
      storesWithOrders.forEach(store => {
        console.log(`   ${store.name}:`);
        console.log(`   - ownerClerkUserId: ${store.ownerClerkUserId}`);
        console.log(`   - Para ver las órdenes, el usuario debe tener este Clerk ID\n`);
      });
    }

    // 3. Instrucciones
    console.log('\n3️⃣  Cómo obtener tu Clerk User ID:');
    console.log('─'.repeat(70));
    console.log('\n   Opción 1 - Desde el Dashboard:');
    console.log('   1. Ve a: http://localhost:3000/dashboard');
    console.log('   2. Si no tienes tienda asignada, verás tu Clerk User ID');
    console.log('   3. Cópialo completo\n');
    
    console.log('   Opción 2 - Desde Clerk Dashboard:');
    console.log('   1. Ve a: https://dashboard.clerk.com');
    console.log('   2. Selecciona tu aplicación');
    console.log('   3. Ve a "Users"');
    console.log('   4. Busca tu usuario');
    console.log('   5. Copia el "User ID"\n');

    console.log('\n4️⃣  Cómo asignar el dueño en Sanity:');
    console.log('─'.repeat(70));
    console.log('\n   1. Ve a: http://localhost:3000/studio');
    console.log('   2. Busca la tienda "Borona Pizza"');
    console.log('   3. Pega tu Clerk User ID en el campo "Usuario Dueño (ID de Clerk)"');
    console.log('   4. Guarda');
    console.log('   5. Recarga el dashboard\n');

    console.log('═'.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

checkAccess();
