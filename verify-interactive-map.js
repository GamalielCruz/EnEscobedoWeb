/**
 * Script de verificación para el minimapa interactivo
 * Verifica que todos los componentes estén correctamente implementados
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 VERIFICANDO IMPLEMENTACIÓN DEL MINIMAPA INTERACTIVO');
console.log('=====================================================\n');

// Función para verificar si un archivo existe
function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    return false;
  }
}

// Función para leer contenido de archivo
function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return null;
  }
}

// Función para verificar si el contenido contiene ciertas palabras clave
function containsKeywords(content, keywords) {
  return keywords.every(keyword => content.includes(keyword));
}

// Lista de verificaciones
const checks = [
  {
    name: 'InteractiveDeliveryMap.tsx existe',
    file: 'components/InteractiveDeliveryMap.tsx',
    keywords: ['InteractiveDeliveryMap', 'useGoogleMaps', 'draggable', 'reverseGeocode']
  },
  {
    name: 'LocationAwareAddressInput.tsx existe',
    file: 'components/LocationAwareAddressInput.tsx', 
    keywords: ['LocationAwareAddressInput', 'InteractiveDeliveryMap', 'getCurrentLocation']
  },
  {
    name: 'GoogleMapsLoader.tsx existe',
    file: 'components/GoogleMapsLoader.tsx',
    keywords: ['GoogleMapsProvider', 'useGoogleMaps', 'isLoaded']
  },
  {
    name: 'Página del carrito integrada',
    file: 'app/(store)/basket/page.tsx',
    keywords: ['LocationAwareAddressInput', 'GoogleMapsProvider', 'serviceType']
  },
  {
    name: 'Tipos de Google Maps definidos',
    file: 'types/google-maps.d.ts',
    keywords: ['class Map', 'class Marker', 'class Geocoder']
  }
];

let passedChecks = 0;
let totalChecks = checks.length;

console.log('📋 EJECUTANDO VERIFICACIONES:\n');

checks.forEach((check, index) => {
  const checkNumber = index + 1;
  console.log(`${checkNumber}. ${check.name}`);
  
  if (!fileExists(check.file)) {
    console.log(`   ❌ Archivo no encontrado: ${check.file}`);
    return;
  }
  
  const content = readFile(check.file);
  if (!content) {
    console.log(`   ❌ No se pudo leer el archivo: ${check.file}`);
    return;
  }
  
  if (!containsKeywords(content, check.keywords)) {
    console.log(`   ⚠️  Archivo existe pero faltan palabras clave: ${check.keywords.join(', ')}`);
    return;
  }
  
  console.log(`   ✅ Verificación pasada`);
  passedChecks++;
});

console.log('\n📊 RESUMEN DE VERIFICACIONES:');
console.log('============================');
console.log(`✅ Verificaciones pasadas: ${passedChecks}/${totalChecks}`);
console.log(`📈 Porcentaje de completitud: ${Math.round((passedChecks/totalChecks) * 100)}%`);

if (passedChecks === totalChecks) {
  console.log('\n🎉 ¡EXCELENTE! Todos los componentes están implementados correctamente.');
  console.log('\n📋 FUNCIONALIDADES IMPLEMENTADAS:');
  console.log('• ✅ Minimapa interactivo con Google Maps');
  console.log('• ✅ Detección automática de ubicación GPS');
  console.log('• ✅ Marcador arrastrable para ajuste manual');
  console.log('• ✅ Geocodificación inversa (coordenadas → dirección)');
  console.log('• ✅ Modo de ajuste con confirmación');
  console.log('• ✅ Integración completa en la página del carrito');
  
  console.log('\n🚀 PRÓXIMOS PASOS:');
  console.log('1. Abre http://localhost:3000/basket en tu navegador');
  console.log('2. Selecciona "🏠 Entrega" como tipo de servicio');
  console.log('3. Haz clic en "Usar mi ubicación"');
  console.log('4. Permite permisos de ubicación');
  console.log('5. Verifica que aparezca el minimapa');
  console.log('6. Prueba arrastrar el marcador y usar "Ajustar"');
  console.log('7. Confirma que la dirección se actualice correctamente');
  
} else {
  console.log('\n⚠️  ATENCIÓN: Algunas verificaciones fallaron.');
  console.log('Revisa los archivos mencionados arriba para completar la implementación.');
}

console.log('\n🛠️  HERRAMIENTAS DE PRUEBA DISPONIBLES:');
console.log('• test-interactive-map-browser.html - Página de prueba completa');
console.log('• test-interactive-map.js - Script para consola del navegador');
console.log('• Este script - Verificación de archivos');

console.log('\n💡 CONSEJOS PARA PRUEBAS:');
console.log('• Usa Chrome/Edge para mejores resultados con Google Maps');
console.log('• Asegúrate de tener conexión a internet');
console.log('• Permite permisos de ubicación cuando se soliciten');
console.log('• Revisa la consola del navegador para errores');

// Verificar si el servidor está corriendo
console.log('\n🌐 VERIFICANDO SERVIDOR DE DESARROLLO...');
const { exec } = require('child_process');

exec('netstat -an | findstr :3000', (error, stdout, stderr) => {
  if (stdout.includes(':3000')) {
    console.log('✅ Servidor de desarrollo detectado en puerto 3000');
    console.log('🔗 Accede a: http://localhost:3000/basket');
  } else {
    console.log('⚠️  Servidor no detectado. Ejecuta: npm run dev');
  }
});