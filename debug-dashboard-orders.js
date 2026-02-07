/**
 * Script para debuggear por qué el dashboard no muestra órdenes
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

async function debugDashboard() {
  console.log('\n🔍 Debuggeando Dashboard - Por qué no aparecen órdenes\n');
  console.log('═'.repeat(70));

  try {
    // 1. Obtener todas las tiendas
    console.log('\n1️⃣  Tiendas en Sanity:');
    console.log('─'.repeat(70));
    
    const stores = await client.fetch(`*[_type == "affiliateStore"] {
      _id,
      name,
      storeId,
      ownerClerkUserId
    }`);
    
    console.log(`   Total de tiendas: ${stores.length}\n`);
    stores.forEach((store, i) => {
      console.log(`   ${i + 1}. ${store.name}`);
      console.log(`      _id: ${store._id}`);
      console.log(`      storeId: ${store.storeId || 'N/A'}`);
      console.log(`      ownerClerkUserId: ${store.ownerClerkUserId || 'N/A'}\n`);
    });

    // 2. Obtener todas las órdenes
    console.log('\n2️⃣  Órdenes en Sanity:');
    console.log('─'.repeat(70));
    
    const orders = await client.fetch(`*[
      (_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect")
    ] {
      _id,
      _type,
      orderNumber,
      "storeId": select(
        _type == "clickCollectOrder" => storeInfo.storeId,
        _type == "order" => pickupStore._ref
      ),
      "storeName": select(
        _type == "clickCollectOrder" => storeInfo.storeName,
        _type == "order" => pickupStore->name
      )
    }`);
    
    console.log(`   Total de órdenes: ${orders.length}\n`);
    orders.forEach((order, i) => {
      console.log(`   ${i + 1}. Orden #${order.orderNumber} (${order._type})`);
      console.log(`      storeId: ${order.storeId || 'N/A'}`);
      console.log(`      storeName: ${order.storeName || 'N/A'}\n`);
    });

    // 3. Verificar coincidencias
    console.log('\n3️⃣  Verificando coincidencias:');
    console.log('─'.repeat(70));
    
    let foundMatch = false;
    
    stores.forEach(store => {
      const matchingOrders = orders.filter(order => order.storeId === store._id);
      
      if (matchingOrders.length > 0) {
        foundMatch = true;
        console.log(`\n   ✅ Tienda: ${store.name}`);
        console.log(`      _id: ${store._id}`);
        console.log(`      Órdenes encontradas: ${matchingOrders.length}`);
        matchingOrders.forEach(order => {
          console.log(`         - Orden #${order.orderNumber}`);
        });
      }
    });
    
    if (!foundMatch) {
      console.log('\n   ❌ NO HAY COINCIDENCIAS');
      console.log('\n   Problema identificado:');
      console.log('   Las órdenes tienen storeId que no coincide con ningún _id de tienda\n');
      
      console.log('   Detalles:');
      orders.forEach(order => {
        console.log(`\n   Orden: ${order.orderNumber}`);
        console.log(`   storeId en orden: ${order.storeId}`);
        console.log(`   ¿Existe tienda con ese _id?: ${stores.some(s => s._id === order.storeId) ? 'SÍ' : 'NO'}`);
        
        // Buscar por storeId alternativo
        const storeByStoreId = stores.find(s => s.storeId === order.storeId);
        if (storeByStoreId) {
          console.log(`   ⚠️  PERO existe tienda con storeId: ${storeByStoreId.name}`);
          console.log(`   _id de esa tienda: ${storeByStoreId._id}`);
          console.log(`   🔧 SOLUCIÓN: La orden debe usar _id: ${storeByStoreId._id}`);
        }
      });
    }

    // 4. Query del dashboard
    console.log('\n\n4️⃣  Simulando query del dashboard:');
    console.log('─'.repeat(70));
    
    if (stores.length > 0) {
      const testStore = stores[0];
      console.log(`\n   Probando con tienda: ${testStore.name}`);
      console.log(`   _id: ${testStore._id}\n`);
      
      const dashboardOrders = await client.fetch(`*[
        (_type == "clickCollectOrder" && storeInfo.storeId == $storeId)
        || (_type == "order" && deliveryMethod == "click_collect" && pickupStore._ref == $storeId)
      ] {
        _id,
        orderNumber,
        _type
      }`, { storeId: testStore._id });
      
      console.log(`   Órdenes encontradas: ${dashboardOrders.length}`);
      
      if (dashboardOrders.length === 0) {
        console.log('\n   ❌ No se encontraron órdenes con esta query');
        console.log('   Esto explica por qué el dashboard está vacío\n');
      } else {
        console.log('\n   ✅ Se encontraron órdenes:');
        dashboardOrders.forEach(order => {
          console.log(`      - ${order.orderNumber} (${order._type})`);
        });
      }
    }

    console.log('\n' + '═'.repeat(70));

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

debugDashboard();
