/**
 * Script para limpiar conflictos de Google Maps API
 * Ejecutar en la consola del navegador si hay errores de callback
 */

console.log('🔧 Limpiando conflictos de Google Maps API...');

// Limpiar callbacks globales conflictivos
const callbacksToClean = [
  'initGooglePlaces',
  'initSimpleAutocomplete',
  'initGoogleMaps'
];

callbacksToClean.forEach(callbackName => {
  if (window[callbackName]) {
    console.log(`🗑️ Eliminando callback conflictivo: ${callbackName}`);
    delete window[callbackName];
  }
});

// Limpiar scripts de Google Maps duplicados
const existingScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
console.log(`📜 Scripts de Google Maps encontrados: ${existingScripts.length}`);

existingScripts.forEach((script, index) => {
  if (index > 0) { // Mantener solo el primer script
    console.log(`🗑️ Eliminando script duplicado ${index + 1}`);
    script.remove();
  }
});

// Verificar estado de Google Maps
if (window.google && window.google.maps) {
  console.log('✅ Google Maps API está cargada correctamente');
  
  if (window.google.maps.places) {
    console.log('✅ Google Places API está disponible');
  } else {
    console.log('⚠️ Google Places API no está disponible');
  }
} else {
  console.log('❌ Google Maps API no está cargada');
}

// Función para recargar la página si es necesario
window.reloadPageClean = function() {
  console.log('🔄 Recargando página para limpiar completamente...');
  window.location.reload();
};

console.log('✅ Limpieza completada');
console.log('💡 Si sigues teniendo problemas, ejecuta: reloadPageClean()');

// Función para verificar el estado actual
window.checkGoogleMapsStatus = function() {
  console.log('🔍 Verificando estado de Google Maps...');
  
  const scripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
  console.log(`📜 Scripts activos: ${scripts.length}`);
  
  const callbacks = [];
  ['initGooglePlaces', 'initSimpleAutocomplete', 'initGoogleMaps'].forEach(name => {
    if (window[name]) callbacks.push(name);
  });
  
  console.log(`🔗 Callbacks activos: ${callbacks.length > 0 ? callbacks.join(', ') : 'ninguno'}`);
  
  if (window.google?.maps?.places) {
    console.log('✅ Google Places está funcionando correctamente');
  } else {
    console.log('❌ Google Places no está disponible');
  }
};

// Exportar funciones útiles
console.log('🛠️ Funciones disponibles:');
console.log('- checkGoogleMapsStatus() - Verificar estado actual');
console.log('- reloadPageClean() - Recargar página limpia');