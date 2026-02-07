/**
 * Script para limpiar todo el caché
 */

const fs = require('fs');
const path = require('path');

console.log('\n🧹 Limpiando caché...\n');
console.log('═'.repeat(70));

const cacheDirs = [
  '.next',
  'node_modules/.cache',
];

let cleaned = 0;

cacheDirs.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  
  if (fs.existsSync(fullPath)) {
    console.log(`\n🗑️  Eliminando: ${dir}`);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`   ✅ Eliminado`);
      cleaned++;
    } catch (error) {
      console.log(`   ⚠️  No se pudo eliminar: ${error.message}`);
    }
  } else {
    console.log(`\n⏭️  Saltando: ${dir} (no existe)`);
  }
});

console.log('\n' + '═'.repeat(70));

if (cleaned > 0) {
  console.log('\n✅ Caché limpiado exitosamente!');
  console.log('\n📝 Próximos pasos:');
  console.log('   1. Reinicia el servidor: npm run dev');
  console.log('   2. Limpia el caché del navegador (Ctrl+Shift+R)');
  console.log('   3. Visita: http://localhost:3000/click-collect-orders');
  console.log('   4. Verifica que NO se muestren órdenes\n');
} else {
  console.log('\n⚠️  No se limpió ningún caché');
  console.log('   Los directorios ya estaban limpios\n');
}
