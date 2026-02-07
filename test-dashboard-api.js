/**
 * Script para probar la API del dashboard directamente
 */

const storeId = '491d7dff-8884-402e-8e2b-1bcb8630e8ec';

async function testDashboardAPI() {
  console.log('\n🧪 Probando API del Dashboard\n');
  console.log('═'.repeat(70));

  try {
    // Probar la API de órdenes del dashboard
    const url = `http://localhost:3000/api/dashboard/store-orders?storeId=${storeId}`;
    
    console.log(`\n📡 GET ${url}\n`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    console.log('📊 Respuesta:');
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${data.success}`);
    
    if (data.error) {
      console.log(`   ❌ Error: ${data.error}`);
    }
    
    if (data.orders) {
      console.log(`   Órdenes: ${data.orders.length}`);
      
      if (data.orders.length > 0) {
        console.log('\n✅ Órdenes encontradas:');
        data.orders.forEach((order, i) => {
          console.log(`\n   ${i + 1}. Orden #${order.orderNumber}`);
          console.log(`      _type: ${order._type}`);
          console.log(`      Cliente: ${order.customerInfo?.name || 'N/A'}`);
          console.log(`      Total: $${order.totalAmount || 0}`);
          console.log(`      Estado: ${order.status}`);
        });
      } else {
        console.log('\n❌ La API devuelve 0 órdenes');
        console.log('\n💡 Posibles causas:');
        console.log('   1. La orden no tiene el storeId correcto');
        console.log('   2. La query no está encontrando la orden');
        console.log('   3. Hay un problema con la autenticación');
      }
    }
    
    console.log('\n' + '═'.repeat(70));
    
    // Verificar si necesita autenticación
    if (response.status === 401) {
      console.log('\n⚠️  La API requiere autenticación');
      console.log('   Esta prueba no puede simular la sesión de Clerk');
      console.log('   Prueba directamente en el navegador:\n');
      console.log(`   ${url}\n`);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n⚠️  Asegúrate de que el servidor esté corriendo:');
    console.log('   npm run dev\n');
  }
}

testDashboardAPI();
