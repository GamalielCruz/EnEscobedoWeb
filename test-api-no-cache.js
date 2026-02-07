/**
 * Script para probar la API sin caché
 */

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
  console.log('\n🧪 Probando API sin caché...\n');
  console.log('═'.repeat(70));

  try {
    // Agregar timestamp para evitar caché
    const timestamp = Date.now();
    const url = `${BASE_URL}/api/click-collect-orders?t=${timestamp}`;
    
    console.log(`\n📡 GET ${url}`);
    console.log('─'.repeat(70));
    
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
    const data = await response.json();
    
    console.log(`\n📊 Respuesta:`);
    console.log(`   Status: ${response.status}`);
    console.log(`   Success: ${data.success}`);
    console.log(`   Count: ${data.data?.count || 0}`);
    console.log(`   Orders: ${data.data?.orders?.length || 0}`);
    
    if (data.data?.orders && data.data.orders.length > 0) {
      console.log('\n⚠️  PROBLEMA: La API sigue devolviendo órdenes!');
      console.log('\n📋 Órdenes devueltas:');
      data.data.orders.forEach((order, i) => {
        console.log(`   ${i + 1}. Orden #${order.orderNumber} - ${order._id}`);
      });
      
      console.log('\n💡 Posibles causas:');
      console.log('   1. El cliente de Sanity está usando CDN (useCdn: true)');
      console.log('   2. Hay caché en el servidor Next.js');
      console.log('   3. Las órdenes no se eliminaron correctamente');
      
    } else {
      console.log('\n✅ La API NO devuelve órdenes (correcto)');
      console.log('\n💡 Si el navegador sigue mostrando órdenes:');
      console.log('   1. Presiona Ctrl+Shift+R (Windows) o Cmd+Shift+R (Mac)');
      console.log('   2. Abre DevTools (F12) > Network > Disable cache');
      console.log('   3. Cierra y abre el navegador');
      console.log('   4. Prueba en modo incógnito');
    }
    
    console.log('\n' + '═'.repeat(70) + '\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n⚠️  Asegúrate de que el servidor esté corriendo:');
    console.log('   npm run dev\n');
  }
}

testAPI();
