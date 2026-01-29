/**
 * Script de prueba para verificar el autocompletado de direcciones
 * Ejecutar en la consola del navegador en http://localhost:3000/basket
 */

console.log('🧪 Iniciando pruebas de autocompletado de direcciones...');

// Función para simular la selección de servicio a domicilio
function testDeliveryServiceSelection() {
  console.log('📦 Probando selección de servicio a domicilio...');
  
  // Buscar el botón de "Servicio a Domicilio"
  const deliveryButton = document.querySelector('button:contains("Servicio a Domicilio")') || 
                        Array.from(document.querySelectorAll('button')).find(btn => 
                          btn.textContent.includes('Servicio a Domicilio')
                        );
  
  if (deliveryButton) {
    console.log('✅ Botón de servicio a domicilio encontrado');
    deliveryButton.click();
    
    setTimeout(() => {
      testAddressAutocomplete();
    }, 1000);
  } else {
    console.error('❌ No se encontró el botón de servicio a domicilio');
  }
}

// Función para probar el autocompletado de direcciones
function testAddressAutocomplete() {
  console.log('🗺️ Probando autocompletado de direcciones...');
  
  // Buscar el input de Google Places
  const addressInput = document.querySelector('#google-places-input') || 
                      document.querySelector('input[placeholder*="dirección"]') ||
                      document.querySelector('input[placeholder*="Hidalgo"]');
  
  if (addressInput) {
    console.log('✅ Input de dirección encontrado:', addressInput);
    
    // Simular escritura en el input
    addressInput.focus();
    addressInput.value = 'Calle Hidalgo 123, Pedro Escobedo';
    
    // Disparar eventos de input
    const inputEvent = new Event('input', { bubbles: true });
    addressInput.dispatchEvent(inputEvent);
    
    console.log('📝 Texto ingresado en el input de dirección');
    
    // Verificar si Google Places está cargado
    setTimeout(() => {
      if (window.google && window.google.maps && window.google.maps.places) {
        console.log('✅ Google Places API está cargada');
        console.log('🎯 El autocompletado debería estar funcionando');
      } else {
        console.warn('⚠️ Google Places API no está cargada');
        console.log('💡 Verificar la API key en las variables de entorno');
      }
    }, 2000);
    
  } else {
    console.error('❌ No se encontró el input de dirección');
    console.log('🔍 Inputs disponibles:', document.querySelectorAll('input'));
  }
}

// Función para verificar la estructura de la página
function verifyPageStructure() {
  console.log('🔍 Verificando estructura de la página...');
  
  const serviceButtons = document.querySelectorAll('button');
  console.log(`📊 Botones encontrados: ${serviceButtons.length}`);
  
  serviceButtons.forEach((btn, index) => {
    if (btn.textContent.includes('Domicilio') || btn.textContent.includes('Tienda')) {
      console.log(`✅ Botón ${index + 1}: "${btn.textContent.trim()}"`);
    }
  });
  
  const inputs = document.querySelectorAll('input');
  console.log(`📊 Inputs encontrados: ${inputs.length}`);
  
  inputs.forEach((input, index) => {
    console.log(`📝 Input ${index + 1}: placeholder="${input.placeholder}", id="${input.id}"`);
  });
}

// Función principal de prueba
function runAddressAutocompleteTest() {
  console.log('🚀 Ejecutando prueba completa de autocompletado...');
  
  // Verificar que estamos en la página correcta
  if (!window.location.pathname.includes('/basket')) {
    console.error('❌ Esta prueba debe ejecutarse en la página /basket');
    console.log('🔗 Navega a: http://localhost:3000/basket');
    return;
  }
  
  console.log('✅ Página correcta detectada');
  
  // Verificar estructura
  verifyPageStructure();
  
  // Esperar un poco y luego probar la selección de servicio
  setTimeout(() => {
    testDeliveryServiceSelection();
  }, 1000);
}

// Ejecutar la prueba
runAddressAutocompleteTest();

// Exportar funciones para uso manual
window.testAddressAutocomplete = {
  runTest: runAddressAutocompleteTest,
  testDelivery: testDeliveryServiceSelection,
  testAutocomplete: testAddressAutocomplete,
  verifyStructure: verifyPageStructure
};

console.log('💡 Funciones disponibles:');
console.log('- testAddressAutocomplete.runTest() - Ejecutar prueba completa');
console.log('- testAddressAutocomplete.testDelivery() - Probar selección de servicio');
console.log('- testAddressAutocomplete.testAutocomplete() - Probar autocompletado');
console.log('- testAddressAutocomplete.verifyStructure() - Verificar estructura');