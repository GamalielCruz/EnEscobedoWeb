/**
 * Script para eliminar TODAS las órdenes click & collect
 */

require('dotenv').config();
const { createClient } = require('@sanity/client');

const writeClient = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

async function deleteAllOrders() {
  console.log('\n🗑️  Eliminando TODAS las órdenes click & collect\n');
  console.log('═'.repeat(70));

  try {
    // 1. Obtener todas las órdenes clickCollectOrder
    console.log('\n1️⃣  Buscando órdenes tipo "clickCollectOrder"...');
    const clickCollectOrders = await writeClient.fetch(`*[_type == "clickCollectOrder"] {
      _id,
      orderNumber
    }`);
    
    console.log(`   Encontradas: ${clickCollectOrders.length}`);

    if (clickCollectOrders.length > 0) {
      console.log('\n   Eliminando...');
      for (const order of clickCollectOrders) {
        try {
          await writeClient.delete(order._id);
          console.log(`   ✅ Eliminada orden #${order.orderNumber} (${order._id})`);
        } catch (error) {
          console.log(`   ❌ Error eliminando ${order._id}: ${error.message}`);
        }
      }
    }

    // 2. Obtener todas las órdenes order con click_collect
    console.log('\n2️⃣  Buscando órdenes tipo "order" con deliveryMethod="click_collect"...');
    const orderClickCollect = await writeClient.fetch(`*[_type == "order" && deliveryMethod == "click_collect"] {
      _id,
      orderNumber
    }`);
    
    console.log(`   Encontradas: ${orderClickCollect.length}`);

    if (orderClickCollect.length > 0) {
      console.log('\n   Eliminando...');
      for (const order of orderClickCollect) {
        try {
          await writeClient.delete(order._id);
          console.log(`   ✅ Eliminada orden #${order.orderNumber} (${order._id})`);
        } catch (error) {
          console.log(`   ❌ Error eliminando ${order._id}: ${error.message}`);
        }
      }
    }

    // 3. Verificar que no queden órdenes
    console.log('\n3️⃣  Verificando...');
    const remainingClickCollect = await writeClient.fetch(`count(*[_type == "clickCollectOrder"])`);
    const remainingOrder = await writeClient.fetch(`count(*[_type == "order" && deliveryMethod == "click_collect"])`);
    const total = remainingClickCollect + remainingOrder;

    console.log(`   clickCollectOrder: ${remainingClickCollect}`);
    console.log(`   order (click_collect): ${remainingOrder}`);
    console.log(`   Total: ${total}`);

    console.log('\n' + '═'.repeat(70));

    if (total === 0) {
      console.log('\n✅ Todas las órdenes eliminadas exitosamente!');
      console.log('\n📝 Próximos pasos:');
      console.log('   1. Limpia el caché: Remove-Item -Recurse -Force .next');
      console.log('   2. Reinicia el servidor: npm run dev');
      console.log('   3. Abre en modo incógnito: http://localhost:3000/click-collect-orders');
      console.log('   4. Verifica que NO aparezcan órdenes\n');
    } else {
      console.log('\n⚠️  Todavía quedan órdenes!');
      console.log('   Verifica los permisos del token de API\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Verifica que:');
    console.log('   - El token SANITY_API_TOKEN tenga permisos de escritura');
    console.log('   - Las variables de entorno estén configuradas correctamente\n');
    process.exit(1);
  }
}

deleteAllOrders();
