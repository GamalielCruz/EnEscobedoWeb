/**
 * Script para verificar órdenes eliminadas y limpiar caché
 */

require('dotenv').config();
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2024-01-01',
  useCdn: false, // Importante: no usar CDN para ver datos en tiempo real
  token: process.env.SANITY_API_TOKEN,
});

async function checkOrders() {
  console.log('\n🔍 Verificando órdenes en Sanity...\n');
  console.log('═'.repeat(70));

  try {
    // 1. Verificar órdenes clickCollectOrder
    console.log('\n📋 Órdenes tipo "clickCollectOrder":');
    console.log('─'.repeat(70));
    
    const clickCollectOrders = await client.fetch(`*[_type == "clickCollectOrder"] {
      _id,
      orderNumber,
      status,
      customerInfo,
      createdAt
    }`);
    
    console.log(`   Total: ${clickCollectOrders.length}`);
    if (clickCollectOrders.length > 0) {
      clickCollectOrders.forEach((order, i) => {
        console.log(`   ${i + 1}. ${order._id} - Orden #${order.orderNumber} - ${order.status}`);
      });
    } else {
      console.log('   ✅ No hay órdenes de este tipo');
    }

    // 2. Verificar órdenes tipo order con click_collect
    console.log('\n📋 Órdenes tipo "order" con deliveryMethod="click_collect":');
    console.log('─'.repeat(70));
    
    const orderClickCollect = await client.fetch(`*[_type == "order" && deliveryMethod == "click_collect"] {
      _id,
      orderNumber,
      status,
      customerName,
      deliveryMethod,
      orderDate
    }`);
    
    console.log(`   Total: ${orderClickCollect.length}`);
    if (orderClickCollect.length > 0) {
      orderClickCollect.forEach((order, i) => {
        console.log(`   ${i + 1}. ${order._id} - Orden #${order.orderNumber} - ${order.status}`);
      });
    } else {
      console.log('   ✅ No hay órdenes de este tipo');
    }

    // 3. Verificar TODAS las órdenes (incluyendo otros deliveryMethod)
    console.log('\n📋 TODAS las órdenes tipo "order":');
    console.log('─'.repeat(70));
    
    const allOrders = await client.fetch(`*[_type == "order"] {
      _id,
      orderNumber,
      status,
      deliveryMethod,
      customerName
    }`);
    
    console.log(`   Total: ${allOrders.length}`);
    if (allOrders.length > 0) {
      allOrders.forEach((order, i) => {
        console.log(`   ${i + 1}. ${order._id} - Orden #${order.orderNumber} - ${order.deliveryMethod || 'N/A'} - ${order.status}`);
      });
    } else {
      console.log('   ✅ No hay órdenes');
    }

    // 4. Verificar documentos eliminados (drafts)
    console.log('\n🗑️  Verificando borradores y documentos eliminados:');
    console.log('─'.repeat(70));
    
    const drafts = await client.fetch(`*[_id in path("drafts.**")] {
      _id,
      _type
    }`);
    
    console.log(`   Borradores encontrados: ${drafts.length}`);
    if (drafts.length > 0) {
      drafts.forEach((draft, i) => {
        console.log(`   ${i + 1}. ${draft._id} (${draft._type})`);
      });
    }

    console.log('\n' + '═'.repeat(70));
    
    const totalClickCollect = clickCollectOrders.length + orderClickCollect.length;
    
    if (totalClickCollect === 0) {
      console.log('\n✅ No hay órdenes click & collect en Sanity');
      console.log('\n💡 Si la página web sigue mostrando órdenes:');
      console.log('   1. Limpia el caché del navegador (Ctrl+Shift+R o Cmd+Shift+R)');
      console.log('   2. Reinicia el servidor Next.js');
      console.log('   3. Verifica que no haya caché en el cliente de Sanity');
    } else {
      console.log(`\n📊 Total de órdenes click & collect: ${totalClickCollect}`);
    }
    
    console.log('');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

checkOrders();
