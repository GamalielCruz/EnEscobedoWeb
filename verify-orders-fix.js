/**
 * Script de verificación rápida para confirmar que la solución funciona
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

async function verify() {
  console.log('\n🔍 Verificación Rápida de Órdenes Unificadas\n');
  console.log('═'.repeat(60));

  try {
    // Contar órdenes
    const clickCollectCount = await client.fetch(`count(*[_type == "clickCollectOrder"])`);
    const orderCount = await client.fetch(`count(*[_type == "order" && deliveryMethod == "click_collect"])`);
    const total = clickCollectCount + orderCount;

    console.log('\n📊 Resumen de Órdenes:');
    console.log('─'.repeat(60));
    console.log(`   Schema "clickCollectOrder": ${clickCollectCount} órdenes`);
    console.log(`   Schema "order" (click_collect): ${orderCount} órdenes`);
    console.log(`   Total: ${total} órdenes\n`);

    if (total === 0) {
      console.log('⚠️  No hay órdenes en la base de datos');
      console.log('   Crea algunas órdenes de prueba para verificar la solución\n');
      return;
    }

    // Verificar query unificada
    const unifiedQuery = `*[
      (_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect")
    ]`;
    const unifiedOrders = await client.fetch(unifiedQuery);

    console.log('✅ Query Unificada:');
    console.log('─'.repeat(60));
    console.log(`   Órdenes obtenidas: ${unifiedOrders.length}`);
    
    if (unifiedOrders.length === total) {
      console.log('   ✅ Todas las órdenes se obtienen correctamente\n');
    } else {
      console.log(`   ❌ Faltan ${total - unifiedOrders.length} órdenes\n`);
    }

    // Verificar normalización
    const normalizedQuery = `*[
      (_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect")
    ][0] {
      _type,
      "hasCustomerInfo": defined(select(
        _type == "clickCollectOrder" => customerInfo,
        _type == "order" => { "name": customerName }
      )),
      "hasStoreInfo": defined(select(
        _type == "clickCollectOrder" => storeInfo,
        _type == "order" => { "storeId": pickupStore._ref }
      )),
      "hasItems": defined(select(
        _type == "clickCollectOrder" => items,
        _type == "order" => products
      ))
    }`;
    
    const normalized = await client.fetch(normalizedQuery);
    
    if (normalized) {
      console.log('✅ Normalización de Datos:');
      console.log('─'.repeat(60));
      console.log(`   Tipo de orden: ${normalized._type}`);
      console.log(`   customerInfo: ${normalized.hasCustomerInfo ? '✅' : '❌'}`);
      console.log(`   storeInfo: ${normalized.hasStoreInfo ? '✅' : '❌'}`);
      console.log(`   items: ${normalized.hasItems ? '✅' : '❌'}\n`);
    }

    // Verificar estados
    const states = ['pending', 'pending_pickup', 'processing', 'ready_for_pickup', 'completed', 'cancelled'];
    console.log('📊 Distribución por Estado:');
    console.log('─'.repeat(60));
    
    for (const state of states) {
      const count = await client.fetch(
        `count(*[
          ((_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect"))
          && status == $state
        ])`,
        { state }
      );
      if (count > 0) {
        console.log(`   ${state}: ${count} órdenes`);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ Verificación completada exitosamente!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Inicia el servidor: npm run dev');
    console.log('   2. Visita: http://localhost:3000/click-collect-orders');
    console.log('   3. Visita: http://localhost:3000/dashboard');
    console.log('   4. Verifica que se muestren todas las órdenes\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\n💡 Verifica que:');
    console.log('   - Las variables de entorno estén configuradas');
    console.log('   - Tengas acceso a Sanity');
    console.log('   - El token de API sea válido\n');
    process.exit(1);
  }
}

verify();
