/**
 * Reset completo del proyecto para eliminar todo el caché
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n🔄 Reset Completo del Proyecto\n');
console.log('═'.repeat(70));

// 1. Matar procesos de Node
console.log('\n1️⃣  Deteniendo procesos de Node.js...');
try {
  if (process.platform === 'win32') {
    execSync('taskkill /F /IM node.exe', { stdio: 'ignore' });
  } else {
    execSync('pkill -9 node', { stdio: 'ignore' });
  }
  console.log('   ✅ Procesos detenidos');
} catch (e) {
  console.log('   ℹ️  No hay procesos corriendo');
}

// 2. Eliminar directorios de caché
console.log('\n2️⃣  Eliminando caché...');
const dirsToDelete = [
  '.next',
  'node_modules/.cache',
  '.turbo',
];

dirsToDelete.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`   ✅ ${dir} eliminado`);
    } catch (e) {
      console.log(`   ⚠️  No se pudo eliminar ${dir}`);
    }
  }
});

// 3. Verificar Sanity
console.log('\n3️⃣  Verificando Sanity...');
console.log('   Ejecuta: node check-deleted-orders.js');

console.log('\n' + '═'.repeat(70));
console.log('\n✅ Reset completado!');
console.log('\n📝 Próximos pasos:');
console.log('   1. Verifica Sanity: node check-deleted-orders.js');
console.log('   2. Inicia el servidor: npm run dev');
console.log('   3. Abre en modo incógnito: http://localhost:3000/click-collect-orders');
console.log('   4. Si sigue mostrando órdenes, limpia el caché del navegador:');
console.log('      - Abre DevTools (F12)');
console.log('      - Application > Storage > Clear site data');
console.log('      - O usa: Ctrl+Shift+Delete > Clear browsing data\n');
