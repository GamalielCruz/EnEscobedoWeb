/**
 * Script de diagnóstico para Google Maps API
 * Ejecutar en la consola del navegador para identificar problemas
 */

console.log('🔍 DIAGNÓSTICO DE GOOGLE MAPS API');
console.log('================================');

// 1. Verificar API Key
const apiKeyElement = document.querySelector('script[src*="maps.googleapis.com"]');
if (apiKeyElement) {
  const src = apiKeyElement.src;
  const keyMatch = src.match(/key=([^&]+)/);
  const key = keyMatch ? keyMatch[1] : 'No encontrada';
  console.log(`🔑 API Key: ${key.substring(0, 10)}...${key.substring(key.length - 10)}`);
  
  // Verificar si la key parece válida
  if (key.length < 30) {
    console.warn('⚠️ La API Key parece ser muy corta');
  }
} else {
  console.error('❌ No se encontró script de Google Maps cargado');
}

// 2. Verificar scripts cargados
const scripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
console.log(`📜 Scripts de Google Maps encontrados: ${scripts.length}`);

scripts.forEach((script, index) => {
  console.log(`   ${index + 1}. ${script.src}`);
});

if (scripts.length > 1) {
  console.warn('⚠️ Múltiples scripts de Google Maps detectados - esto puede causar conflictos');
}

// 3. Verificar estado de carga
console.log('\n🌐 ESTADO DE GOOGLE MAPS:');
if (window.google) {
  console.log('✅ window.google está disponible');
  
  if (window.google.maps) {
    console.log('✅ google.maps está disponible');
    
    if (window.google.maps.places) {
      console.log('✅ google.maps.places está disponible');
      console.log('🎉 Google Maps API está completamente cargada');
    } else {
      console.error('❌ google.maps.places NO está disponible');
    }
  } else {
    console.error('❌ google.maps NO está disponible');
  }
} else {
  console.error('❌ window.google NO está disponible');
}

// 4. Verificar callbacks globales
console.log('\n🔗 CALLBACKS GLOBALES:');
const possibleCallbacks = [
  'initGooglePlaces',
  'initSimpleAutocomplete', 
  'initGoogleMaps',
  'googleMapsCallback'
];

let callbacksFound = 0;
possibleCallbacks.forEach(callback => {
  if (window[callback]) {
    console.log(`✅ ${callback} existe`);
    callbacksFound++;
  }
});

if (callbacksFound === 0) {
  console.log('✅ No hay callbacks globales (esto es bueno)');
} else if (callbacksFound > 1) {
  console.warn(`⚠️ ${callbacksFound} callbacks encontrados - posibles conflictos`);
}

// 5. Verificar errores en consola
console.log('\n🐛 VERIFICACIÓN DE ERRORES:');
const originalError = console.error;
let errorCount = 0;

console.error = function(...args) {
  if (args.some(arg => typeof arg === 'string' && arg.includes('google'))) {
    errorCount++;
  }
  originalError.apply(console, args);
};

setTimeout(() => {
  console.error = originalError;
  if (errorCount > 0) {
    console.warn(`⚠️ ${errorCount} errores relacionados con Google detectados`);
  } else {
    console.log('✅ No se detectaron errores de Google Maps');
  }
}, 1000);

// 6. Probar creación de Autocomplete
console.log('\n🧪 PRUEBA DE AUTOCOMPLETE:');
if (window.google?.maps?.places) {
  try {
    // Crear un input temporal para probar
    const testInput = document.createElement('input');
    document.body.appendChild(testInput);
    
    const testAutocomplete = new window.google.maps.places.Autocomplete(testInput, {
      types: ['address'],
      componentRestrictions: { country: 'mx' }
    });
    
    console.log('✅ Autocomplete se puede crear correctamente');
    
    // Limpiar
    document.body.removeChild(testInput);
  } catch (error) {
    console.error('❌ Error creando Autocomplete:', error);
  }
} else {
  console.log('⏳ Google Places no está disponible para probar');
}

// 7. Recomendaciones
console.log('\n💡 RECOMENDACIONES:');

if (scripts.length === 0) {
  console.log('1. ❌ No hay scripts de Google Maps - verificar API Key en variables de entorno');
}

if (scripts.length > 1) {
  console.log('2. ⚠️ Múltiples scripts detectados - ejecutar fix-google-maps-conflicts.js');
}

if (!window.google?.maps?.places) {
  console.log('3. 🔄 Google Maps no está cargado - recargar la página');
}

if (callbacksFound > 1) {
  console.log('4. 🧹 Múltiples callbacks - limpiar callbacks conflictivos');
}

// 8. Funciones de utilidad
window.fixGoogleMapsIssues = function() {
  console.log('🔧 Intentando arreglar problemas de Google Maps...');
  
  // Limpiar callbacks duplicados
  possibleCallbacks.forEach(callback => {
    if (window[callback]) {
      delete window[callback];
      console.log(`🗑️ Eliminado callback: ${callback}`);
    }
  });
  
  // Remover scripts duplicados (mantener solo el primero)
  const allScripts = document.querySelectorAll('script[src*="maps.googleapis.com"]');
  for (let i = 1; i < allScripts.length; i++) {
    allScripts[i].remove();
    console.log(`🗑️ Eliminado script duplicado ${i + 1}`);
  }
  
  console.log('✅ Limpieza completada - recarga la página si es necesario');
};

console.log('\n🛠️ FUNCIONES DISPONIBLES:');
console.log('- fixGoogleMapsIssues() - Intentar arreglar problemas automáticamente');
console.log('- location.reload() - Recargar página completamente');

console.log('\n================================');
console.log('🏁 DIAGNÓSTICO COMPLETADO');