// Script para verificar las referencias de tienda en las órdenes
import { createClient } from '@sanity/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.production' });

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2024-01-01',
  token: process.env.SANITY_API_TOKEN,
  useCdn: false,
});

const STORE_ID = '491d7dff-8884-402e-8e2b-1bcb8630e8ec';

async function checkOrders() {
  console.log('🔍 Verificando órdenes y sus referencias de tienda...\n');
  console.log('🏪 Tienda objetivo:', STORE_ID);
  console.log('═'.repeat(70));

  // 1. Verificar que la tienda existe
  const store = await client.fetch(`*[_type == "affiliateStore" && _id == $storeId][0]`, {
    storeId: STORE_ID,
  });

  if (!store) {
    console.log('❌ La tienda no existe en Sanity');
    return;
  }

  console.log('\n✅ Tienda encontrada:');
  console.log('   - ID:', store._id);
  console.log('   - Nombre:', store.name);
  console.log('   - Owner:', store.ownerClerkUserId);

  // 2. Buscar órdenes tipo clickCollectOrder
  console.log('\n📦 Buscando órdenes tipo clickCollectOrder...');
  const clickCollectOrders = await client.fetch(
    `*[_type == "clickCollectOrder"] {
      _id,
      orderNumber,
      status,
      "storeId": storeInfo.storeId,
      "storeName": storeInfo.storeName,
      customerInfo,
      createdAt
    }`
  );

  console.log(`   Encontradas: ${clickCollectOrders.length}`);
  
  if (clickCollectOrders.length > 0) {
    clickCollectOrders.forEach((order, idx) => {
      const matches = order.storeId === STORE_ID;
      console.log(`\n   ${idx + 1}. Orden #${order.orderNumber}`);
      console.log(`      - StoreId: ${order.storeId}`);
      console.log(`      - StoreName: ${order.storeName}`);
      console.log(`      - Estado: ${order.status}`);
      console.log(`      - Cliente: ${order.customerInfo?.name}`);
      console.log(`      - Coincide: ${matches ? '✅ SÍ' : '❌ NO'}`);
    });
  }

  // 3. Buscar órdenes tipo order con deliveryMethod click_collect
  console.log('\n📦 Buscando órdenes tipo order con deliveryMethod="click_collect"...');
  const regularOrders = await client.fetch(
    `*[_type == "order" && deliveryMethod == "click_collect"] {
      _id,
      orderNumber,
      status,
      "pickupStoreRef": pickupStore._ref,
      "pickupStoreName": pickupStore->name,
      customerName,
      createdAt
    }`
  );

  console.log(`   Encontradas: ${regularOrders.length}`);
  
  if (regularOrders.length > 0) {
    regularOrders.forEach((order, idx) => {
      const matches = order.pickupStoreRef === STORE_ID;
      console.log(`\n   ${idx + 1}. Orden #${order.orderNumber}`);
      console.log(`      - PickupStore._ref: ${order.pickupStoreRef}`);
      console.log(`      - PickupStore->name: ${order.pickupStoreName}`);
      console.log(`      - Estado: ${order.status}`);
      console.log(`      - Cliente: ${order.customerName}`);
      console.log(`      - Coincide: ${matches ? '✅ SÍ' : '❌ NO'}`);
    });
  }

  // 4. Probar la query exacta que usa la API
  console.log('\n🔍 Probando query exacta de la API...');
  console.log('═'.repeat(70));
  
  const apiQuery = `*[
    (_type == "clickCollectOrder" && storeInfo.storeId == $storeId)
    || (_type == "order" && deliveryMethod == "click_collect" && pickupStore._ref == $storeId)
  ] | order(coalesce(createdAt, orderDate) desc) {
    _id,
    _type,
    orderNumber,
    status,
    "storeId": select(
      _type == "clickCollectOrder" => storeInfo.storeId,
      _type == "order" => pickupStore._ref
    ),
    "storeName": select(
      _type == "clickCollectOrder" => storeInfo.storeName,
      _type == "order" => pickupStore->name
    ),
    "customerName": select(
      _type == "clickCollectOrder" => customerInfo.name,
      _type == "order" => customerName
    )
  }`;

  const apiResults = await client.fetch(apiQuery, { storeId: STORE_ID });
  
  console.log(`\n✅ Query de API devolvió: ${apiResults.length} órdenes`);
  
  if (apiResults.length > 0) {
    apiResults.forEach((order, idx) => {
      console.log(`\n   ${idx + 1}. Orden #${order.orderNumber}`);
      console.log(`      - Tipo: ${order._type}`);
      console.log(`      - StoreId: ${order.storeId}`);
      console.log(`      - StoreName: ${order.storeName}`);
      console.log(`      - Estado: ${order.status}`);
      console.log(`      - Cliente: ${order.customerName}`);
    });
  } else {
    console.log('\n❌ La query no devolvió órdenes');
    console.log('\n💡 Posibles causas:');
    console.log('   1. Las órdenes tienen un storeId diferente');
    console.log('   2. Las órdenes no tienen el campo storeInfo.storeId');
    console.log('   3. Las órdenes tipo "order" no tienen pickupStore._ref');
  }

  console.log('\n═'.repeat(70));
  console.log('✅ Verificación completada');
}

checkOrders().catch(console.error);
