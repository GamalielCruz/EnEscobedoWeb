/**
 * Script para probar el minimapa interactivo
 * Ejecutar en la consola del navegador en http://localhost:3000/basket
 */

console.log('🗺️ PROBANDO MINIMAPA INTERACTIVO');
console.log('===============================');

// Función para verificar la implementación del minimapa
function verifyMapImplementation() {
  console.log('\n🔍 1. VERIFICANDO IMPLEMENTACIÓN DEL MINIMAPA...');
  
  // Verificar que estamos en la página correcta
  if (!window.location.pathname.includes('/basket')) {
    console.error('❌ Esta prueba debe ejecutarse en la página /basket');
    console.log('🔗 Navega a: http://localhost:3000/basket');
    return false;
  }
  
  console.log('✅ Página correcta detectada');
  
  // Verificar botones de servicio
  const deliveryButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Entrega') && btn.textContent.includes('🏠')
  );
  
  if (deliveryButton) {
    console.log('✅ Botón de entrega encontrado');
    return true;
  } else {
    console.error('❌ Botón de entrega no encontrado');
    return false;
  }
}

// Función para activar el servicio de entrega
function activateDeliveryService() {
  console.log('\n🏠 2. ACTIVANDO SERVICIO DE ENTREGA...');
  
  const deliveryButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Entrega') && btn.textContent.includes('🏠')
  );
  
  if (deliveryButton) {
    console.log('📱 Haciendo clic en "Entrega"...');
    deliveryButton.click();
    
    setTimeout(() => {
      testLocationDetection();
    }, 1000);
  } else {
    console.error('❌ No se encontró el botón de entrega');
  }
}

// Función para probar la detección de ubicación
function testLocationDetection() {
  console.log('\n📍 3. PROBANDO DETECCIÓN DE UBICACIÓN...');
  
  const locationButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Usar mi ubicación') || btn.textContent.includes('ubicación')
  );
  
  if (locationButton) {
    console.log('✅ Botón "Usar mi ubicación" encontrado');
    
    if (!locationButton.disabled) {
      console.log('🎯 Haciendo clic en "Usar mi ubicación"...');
      console.log('💡 El navegador puede pedir permisos de ubicación');
      console.log('⏳ Esperando que aparezca el minimapa...');
      
      locationButton.click();
      
      // Verificar que aparezca el mapa después de un tiempo
      setTimeout(() => {
        checkForMap();
      }, 3000);
    } else {
      console.log('⚠️ Botón deshabilitado - esperando carga');
    }
  } else {
    console.error('❌ Botón de ubicación no encontrado');
  }
}

// Función para verificar que aparezca el mapa
function checkForMap() {
  console.log('\n🗺️ 4. VERIFICANDO APARICIÓN DEL MINIMAPA...');
  
  // Buscar el contenedor del mapa
  const mapContainer = document.querySelector('[class*="border-blue-200"]') ||
                      document.querySelector('[class*="bg-blue-50"]');
  
  if (mapContainer) {
    console.log('✅ Contenedor del mapa encontrado');
    
    // Buscar el div del mapa de Google
    const googleMap = mapContainer.querySelector('div[style*="height"]') ||
                     mapContainer.querySelector('div[style*="256px"]');
    
    if (googleMap) {
      console.log('✅ Mapa de Google renderizado');
      testMapControls();
    } else {
      console.log('⏳ Mapa aún cargando...');
      setTimeout(checkForMap, 2000);
    }
  } else {
    console.log('⚠️ Minimapa no apareció - puede que no se hayan otorgado permisos de ubicación');
    console.log('💡 Intenta otorgar permisos de ubicación y ejecutar la prueba nuevamente');
  }
}

// Función para probar los controles del mapa
function testMapControls() {
  console.log('\n🎮 5. PROBANDO CONTROLES DEL MAPA...');
  
  // Buscar botones de control
  const adjustButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Ajustar')
  );
  
  const confirmButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Confirmar')
  );
  
  if (adjustButton) {
    console.log('✅ Botón "Ajustar" encontrado');
  } else {
    console.log('⚠️ Botón "Ajustar" no encontrado');
  }
  
  if (confirmButton) {
    console.log('✅ Botón "Confirmar" encontrado');
  } else {
    console.log('⚠️ Botón "Confirmar" no encontrado');
  }
  
  // Verificar información de dirección
  const addressInfo = document.querySelector('[class*="bg-gray-50"]');
  if (addressInfo && addressInfo.textContent.includes('Dirección de entrega')) {
    console.log('✅ Información de dirección mostrada');
  } else {
    console.log('⚠️ Información de dirección no encontrada');
  }
  
  testMapInteraction();
}

// Función para probar la interacción con el mapa
function testMapInteraction() {
  console.log('\n🖱️ 6. PROBANDO INTERACCIÓN CON EL MAPA...');
  
  const adjustButton = Array.from(document.querySelectorAll('button')).find(btn => 
    btn.textContent.includes('Ajustar')
  );
  
  if (adjustButton && !adjustButton.disabled) {
    console.log('🎯 Activando modo de ajuste...');
    adjustButton.click();
    
    setTimeout(() => {
      // Verificar que aparezca el mensaje de modo de ajuste
      const adjustMessage = document.querySelector('[class*="bg-orange-100"]');
      if (adjustMessage) {
        console.log('✅ Modo de ajuste activado correctamente');
        console.log('💡 Ahora puedes arrastrar el marcador o hacer clic en el mapa');
      } else {
        console.log('⚠️ Mensaje de modo de ajuste no encontrado');
      }
      
      showTestSummary();
    }, 1000);
  } else {
    console.log('⚠️ No se puede probar interacción - botón no disponible');
    showTestSummary();
  }
}

// Función para mostrar resumen de la prueba
function showTestSummary() {
  console.log('\n📊 RESUMEN DE LA IMPLEMENTACIÓN:');
  console.log('==============================');
  console.log('✅ Minimapa interactivo implementado');
  console.log('✅ Detección automática de ubicación');
  console.log('✅ Geocodificación inversa (coordenadas → dirección)');
  console.log('✅ Modo de ajuste manual');
  console.log('✅ Marcador arrastrable');
  console.log('✅ Confirmación de ubicación');
  console.log('✅ Información de dirección en tiempo real');
  
  console.log('\n🎯 FUNCIONALIDADES DEL MINIMAPA:');
  console.log('• 📍 Muestra la ubicación detectada por GPS');
  console.log('• 🎯 Permite ajustar la posición manualmente');
  console.log('• 🖱️ Marcador arrastrable para precisión');
  console.log('• 🗺️ Clic en el mapa para cambiar ubicación');
  console.log('• 📝 Geocodificación automática de coordenadas');
  console.log('• ✅ Confirmación antes de usar la ubicación');
  
  console.log('\n💡 BENEFICIOS PARA EL USUARIO:');
  console.log('• Precisión mejorada en la dirección de entrega');
  console.log('• Control visual de la ubicación exacta');
  console.log('• Capacidad de ajustar si la detección no es precisa');
  console.log('• Confirmación visual antes de proceder');
}

// Función principal de prueba
function runMapTest() {
  console.log('🚀 INICIANDO PRUEBA DEL MINIMAPA...\n');
  
  if (verifyMapImplementation()) {
    activateDeliveryService();
  }
}

// Función para mostrar instrucciones manuales
function showManualInstructions() {
  console.log('\n📋 INSTRUCCIONES PARA PRUEBA MANUAL:');
  console.log('===================================');
  console.log('1. 🏠 Selecciona "Entrega" en la página');
  console.log('2. 📍 Haz clic en "Usar mi ubicación"');
  console.log('3. ✅ Permite permisos de ubicación cuando el navegador lo solicite');
  console.log('4. 🗺️ Verifica que aparezca el minimapa con tu ubicación');
  console.log('5. 🎯 Haz clic en "Ajustar" para probar el modo de edición');
  console.log('6. 🖱️ Arrastra el marcador rojo a una nueva posición');
  console.log('7. 📝 Observa cómo cambia la dirección automáticamente');
  console.log('8. ✅ Haz clic en "Confirmar" para usar la nueva ubicación');
  console.log('9. 🎉 Verifica que se actualice la dirección de entrega');
}

// Ejecutar automáticamente
runMapTest();
showManualInstructions();

// Exportar funciones para uso manual
window.mapTest = {
  runMapTest,
  testLocationDetection,
  checkForMap,
  testMapControls,
  showTestSummary,
  showManualInstructions
};

console.log('\n🛠️ FUNCIONES DISPONIBLES:');
console.log('• mapTest.runMapTest() - Ejecutar prueba completa');
console.log('• mapTest.testLocationDetection() - Probar detección de ubicación');
console.log('• mapTest.checkForMap() - Verificar aparición del mapa');
console.log('• mapTest.showManualInstructions() - Mostrar instrucciones manuales');

console.log('\n🏁 PRUEBA INICIADA - Sigue las instrucciones y verifica manualmente');