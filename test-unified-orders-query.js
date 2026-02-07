/**
 * Script de prueba para verificar que las órdenes se consulten correctamente
 * desde ambos schemas: Order y ClickCollectOrder
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

// Query unificada que consulta ambos tipos
const UNIFIED_ORDERS_QUERY = `*[
  (_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect")
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

async function testUnifiedQuery() {
  console.log('🔍 Probando consulta unificada de órdenes...\n');

  try {
    // 1. Contar órdenes por tipo
    console.log('📊 Contando órdenes por tipo:');
    
    const clickCollectCount = await client.fetch(
      `count(*[_type == "clickCollectOrder"])`
    );
    console.log(`   - clickCollectOrder: ${clickCollectCount}`);
    
    const orderClickCollectCount = await client.fetch(
      `count(*[_type == "order" && deliveryMethod == "click_collect"])`
    );
    console.log(`   - order (click_collect): ${orderClickCollectCount}`);
    
    const totalExpected = clickCollectCount + orderClickCollectCount;
    console.log(`   - Total esperado: ${totalExpected}\n`);

    // 2. Ejecutar query unificada
    console.log('🔄 Ejecutando query unificada...');
    const unifiedOrders = await client.fetch(UNIFIED_ORDERS_QUERY);
    console.log(`✅ Órdenes obtenidas: ${unifiedOrders.length}\n`);

    if (unifiedOrders.length !== totalExpected) {
      console.warn(`⚠️  ADVERTENCIA: Se esperaban ${totalExpected} órdenes pero se obtuvieron ${unifiedOrders.length}`);
    }

    // 3. Mostrar resumen de órdenes
    console.log('📋 Resumen de órdenes:');
    console.log('─'.repeat(80));
    
    const byType = {
      clickCollectOrder: 0,
      order: 0,
    };

    unifiedOrders.forEach((order, index) => {
      byType[order._type]++;
      
      console.log(`\n${index + 1}. Orden #${order.orderNumber} (${order._type})`);
      console.log(`   Código: ${order.pickupCode || 'N/A'}`);
      console.log(`   Cliente: ${order.customerInfo?.name || 'N/A'}`);
      console.log(`   Tienda: ${order.storeInfo?.storeName || 'N/A'}`);
      console.log(`   Items: ${order.items?.length || 0}`);
      console.log(`   Total: $${order.totalAmount || 0}`);
      console.log(`   Estado: ${order.status}`);
      console.log(`   Creada: ${order.createdAt}`);
    });

    console.log('\n' + '─'.repeat(80));
    console.log('\n📊 Distribución por tipo:');
    console.log(`   - clickCollectOrder: ${byType.clickCollectOrder}`);
    console.log(`   - order: ${byType.order}`);

    // 4. Verificar estructura de datos
    console.log('\n🔍 Verificando estructura de datos...');
    let structureErrors = 0;

    unifiedOrders.forEach((order) => {
      const errors = [];
      
      if (!order.customerInfo) errors.push('customerInfo faltante');
      if (!order.storeInfo) errors.push('storeInfo faltante');
      if (!order.items || order.items.length === 0) errors.push('items vacío');
      if (!order.totalAmount) errors.push('totalAmount faltante');
      if (!order.createdAt) errors.push('createdAt faltante');

      if (errors.length > 0) {
        structureErrors++;
        console.log(`   ❌ Orden ${order.orderNumber}: ${errors.join(', ')}`);
      }
    });

    if (structureErrors === 0) {
      console.log('   ✅ Todas las órdenes tienen la estructura correcta');
    } else {
      console.log(`   ⚠️  ${structureErrors} órdenes con problemas de estructura`);
    }

    // 5. Probar filtro por estado
    console.log('\n🔍 Probando filtro por estado (pending)...');
    const pendingQuery = `*[
      ((_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect"))
      && status == "pending"
    ] | order(coalesce(createdAt, orderDate) desc)`;
    
    const pendingOrders = await client.fetch(pendingQuery);
    console.log(`   ✅ Órdenes pendientes: ${pendingOrders.length}`);

    console.log('\n✅ Prueba completada exitosamente!');

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error);
    process.exit(1);
  }
}

// Ejecutar prueba
testUnifiedQuery();
