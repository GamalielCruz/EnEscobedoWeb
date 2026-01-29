/**
 * Script para probar la nueva funcionalidad de detección de ubicación
 * Ejecutar en la consola del navegador en http://localhost:3000/basket
 */

console.log('🧪 PROBANDO DETECCIÓN DE UBICACIÓN');
console.log('==================================');

// Función para verificar la nueva interfaz
function verifyNewInterface() {
  console.log('\n🎨 1. VERIFICANDO NUEVA INTERFAZ...');
  
  // Verificar que estamos en la página correcta
  if (!window.location.pathname.includes('/basket')) {
    console.error('❌ Esta prueba debe ejecutarse en la página /basket');
    console.log('🔗 Navega a: http://localhost:3000/basket');
    return false;
  }
  
  console.log('✅ Página correcta detectada');
  
  // Verificar botones de servicio mejorados
  const serviceButtons = document.querySelectorAll('button');
  const deliveryButton = Array.from(serviceButtons).find(btn => 
    btn.textContent.includes('Entrega') && btn.textContent.includes('🏠')
  );
  
  if (deliveryButton) {
    console.log('✅ Botón de entrega mejorado encontrado');
    return true;
  } else {
    console.error('❌ Botón de entrega mejorado no encontrado');
    return false;
  }
}

// Función para probar la selección de entrega
function testDeliverySelection() {
  console.log('\n🏠 2. PROBANDO SELECCIÓN DE ENTREGA...');
  
  const serviceButtons = document.querySelectorAll('button');
  const deliveryButton = Array.from(serviceButtons).find(btn => 
    btn.textContent.includes('Entrega') && btn.textContent.includes('🏠')
  );
  
  if (deliveryButton) {
    console.log('📱 Haciendo clic en "Entrega"...');
    deliveryButton.click();
    
    // Esperar un momento para que aparezcan los controles
    setTimeout(() => {
      testLocationControls();
    }, 1000);
  } else {
    console.error('❌ No se encontró el botón de entrega');
  }
}

// Función para probar los controles de ubicación
function testLocationControls() {
  console.log('\n📍 3. PROBANDO CONTROLES DE UBICACIÓN...');
  
  // Buscar el botón "Usar mi ubicación"
  const locationButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Usar mi ubicación') || btn.textContent.includes('ubicación')
  );
  
  if (locationButton) {
    console.log('✅ Botón "Usar mi ubicación" encontrado');
    
    // Verificar si está habilitado
    if (locationButton.disabled) {
      console.log('⚠️ Botón deshabilitado - puede estar cargando');
    } else {
      console.log('✅ Botón habilitado y listo para usar');
    }
  } else {
    console.error('❌ Botón "Usar mi ubicación" no encontrado');
  }
  
  // Buscar el botón "Manual"
  const manualButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Manual')
  );
  
  if (manualButton) {
    console.log('✅ Botón "Manual" encontrado');
  } else {
    console.error('❌ Botón "Manual" no encontrado');
  }
  
  // Buscar el input de dirección
  const addressInput = document.querySelector('input[placeholder*="dirección"]') ||
                      document.querySelector('input[placeholder*="Febrero"]');
  
  if (addressInput) {
    console.log('✅ Input de dirección encontrado');
    testAddressInput(addressInput);
  } else {
    console.error('❌ Input de dirección no encontrado');
  }
}

// Función para probar el input de dirección
function testAddressInput(input) {
  console.log('\n🗺️ 4. PROBANDO INPUT DE DIRECCIÓN...');
  
  // Verificar estado del input
  if (input.disabled) {
    console.log('⏳ Input deshabilitado - esperando carga de Google Maps...');
    
    // Esperar hasta que se habilite
    const checkEnabled = setInterval(() => {
      if (!input.disabled) {
        clearInterval(checkEnabled);
        console.log('✅ Input habilitado - Google Maps cargado');
        testAutocomplete(input);
      }
    }, 500);
    
    // Timeout después de 10 segundos
    setTimeout(() => {
      clearInterval(checkEnabled);
      if (input.disabled) {
        console.log('⚠️ Timeout esperando Google Maps - funcionalidad manual disponible');
      }
    }, 10000);
  } else {
    console.log('✅ Input habilitado - probando autocompletado');
    testAutocomplete(input);
  }
}

// Función para probar el autocompletado
function testAutocomplete(input) {
  console.log('\n🎯 5. PROBANDO AUTOCOMPLETADO...');
  
  // Simular escritura en el input
  input.focus();
  input.value = 'Calle Hidalgo 123, Pedro Escobedo';
  
  // Disparar eventos
  const inputEvent = new Event('input', { bubbles: true });
  const changeEvent = new Event('change', { bubbles: true });
  input.dispatchEvent(inputEvent);
  input.dispatchEvent(changeEvent);
  
  console.log('📝 Texto ingresado en el input');
  
  // Verificar si Google Maps está disponible
  if (window.google && window.google.maps && window.google.maps.places) {
    console.log('✅ Google Maps API está disponible');
    console.log('🎯 Si ves sugerencias de Google, el autocompletado funciona correctamente');
  } else {
    console.log('⚠️ Google Maps API no está disponible - usando entrada manual');
  }
}

// Función para probar la detección de ubicación
function testLocationDetection() {
  console.log('\n🌍 6. PROBANDO DETECCIÓN DE UBICACIÓN...');
  
  if (navigator.geolocation) {
    console.log('✅ Geolocalización disponible en el navegador');
    
    // Buscar y hacer clic en el botón de ubicación
    const locationButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Usar mi ubicación') || btn.textContent.includes('ubicación')
    );
    
    if (locationButton && !locationButton.disabled) {
      console.log('🎯 Haciendo clic en "Usar mi ubicación"...');
      console.log('💡 El navegador puede pedir permisos de ubicación');
      locationButton.click();
    } else {
      console.log('⚠️ Botón de ubicación no disponible o deshabilitado');
    }
  } else {
    console.log('❌ Geolocalización no disponible en este navegador');
  }
}

// Función para mostrar resumen de mejoras
function showImprovements() {
  console.log('\n🎉 MEJORAS IMPLEMENTADAS:');
  console.log('========================');
  console.log('✅ Botón "Usar mi ubicación" - Detección automática');
  console.log('✅ Botón "Manual" - Opción de entrada manual');
  console.log('✅ UI mejorada - Botones más atractivos y claros');
  console.log('✅ Autocompletado Google Places - Sugerencias en tiempo real');
  console.log('✅ Geocodificación inversa - Convierte coordenadas a direcciones');
  console.log('✅ Fallback robusto - Funciona sin Google Maps');
  console.log('✅ Estados visuales - Feedback claro para el usuario');
  
  console.log('\n🎯 FUNCIONALIDADES:');
  console.log('• Detectar ubicación automáticamente');
  console.log('• Autocompletado de direcciones');
  console.log('• Entrada manual como respaldo');
  console.log('• Interfaz amigable y moderna');
}

// Función principal de prueba
function runLocationTest() {
  console.log('🚀 INICIANDO PRUEBA DE UBICACIÓN...\n');
  
  if (verifyNewInterface()) {
    testDeliverySelection();
    
    // Esperar un poco y luego probar detección de ubicación
    setTimeout(() => {
      testLocationDetection();
    }, 3000);
  }
  
  showImprovements();
}

// Ejecutar automáticamente
runLocationTest();

// Exportar funciones para uso manual
window.locationTest = {
  runLocationTest,
  testLocationDetection,
  testDeliverySelection,
  showImprovements
};

console.log('\n🛠️ FUNCIONES DISPONIBLES:');
console.log('• locationTest.runLocationTest() - Ejecutar prueba completa');
console.log('• locationTest.testLocationDetection() - Probar detección de ubicación');
console.log('• locationTest.testDeliverySelection() - Probar selección de entrega');
console.log('• locationTest.showImprovements() - Mostrar mejoras implementadas');

console.log('\n🏁 PRUEBA INICIADA - Revisa los resultados y prueba manualmente');