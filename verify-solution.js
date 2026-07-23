/**
 * Script de verificación completa de la solución
 */

require('dotenv').config();
const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  apiVersion: '2024-01-01',
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
});

async function verify() {
  console.log('\n✅ Verificación Completa de la Solución\n');
  console.log('═'.repeat(70));

  let allGood = true;

  // 1. Verificar Sanity
  console.log('\n1️⃣  Verificando Sanity...');
  console.log('─'.repeat(70));
  
  try {
    const clickCollectCount = await client.fetch(`count(*[_type == "clickCollectOrder"])`);
    const orderCount = await client.fetch(`count(*[_type == "order" && deliveryMethod == "click_collect"])`);
    const total = clickCollectCount + orderCount;

    if (total === 0) {
      console.log('   ✅ No hay órdenes en Sanity');
    } else {
      console.log(`   ❌ Hay ${total} órdenes en Sanity`);
      console.log('   Ejecuta: node delete-all-orders.js');
      allGood = false;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    allGood = false;
  }

  // 2. Verificar archivos modificados
  console.log('\n2️⃣  Verificando archivos modificados...');
  console.log('─'.repeat(70));
  
  const fs = require('fs');
  const filesToCheck = [
    'app/api/click-collect-orders/route.ts',
    'app/api/dashboard/store-orders/route.ts',
    'components/ClickCollectOrdersAdmin.tsx',
    'app/(admin)/click-collect-orders/page.tsx',
  ];

  filesToCheck.forEach(file => {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      // Verificar headers no-cache en APIs
      if (file.includes('route.ts')) {
        if (content.includes('Cache-Control') && content.includes('no-store')) {
          console.log(`   ✅ ${file} - Headers no-cache configurados`);
        } else {
          console.log(`   ❌ ${file} - Faltan headers no-cache`);
          allGood = false;
        }
      }
      
      // Verificar fetch con timestamp en componente
      if (file.includes('ClickCollectOrdersAdmin')) {
        if (content.includes('Date.now()') && content.includes('cache:')) {
          console.log(`   ✅ ${file} - Fetch sin caché configurado`);
        } else {
          console.log(`   ⚠️  ${file} - Verificar configuración de fetch`);
        }
      }
      
      // Verificar dynamic en página
      if (file.includes('page.tsx') && file.includes('click-collect-orders')) {
        if (content.includes('force-dynamic')) {
          console.log(`   ✅ ${file} - Dynamic rendering configurado`);
        } else {
          console.log(`   ⚠️  ${file} - Verificar dynamic rendering`);
        }
      }
    } else {
      console.log(`   ❌ ${file} - No encontrado`);
      allGood = false;
    }
  });

  // 3. Verificar caché del servidor
  console.log('\n3️⃣  Verificando caché del servidor...');
  console.log('─'.repeat(70));
  
  if (fs.existsSync('.next')) {
    console.log('   ⚠️  Directorio .next existe');
    console.log('   Recomendación: Remove-Item -Recurse -Force .next');
  } else {
    console.log('   ✅ No hay caché del servidor');
  }

  // 4. Resumen
  console.log('\n' + '═'.repeat(70));
  
  if (allGood) {
    console.log('\n🎉 ¡TODO ESTÁ CORRECTO!');
    console.log('\n📝 Próximos pasos:');
    console.log('   1. Asegúrate de que el servidor esté corriendo: npm run dev');
    console.log('   2. Abre en modo incógnito: http://localhost:3000/click-collect-orders');
    console.log('   3. Verifica que NO aparezcan órdenes');
    console.log('   4. Si funciona, limpia el caché del navegador normal\n');
  } else {
    console.log('\n⚠️  HAY PROBLEMAS QUE RESOLVER');
    console.log('\n📝 Acciones requeridas:');
    console.log('   1. Revisa los errores arriba');
    console.log('   2. Ejecuta los comandos sugeridos');
    console.log('   3. Vuelve a ejecutar: node verify-solution.js\n');
  }
}

verify();
