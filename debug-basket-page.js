/**
 * Script de diagnóstico para la página del carrito
 * Ejecutar en la consola del navegador en http://localhost:3000/basket
 */

console.log('🔍 DIAGNÓSTICO DE LA PÁGINA DEL CARRITO');
console.log('=====================================');

// Función para verificar el estado actual de la página
function diagnoseBasketPage() {
  console.log('\n📋 1. VERIFICANDO ESTADO INICIAL...');
  
  // Verificar URL
  if (!window.location.pathname.includes('/basket')) {
    console.error('❌ No estás en la página del carrito');
    console.log('🔗 Ve a: http://localhost:3000/basket');
    return false;
  }
  
  console.log('✅ Página del carrito detectada');
  
  // Verificar si hay productos en el carrito
  const cartItems = document.querySelectorAll('[class*="border rounded flex items-center"]');
  if (cartItems.length === 0) {
    console.warn('⚠️ El carrito parece estar vacío');
    console.log('💡 Agrega algunos productos al carrito primero');
  } else {
    console.log(`✅ ${cartItems.length} producto(s) en el carrito`);
  }
  
  return true;
}

// Función para verificar los botones de tipo de servicio
function checkServiceTypeButtons() {
  console.log('\n🏠 2. VERIFICANDO BOTONES DE TIPO DE SERVICIO...');
  
  const deliveryButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Entrega') && btn.textContent.includes('🏠')
  );
  
  const pickupButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Recoger') && btn.textContent.includes('🏪')
  );
  
  if (deliveryButton) {
    console.log('✅ Botón "🏠 Entrega" encontrado');
    console.log('📱 Estado:', deliveryButton.disabled ? 'Deshabilitado' : 'Habilitado');
    console.log('🎨 Clases CSS:', deliveryButton.className);
  } else {
    console.error('❌ Botón "🏠 Entrega" NO encontrado');
  }
  
  if (pickupButton) {
    console.log('✅ Botón "🏪 Recoger" encontrado');
  } else {
    console.error('❌ Botón "🏪 Recoger" NO encontrado');
  }
  
  return { deliveryButton, pickupButton };
}

// Función para activar el servicio de entrega
function activateDeliveryService() {
  console.log('\n🚀 3. ACTIVANDO SERVICIO DE ENTREGA...');
  
  const deliveryButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Entrega') && btn.textContent.includes('🏠')
  );
  
  if (deliveryButton && !deliveryButton.disabled) {
    console.log('📱 Haciendo clic en "🏠 Entrega"...');
    deliveryButton.click();
    
    setTimeout(() => {
      checkDeliveryInterface();
    }, 1000);
    
    return true;
  } else {
    console.error('❌ No se puede activar el servicio de entrega');
    return false;
  }
}

// Función para verificar la interfaz de entrega
function checkDeliveryInterface() {
  console.log('\n📍 4. VERIFICANDO INTERFAZ DE ENTREGA...');
  
  // Buscar el componente LocationAwareAddressInput
  const locationButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Usar mi ubicación') || btn.textContent.includes('ubicación')
  );
  
  if (locationButton) {
    console.log('✅ Botón "Usar mi ubicación" encontrado');
    console.log('📱 Estado:', locationButton.disabled ? 'Deshabilitado' : 'Habilitado');
    console.log('🎨 Clases CSS:', locationButton.className);
  } else {
    console.error('❌ Botón "Usar mi ubicación" NO encontrado');
    console.log('🔍 Buscando elementos relacionados...');
    
    // Buscar otros elementos relacionados
    const addressInputs = document.querySelectorAll('input[placeholder*="dirección"]');
    console.log(`📝 Inputs de dirección encontrados: ${addressInputs.length}`);
    
    const googleMapsElements = document.querySelectorAll('[class*="google"], [class*="maps"]');
    console.log(`🗺️ Elementos de Google Maps: ${googleMapsElements.length}`);
  }
  
  // Verificar si Google Maps está cargado
  if (window.google && window.google.maps) {
    console.log('✅ Google Maps API cargada');
  } else {
    console.warn('⚠️ Google Maps API no detectada');
  }
}

// Función para probar la detección de ubicación
function testLocationDetection() {
  console.log('\n🎯 5. PROBANDO DETECCIÓN DE UBICACIÓN...');
  
  const locationButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Usar mi ubicación') || btn.textContent.includes('ubicación')
  );
  
  if (locationButton && !locationButton.disabled) {
    console.log('📱 Haciendo clic en "Usar mi ubicación"...');
    console.log('⚠️ El navegador puede solicitar permisos de ubicación');
    
    locationButton.click();
    
    setTimeout(() => {
      checkForInteractiveMap();
    }, 3000);
  } else {
    console.error('❌ No se puede probar la detección de ubicación');
  }
}

// Función para verificar si aparece el mapa interactivo
function checkForInteractiveMap() {
  console.log('\n🗺️ 6. VERIFICANDO MAPA INTERACTIVO...');
  
  // Buscar el contenedor del mapa
  const mapContainer = document.querySelector('[class*="border-blue-200"]') ||
                      document.querySelector('[class*="bg-blue-50"]') ||
                      document.querySelector('div[style*="height"]');
  
  if (mapContainer) {
    console.log('✅ Contenedor del mapa encontrado');
    
    // Buscar elementos específicos del mapa
    const mapTitle = document.querySelector('h4');
    if (mapTitle && mapTitle.textContent.includes('Confirma tu Ubicación')) {
      console.log('✅ Título del mapa encontrado');
    }
    
    const adjustButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Ajustar')
    );
    
    if (adjustButton) {
      console.log('✅ Botón "Ajustar" encontrado');
    }
    
    const confirmButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Confirmar')
    );
    
    if (confirmButton) {
      console.log('✅ Botón "Confirmar" encontrado');
    }
    
  } else {
    console.error('❌ Mapa interactivo NO encontrado');
    console.log('💡 Posibles causas:');
    console.log('   • Permisos de ubicación no otorgados');
    console.log('   • Error en la carga de Google Maps');
    console.log('   • Problema con la detección de ubicación');
  }
}

// Función para mostrar el estado de los permisos
function checkPermissions() {
  console.log('\n🔐 7. VERIFICANDO PERMISOS...');
  
  if (navigator.permissions) {
    navigator.permissions.query({ name: 'geolocation' }).then(result => {
      console.log('📍 Permisos de geolocalización:', result.state);
      
      if (result.state === 'denied') {
        console.error('❌ Permisos de ubicación DENEGADOS');
        console.log('💡 Para solucionarlo:');
        console.log('   1. Haz clic en el ícono de ubicación en la barra de direcciones');
        console.log('   2. Selecciona "Permitir" para la ubicación');
        console.log('   3. Recarga la página');
      } else if (result.state === 'granted') {
        console.log('✅ Permisos de ubicación OTORGADOS');
      } else {
        console.log('⚠️ Permisos de ubicación PENDIENTES (se solicitarán al hacer clic)');
      }
    });
  } else {
    console.warn('⚠️ API de permisos no disponible en este navegador');
  }
  
  // Verificar geolocalización
  if (navigator.geolocation) {
    console.log('✅ API de geolocalización disponible');
  } else {
    console.error('❌ API de geolocalización NO disponible');
  }
}

// Función para mostrar información de depuración
function showDebugInfo() {
  console.log('\n🛠️ 8. INFORMACIÓN DE DEPURACIÓN...');
  
  console.log('🌐 Navegador:', navigator.userAgent);
  console.log('📍 Geolocalización:', navigator.geolocation ? 'Disponible' : 'No disponible');
  console.log('🔒 HTTPS:', location.protocol === 'https:' ? 'Sí' : 'No (puede afectar geolocalización)');
  console.log('🗺️ Google Maps:', window.google ? 'Cargado' : 'No cargado');
  
  // Verificar errores en consola
  const errors = [];
  const originalError = console.error;
  console.error = function(...args) {
    errors.push(args.join(' '));
    originalError.apply(console, args);
  };
  
  setTimeout(() => {
    if (errors.length > 0) {
      console.log('❌ Errores detectados:');
      errors.forEach(error => console.log('   •', error));
    } else {
      console.log('✅ No se detectaron errores recientes');
    }
  }, 1000);
}

// Función principal de diagnóstico
function runFullDiagnosis() {
  console.log('🚀 INICIANDO DIAGNÓSTICO COMPLETO...\n');
  
  if (diagnoseBasketPage()) {
    const buttons = checkServiceTypeButtons();
    checkPermissions();
    showDebugInfo();
    
    console.log('\n📋 INSTRUCCIONES PASO A PASO:');
    console.log('1. 🏠 Haz clic en el botón "Entrega"');
    console.log('2. 📍 Busca el botón "Usar mi ubicación"');
    console.log('3. 🔐 Permite permisos cuando se soliciten');
    console.log('4. 🗺️ Verifica que aparezca el minimapa');
    console.log('5. 🎯 Prueba los controles del mapa');
    
    console.log('\n🔧 FUNCIONES DISPONIBLES:');
    console.log('• activateDeliveryService() - Activar servicio de entrega');
    console.log('• testLocationDetection() - Probar detección de ubicación');
    console.log('• checkForInteractiveMap() - Verificar mapa interactivo');
    console.log('• checkPermissions() - Verificar permisos');
  }
}

// Exportar funciones para uso manual
window.basketDebug = {
  runFullDiagnosis,
  diagnoseBasketPage,
  checkServiceTypeButtons,
  activateDeliveryService,
  checkDeliveryInterface,
  testLocationDetection,
  checkForInteractiveMap,
  checkPermissions,
  showDebugInfo
};

// Ejecutar diagnóstico automáticamente
runFullDiagnosis();

console.log('\n🎯 DIAGNÓSTICO COMPLETADO');
console.log('Usa basketDebug.functionName() para ejecutar funciones específicas');