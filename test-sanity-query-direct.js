// Script para probar la query de Sanity directamente
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

// Esta es la MISMA query que usa la API
const ORDERS_QUERY = `*[
  (_type == "clickCollectOrder" && storeInfo.storeId == $storeId)
  || (_type == "order" && deliveryMethod == "click_collect" && pickupStore._ref == $storeId)
] | order(coalesce(createdAt, orderDate) desc) {
  _id,
  _type,
  orderNumber,
  pickupCode,
  "customerInfo": select(
    _type == "clickCollectOrder" => customerInfo,
    _type == "order" => { "name": customerName, "email": email, "clerkUserId": clerkUserId, "phone": phone }
  ),
  "storeInfo": select(
    _type == "clickCollectOrder" => storeInfo,
    _type == "order" => { "storeId": pickupStore._ref, "storeName": pickupStore->name, "storeAddress": pickupStore->address.street, "storePhone": pickupStore->contact.phone }
  ),
  "items": select(
    _type == "clickCollectOrder" => items,
    _type == "order" => products[]{ 
      _key, 
      "productName": product->name,
      "productId": product->_id,
      "quantity": quantity, 
      "price": product->price
    }
  ),
  "totalAmount": coalesce(totalAmount, totalPrice),
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  notes,
  "createdAt": coalesce(createdAt, orderDate),
  updatedAt
}`;

async function testQuery() {
  console.log('🔍 Probando query exacta de la API\n');
  console.log('═'.repeat(70));
  console.log('StoreId:', STORE_ID);
  console.log('═'.repeat(70));

  try {
    console.log('\n📡 Ejecutando query...\n');
    const orders = await client.fetch(ORDERS_QUERY, { storeId: STORE_ID });
    
    console.log('✅ Query ejecutada exitosamente');
    console.log('📦 Órdenes encontradas:', orders?.length || 0);
    
    if (orders && orders.length > 0) {
      console.log('\n📝 Detalles de las órdenes:\n');
      orders.forEach((order, idx) => {
        console.log(`Orden ${idx + 1}:`);
        console.log('  - ID:', order._id);
        console.log('  - Tipo:', order._type);
        console.log('  - Número:', order.orderNumber);
        console.log('  - Código:', order.pickupCode);
        console.log('  - Estado:', order.status);
        console.log('  - Cliente:', order.customerInfo?.name);
        console.log('  - Email:', order.customerInfo?.email);
        console.log('  - Teléfono:', order.customerInfo?.phone);
        console.log('  - Tienda:', order.storeInfo?.storeName);
        console.log('  - StoreId:', order.storeInfo?.storeId);
        console.log('  - Items:', order.items?.length);
        console.log('  - Total:', order.totalAmount);
        console.log('  - Creado:', order.createdAt);
        console.log('');
      });
      
      console.log('═'.repeat(70));
      console.log('✅ La query funciona correctamente');
      console.log('💡 Si la API devuelve 0 órdenes, el problema está en:');
      console.log('   1. La autenticación de Clerk');
      console.log('   2. La verificación de permisos (ownerClerkUserId)');
      console.log('   3. El cache de Next.js');
      
    } else {
      console.log('\n❌ La query no devolvió órdenes');
      console.log('\n💡 Esto significa que:');
      console.log('   1. No hay órdenes con ese storeId');
      console.log('   2. La estructura de datos no coincide con la query');
      console.log('   3. Hay un problema con los campos en Sanity');
      
      // Probar queries más simples
      console.log('\n🔍 Probando queries más simples...\n');
      
      const allClickCollect = await client.fetch(`*[_type == "clickCollectOrder"]`);
      console.log('📦 Total clickCollectOrder:', allClickCollect.length);
      
      if (allClickCollect.length > 0) {
        console.log('\n📝 Primera orden clickCollectOrder:');
        const first = allClickCollect[0];
        console.log('  - ID:', first._id);
        console.log('  - storeInfo:', first.storeInfo);
        console.log('  - storeInfo.storeId:', first.storeInfo?.storeId);
        console.log('  - ¿Coincide?:', first.storeInfo?.storeId === STORE_ID);
      }
    }
    
    console.log('\n═'.repeat(70));
    
  } catch (error) {
    console.error('❌ Error ejecutando query:', error);
  }
}

testQuery().catch(console.error);
