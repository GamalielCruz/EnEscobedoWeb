/**
 * Script automático para resolver el problema de caché
 */

require('dotenv').config();
const { createClient } = require('@sanity/client');
const fs = require('fs');
const path = require('path');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

async function fixCacheIssue() {
  console.log('\n🔧 Solucionando problema de caché de órdenes\n');
  console.log('═'.repeat(70));

  // Paso 1: Verificar órdenes en Sanity
  console.log('\n1️⃣  Verificando órdenes en Sanity...');
  console.log('─'.repeat(70));
  
  try {
    const clickCollectCount = await client.fetch(`count(*[_type == "clickCollectOrder"])`);
    const orderCount = await client.fetch(`count(*[_type == "order" && deliveryMethod == "click_collect"])`);
    const total = clickCollectCount + orderCount;

    console.log(`   clickCollectOrder: ${clickCollectCount}`);
    console.log(`   order (click_collect): ${orderCount}`);
    console.log(`   Total: ${total}`);

    if (total > 0) {
      console.log('\n   ⚠️  Hay órdenes en Sanity!');
      console.log('   Si quieres eliminarlas, hazlo desde Sanity Studio');
      console.log('   Luego ejecuta este script nuevamente\n');
      return;
    }

    console.log('   ✅ No hay órdenes en Sanity');

  } catch (error) {
    console.error('\n   ❌ Error verificando Sanity:', error.message);
    return;
  }

  // Paso 2: Limpiar caché del servidor
  console.log('\n2️⃣  Limpiando caché del servidor...');
  console.log('─'.repeat(70));

  const nextDir = path.join(process.cwd(), '.next');
  
  if (fs.existsSync(nextDir)) {
    try {
      fs.rmSync(nextDir, { recursive: true, force: true });
      console.log('   ✅ Caché de Next.js eliminado');
    } catch (error) {
      console.log(`   ⚠️  No se pudo eliminar: ${error.message}`);
    }
  } else {
    console.log('   ℹ️  No hay caché para limpiar');
  }

  // Paso 3: Instrucciones finales
  console.log('\n3️⃣  Próximos pasos manuales:');
  console.log('─'.repeat(70));
  console.log('   1. Reinicia el servidor:');
  console.log('      npm run dev');
  console.log('');
  console.log('   2. Limpia el caché del navegador:');
  console.log('      - Windows/Linux: Ctrl + Shift + R');
  console.log('      - Mac: Cmd + Shift + R');
  console.log('      - O usa modo incógnito');
  console.log('');
  console.log('   3. Visita la página:');
  console.log('      http://localhost:3000/click-collect-orders');
  console.log('');
  console.log('   4. Verifica que NO se muestren órdenes');

  console.log('\n' + '═'.repeat(70));
  console.log('\n✅ Proceso completado!\n');
}

fixCacheIssue();
