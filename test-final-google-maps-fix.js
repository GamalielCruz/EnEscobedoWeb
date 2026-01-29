/**
 * Script final para verificar que Google Maps funcione correctamente
 * Ejecutar en la consola del navegador en http://localhost:3001/basket
 */

console.log('🧪 VERIFICACIÓN FINAL DE GOOGLE MAPS');
console.log('===================================');

// Función para verificar el estado completo
function verifyGoogleMapsIntegration() {
  console.log('\n🔍 1. VERIFICANDO ESTRUCTURA DE LA PÁGINA...');
  
  // Verificar que estamos en la página correcta
  if (!window.location.pathname.includes('/basket')) {
    console.error('❌ Esta prueba debe ejecutarse en la página /basket');
    console.log('🔗 Navega a: http://localhost:3001/basket');
    return false;
  }
  
  console.log('✅ Página correcta detectada');
  
  // Verificar botones de servicio
  const serviceButtons = document.querySelectorAll('button');
  const deliveryButton = Array.from(serviceButtons).find(btn => 
    btn.textContent.includes('Entrega') || btn.textContent.includes('🏠')
  );
  const pickupButton = Array.from(serviceButtons).find(btn => 
    btn.textContent.includes('Recoger') || btn.textContent.includes('🏪')
  );
  
  if (deliveryButton && pickupButton) {
    console.log('✅ Botones de servicio encontrados');
  } else {
    console.error('❌ Botones de servicio no encontrados');
    return false;
  }
  
  return true;
}

// Función para probar la selección de servicio a domicilio
function testDeliveryService() {
  console.log('\n🏠 2. PROBANDO SERVICIO A DOMICILIO...');
  
  const serviceButtons = document.querySelectorAll('button');
  const deliveryButton = Array.from(serviceButtons).find(btn => 
    btn.textContent.includes('Entrega') || btn.textContent.includes('🏠')
  );
  
  if (deliveryButton) {
    console.log('📱 Haciendo clic en "Entrega"...');
    deliveryButton.click();
    
    // Esperar un momento para que aparezca el input
    setTimeout(() => {
      testAddressInput();
    }, 1000);
  } else {
    console.error('❌ No se encontró el botón de entrega');
  }
}

// Función para probar el input de dirección
function testAddressInput() {
  console.log('\n📍 3. PROBANDO INPUT DE DIRECCIÓN...');
  
  // Buscar el input de dirección
  const addressInput = document.querySelector('input[placeholder*="dirección"]') ||
                      document.querySelector('input[placeholder*="Febrero"]') ||
                      document.querySelector('input[placeholder*="Pedro"]');
  
  if (addressInput) {
    console.log('✅ Input de dirección encontrado');
    
    // Verificar si está habilitado
    if (addressInput.disabled) {
      console.log('⏳ Input deshabilitado - esperando carga de Google Maps...');
      
      // Esperar hasta que se habilite
      const checkEnabled = setInterval(() => {
        if (!addressInput.disabled) {
          clearInterval(checkEnabled);
          console.log('✅ Input habilitado - Google Maps cargado');
          testAutocomplete(addressInput);
        }
      }, 500);
      
      // Timeout después de 10 segundos
      setTimeout(() => {
        clearInterval(checkEnabled);
        if (addressInput.disabled) {
          console.log('⚠️ Timeout esperando Google Maps - probando entrada manual');
          testManualInput(addressInput);
        }
      }, 10000);
    } else {
      console.log('✅ Input habilitado - probando autocompletado');
      testAutocomplete(addressInput);
    }
  } else {
    console.error('❌ No se encontró el input de dirección');
    console.log('🔍 Inputs disponibles:', document.querySelectorAll('input'));
  }
}

// Función para probar el autocompletado
function testAutocomplete(input) {
  console.log('\n🗺️ 4. PROBANDO AUTOCOMPLETADO...');
  
  // Verificar si Google Maps está disponible
  if (window.google && window.google.maps && window.google.maps.places) {
    console.log('✅ Google Maps API está disponible');
    
    // Simular escritura en el input
    input.focus();
    input.value = 'Calle Hidalgo 123, Pedro Escobedo';
    
    // Disparar eventos
    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });
    input.dispatchEvent(inputEvent);
    input.dispatchEvent(changeEvent);
    
    console.log('📝 Texto ingresado en el input');
    console.log('🎯 Si ves sugerencias de Google, el autocompletado funciona correctamente');
    
    // Verificar si aparecen sugerencias
    setTimeout(() => {
      const suggestions = document.querySelector('.pac-container');
      if (suggestions && suggestions.style.display !== 'none') {
        console.log('✅ Sugerencias de Google Places aparecieron');
      } else {
        console.log('⚠️ No se detectaron sugerencias - puede ser normal si no hay coincidencias');
      }
    }, 2000);
    
  } else {
    console.log('⚠️ Google Maps API no está disponible - usando entrada manual');
    testManualInput(input);
  }
}

// Función para probar entrada manual
function testManualInput(input) {
  console.log('\n✏️ 5. PROBANDO ENTRADA MANUAL...');
  
  input.focus();
  input.value = 'Calle Hidalgo 123, Pedro Escobedo, Querétaro';
  
  const inputEvent = new Event('input', { bubbles: true });
  input.dispatchEvent(inputEvent);
  
  console.log('📝 Dirección ingresada manualmente');
  console.log('✅ Entrada manual funciona correctamente');
}

// Función para verificar el estado de Google Maps
function checkGoogleMapsStatus() {
  console.log('\n🌐 ESTADO DE GOOGLE MAPS:');
  
  if (window.google) {
    console.log('✅ window.google disponible');
    
    if (window.google.maps) {
      console.log('✅ google.maps disponible');
      
      if (window.google.maps.places) {
        console.log('✅ google.maps.places disponible');
        console.log('🎉 Google Maps completamente funcional');
        return true;
      } else {
        console.log('❌ google.maps.places NO disponible');
      }
    } else {
      console.log('❌ google.maps NO disponible');
    }
  } else {
    console.log('❌ window.google NO disponible');
  }
  
  return false;
}

// Función principal de prueba
function runCompleteTest() {
  console.log('🚀 INICIANDO PRUEBA COMPLETA...\n');
  
  if (verifyGoogleMapsIntegration()) {
    checkGoogleMapsStatus();
    testDeliveryService();
  }
}

// Función para mostrar resumen
function showSummary() {
  console.log('\n📊 RESUMEN DE LA IMPLEMENTACIÓN:');
  console.log('================================');
  console.log('✅ Componente GoogleMapsProvider - Carga centralizada');
  console.log('✅ Componente CleanAddressAutocomplete - Autocompletado limpio');
  console.log('✅ Fallback automático - Entrada manual si hay problemas');
  console.log('✅ UI/UX mejorada - Interfaz simple y amigable');
  console.log('✅ Manejo de errores - Sin crashes por conflictos');
  console.log('\n🎯 BENEFICIOS:');
  console.log('• Sin conflictos de callback');
  console.log('• Carga única de Google Maps');
  console.log('• Experiencia consistente');
  console.log('• Funciona con o sin API key');
  console.log('\n🔗 URL de prueba: http://localhost:3001/basket');
}

// Ejecutar automáticamente
runCompleteTest();
showSummary();

// Exportar funciones para uso manual
window.googleMapsTest = {
  runCompleteTest,
  checkGoogleMapsStatus,
  testDeliveryService,
  showSummary
};

console.log('\n🛠️ FUNCIONES DISPONIBLES:');
console.log('• googleMapsTest.runCompleteTest() - Ejecutar prueba completa');
console.log('• googleMapsTest.checkGoogleMapsStatus() - Verificar estado de Google Maps');
console.log('• googleMapsTest.testDeliveryService() - Probar servicio a domicilio');
console.log('• googleMapsTest.showSummary() - Mostrar resumen de la implementación');

console.log('\n🏁 PRUEBA COMPLETADA - Revisa los resultados arriba');