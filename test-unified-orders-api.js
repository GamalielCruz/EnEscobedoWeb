/**
 * Script para probar las APIs de órdenes unificadas
 * Simula las llamadas que hacen las páginas web
 */

require('dotenv').config();

const BASE_URL = 'http://localhost:3000';

async function testClickCollectOrdersAPI() {
  console.log('🧪 Probando API de Click & Collect Orders\n');
  console.log('═'.repeat(80));

  try {
    // 1. Obtener todas las órdenes
    console.log('\n1️⃣  GET /api/click-collect-orders (todas las órdenes)');
    console.log('─'.repeat(80));
    
    const allOrdersRes = await fetch(`${BASE_URL}/api/click-collect-orders`);
    const allOrdersData = await allOrdersRes.json();
    
    if (allOrdersData.success) {
      console.log(`✅ Éxito: ${allOrdersData.data.count} órdenes encontradas`);
      
      if (allOrdersData.data.orders.length > 0) {
        console.log('\n📋 Primeras 3 órdenes:');
        allOrdersData.data.orders.slice(0, 3).forEach((order, i) => {
          console.log(`\n   ${i + 1}. Orden #${order.orderNumber}`);
          console.log(`      Tipo: ${order._type}`);
          console.log(`      Cliente: ${order.customerInfo?.name || 'N/A'}`);
          console.log(`      Tienda: ${order.storeInfo?.storeName || 'N/A'}`);
          console.log(`      Total: $${order.totalAmount || 0}`);
          console.log(`      Estado: ${order.status}`);
        });
      }
    } else {
      console.log(`❌ Error: ${allOrdersData.error}`);
    }

    // 2. Filtrar por estado
    console.log('\n\n2️⃣  GET /api/click-collect-orders?status=pending_pickup');
    console.log('─'.repeat(80));
    
    const pendingRes = await fetch(`${BASE_URL}/api/click-collect-orders?status=pending_pickup`);
    const pendingData = await pendingRes.json();
    
    if (pendingData.success) {
      console.log(`✅ Éxito: ${pendingData.data.count} órdenes pendientes de recoger`);
      
      if (pendingData.data.orders.length > 0) {
        pendingData.data.orders.forEach((order) => {
          console.log(`   - Orden #${order.orderNumber} (${order._type})`);
        });
      }
    } else {
      console.log(`❌ Error: ${pendingData.error}`);
    }

    // 3. Buscar orden específica
    if (allOrdersData.success && allOrdersData.data.orders.length > 0) {
      const firstOrder = allOrdersData.data.orders[0];
      
      console.log(`\n\n3️⃣  GET /api/click-collect-orders?orderNumber=${firstOrder.orderNumber}`);
      console.log('─'.repeat(80));
      
      const specificRes = await fetch(`${BASE_URL}/api/click-collect-orders?orderNumber=${firstOrder.orderNumber}`);
      const specificData = await specificRes.json();
      
      if (specificData.success) {
        console.log(`✅ Éxito: Orden encontrada`);
        const order = specificData.data.orders[0];
        console.log(`\n   Detalles completos:`);
        console.log(`   - Número: ${order.orderNumber}`);
        console.log(`   - Código: ${order.pickupCode}`);
        console.log(`   - Cliente: ${order.customerInfo?.name}`);
        console.log(`   - Email: ${order.customerInfo?.email}`);
        console.log(`   - Teléfono: ${order.customerInfo?.phone}`);
        console.log(`   - Tienda: ${order.storeInfo?.storeName}`);
        console.log(`   - Dirección: ${order.storeInfo?.storeAddress}`);
        console.log(`   - Items: ${order.items?.length || 0}`);
        order.items?.forEach((item, i) => {
          console.log(`     ${i + 1}. ${item.productName} x${item.quantity} - $${item.price}`);
        });
        console.log(`   - Total: $${order.totalAmount}`);
        console.log(`   - Estado: ${order.status}`);
        console.log(`   - Creada: ${order.createdAt}`);
      } else {
        console.log(`❌ Error: ${specificData.error}`);
      }
    }

    console.log('\n' + '═'.repeat(80));
    console.log('✅ Prueba de API de Click & Collect Orders completada\n');

  } catch (error) {
    console.error('\n❌ Error en la prueba:', error.message);
    console.log('\n⚠️  Asegúrate de que el servidor esté corriendo en http://localhost:3000');
  }
}

async function testStoreOrdersAPI() {
  console.log('\n🧪 Probando API de Store Orders (Dashboard)\n');
  console.log('═'.repeat(80));
  console.log('\n⚠️  Esta API requiere autenticación con Clerk');
  console.log('   Para probarla completamente, usa el navegador en /dashboard');
  console.log('\n' + '═'.repeat(80) + '\n');
}

// Ejecutar pruebas
async function runTests() {
  console.log('\n🚀 Iniciando pruebas de APIs de órdenes unificadas\n');
  
  await testClickCollectOrdersAPI();
  await testStoreOrdersAPI();
  
  console.log('✅ Todas las pruebas completadas!\n');
}

runTests();
