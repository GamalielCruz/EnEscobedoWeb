/**
 * Script para ver la estructura exacta de la orden
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

async function debugOrder() {
  console.log('\n🔍 Analizando estructura de la orden\n');
  console.log('═'.repeat(70));

  try {
    // Obtener la orden con la query unificada
    const orders = await client.fetch(`*[
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
    }`);

    console.log(`\n📊 Total de órdenes: ${orders.length}\n`);

    if (orders.length === 0) {
      console.log('⚠️  No hay órdenes para analizar\n');
      return;
    }

    orders.forEach((order, index) => {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`\nOrden ${index + 1}:`);
      console.log(`  _id: ${order._id}`);
      console.log(`  _type: ${order._type}`);
      console.log(`  orderNumber: ${order.orderNumber}`);
      console.log(`  pickupCode: ${order.pickupCode}`);
      
      console.log(`\n  customerInfo:`);
      if (order.customerInfo) {
        console.log(`    name: ${order.customerInfo.name || 'UNDEFINED ❌'}`);
        console.log(`    email: ${order.customerInfo.email || 'UNDEFINED ❌'}`);
        console.log(`    phone: ${order.customerInfo.phone || 'UNDEFINED ❌'}`);
      } else {
        console.log(`    ❌ customerInfo es NULL o UNDEFINED`);
      }
      
      console.log(`\n  storeInfo:`);
      if (order.storeInfo) {
        console.log(`    storeName: ${order.storeInfo.storeName || 'UNDEFINED ❌'}`);
        console.log(`    storeAddress: ${order.storeInfo.storeAddress || 'UNDEFINED ❌'}`);
        console.log(`    storeId: ${order.storeInfo.storeId || 'UNDEFINED ❌'}`);
      } else {
        console.log(`    ❌ storeInfo es NULL o UNDEFINED`);
      }
      
      console.log(`\n  items: ${order.items ? order.items.length : 'NULL ❌'}`);
      if (order.items && order.items.length > 0) {
        order.items.forEach((item, i) => {
          console.log(`    ${i + 1}. productName: ${item.productName || 'UNDEFINED ❌'}`);
          console.log(`       quantity: ${item.quantity || 'UNDEFINED ❌'}`);
          console.log(`       price: ${item.price || 'UNDEFINED ❌'}`);
        });
      }
      
      console.log(`\n  totalAmount: ${order.totalAmount || 'UNDEFINED ❌'}`);
      console.log(`  status: ${order.status || 'UNDEFINED ❌'}`);
      console.log(`  createdAt: ${order.createdAt || 'UNDEFINED ❌'}`);
    });

    console.log(`\n${'═'.repeat(70)}`);
    
    // Verificar campos faltantes
    console.log('\n🔍 Verificando campos faltantes:\n');
    
    let hasIssues = false;
    orders.forEach((order, index) => {
      const issues = [];
      
      if (!order.customerInfo) issues.push('customerInfo es null');
      else {
        if (!order.customerInfo.name) issues.push('customerInfo.name faltante');
        if (!order.customerInfo.email) issues.push('customerInfo.email faltante');
        if (!order.customerInfo.phone) issues.push('customerInfo.phone faltante');
      }
      
      if (!order.storeInfo) issues.push('storeInfo es null');
      else {
        if (!order.storeInfo.storeName) issues.push('storeInfo.storeName faltante');
      }
      
      if (!order.items || order.items.length === 0) issues.push('items vacío o null');
      else {
        order.items.forEach((item, i) => {
          if (!item.productName) issues.push(`items[${i}].productName faltante`);
        });
      }
      
      if (issues.length > 0) {
        hasIssues = true;
        console.log(`  Orden ${index + 1} (${order.orderNumber}):`);
        issues.forEach(issue => console.log(`    ❌ ${issue}`));
        console.log('');
      }
    });
    
    if (!hasIssues) {
      console.log('  ✅ Todas las órdenes tienen los campos requeridos\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  }
}

debugOrder();
