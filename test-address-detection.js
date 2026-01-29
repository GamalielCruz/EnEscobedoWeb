// Script para probar la detección y guardado de direcciones
console.log('🧪 PRUEBA DE DETECCIÓN DE DIRECCIONES');
console.log('====================================');

// Función para verificar localStorage
function checkLocalStorageAddress() {
  console.log('\n💾 VERIFICANDO LOCALSTORAGE...');
  
  const savedStore = localStorage.getItem('clickCollectStore');
  
  if (savedStore) {
    try {
      const storeData = JSON.parse(savedStore);
      console.log('✅ Datos encontrados en localStorage:');
      console.log('📊 Estructura completa:', storeData);
      
      console.log('\n📍 INFORMACIÓN DE DIRECCIÓN:');
      if (storeData.customerAddress) {
        console.log('✅ customerAddress existe:', storeData.customerAddress);
        
        // Verificar campos específicos
        const addr = storeData.customerAddress;
        console.log('   - formatted_address:', addr.formatted_address || 'NO');
        console.log('   - address:', addr.address || 'NO');
        console.log('   - street:', addr.street || 'NO');
        console.log('   - city:', addr.city || 'NO');
        console.log('   - state:', addr.state || 'NO');
        console.log('   - postal_code:', addr.postal_code || 'NO');
        console.log('   - latitude:', addr.latitude || 'NO');
        console.log('   - longitude:', addr.longitude || 'NO');
        
        // Verificar si hay al menos una dirección válida
        const hasValidAddress = addr.formatted_address || addr.address || addr.street;
        if (hasValidAddress) {
          console.log('✅ DIRECCIÓN VÁLIDA DETECTADA');
        } else {
          console.log('❌ DIRECCIÓN INCOMPLETA O VACÍA');
        }
      } else {
        console.log('❌ customerAddress NO EXISTE o es null');
      }
      
      console.log('\n🏪 INFORMACIÓN DE TIENDA:');
      console.log('   - Tienda:', storeData.storeName || 'NO');
      console.log('   - Método:', storeData.deliveryMethod || 'NO');
      console.log('   - Tiempo estimado:', storeData.estimatedDelivery || 'NO');
      
      return storeData;
    } catch (e) {
      console.log('❌ Error parseando localStorage:', e.message);
      return null;
    }
  } else {
    console.log('ℹ️  No hay datos guardados en localStorage');
    return null;
  }
}

// Función para simular datos de dirección
function simulateAddressData() {
  console.log('\n🎭 SIMULANDO DATOS DE DIRECCIÓN...');
  
  const mockAddress = {
    formatted_address: "Calle Hidalgo 123, Centro, Pedro Escobedo, Qro., México",
    address: "Calle Hidalgo 123",
    street: "Calle Hidalgo 123, Centro",
    city: "Pedro Escobedo",
    state: "Querétaro",
    postal_code: "76240",
    country: "México",
    latitude: 20.5089,
    longitude: -100.1456
  };
  
  console.log('📍 Dirección simulada:', mockAddress);
  
  // Simular guardado en localStorage
  const mockStoreData = {
    deliveryMethod: 'delivery',
    storeId: 'test-store-123',
    storeName: 'Tienda de Crepas',
    storeAddress: 'Av. Constitución 45, Pedro Escobedo',
    storePhone: '+52 442 234 5678',
    estimatedDelivery: 'Listo en 15 minutos',
    customerAddress: mockAddress,
    deliveryTimeMin: 10,
    deliveryTimeMax: 20,
    distanceKm: 2.5,
    shippingCost: 30
  };
  
  localStorage.setItem('clickCollectStore', JSON.stringify(mockStoreData));
  console.log('✅ Datos simulados guardados en localStorage');
  
  return mockStoreData;
}

// Función para limpiar localStorage
function clearLocalStorage() {
  console.log('\n🧹 LIMPIANDO LOCALSTORAGE...');
  localStorage.removeItem('clickCollectStore');
  console.log('✅ localStorage limpiado');
}

// Función para mostrar instrucciones de prueba
function showTestInstructions() {
  console.log('\n📋 INSTRUCCIONES DE PRUEBA:');
  console.log('===========================');
  
  console.log('\n🔄 FLUJO COMPLETO DE PRUEBA:');
  console.log('1. Limpiar localStorage: clearLocalStorage()');
  console.log('2. Ve a http://localhost:3000/basket');
  console.log('3. Selecciona "Servicio a Domicilio"');
  console.log('4. Haz clic en "Detectar Mi Ubicación"');
  console.log('5. Permite el acceso a la ubicación');
  console.log('6. Selecciona una tienda de la lista');
  console.log('7. Ejecuta: checkLocalStorageAddress()');
  console.log('8. Ve a /checkout-cod');
  console.log('9. Verifica que NO aparezca formulario de dirección');
  
  console.log('\n🧪 PRUEBA CON DATOS SIMULADOS:');
  console.log('1. Ejecuta: simulateAddressData()');
  console.log('2. Ve a http://localhost:3000/checkout-cod');
  console.log('3. Verifica que aparezca "Dirección Detectada Automáticamente"');
  console.log('4. NO debería aparecer formulario manual');
  
  console.log('\n🔍 DEBUGGING:');
  console.log('- Abre DevTools (F12)');
  console.log('- Ve a Console tab');
  console.log('- Busca logs que empiecen con 🔍, 📍, 💾, 🔄');
  console.log('- Estos logs te dirán exactamente qué está pasando');
}

// Función para verificar el estado actual
function checkCurrentState() {
  console.log('\n📊 ESTADO ACTUAL:');
  console.log('==================');
  
  const storeData = checkLocalStorageAddress();
  
  if (storeData && storeData.customerAddress) {
    const addr = storeData.customerAddress;
    const hasValidAddress = addr.formatted_address || addr.address || addr.street;
    
    if (hasValidAddress) {
      console.log('\n✅ RESULTADO: Dirección detectada correctamente');
      console.log('   → En /checkout-cod NO debería aparecer formulario manual');
      console.log('   → Debería mostrar "Dirección Detectada Automáticamente"');
    } else {
      console.log('\n⚠️  RESULTADO: Dirección incompleta');
      console.log('   → En /checkout-cod aparecerá formulario manual');
      console.log('   → Necesitas detectar ubicación de nuevo');
    }
  } else {
    console.log('\n❌ RESULTADO: No hay dirección guardada');
    console.log('   → En /checkout-cod aparecerá formulario manual');
    console.log('   → Necesitas seleccionar tienda desde /basket');
  }
}

// Exponer funciones globalmente para uso en consola
window.checkLocalStorageAddress = checkLocalStorageAddress;
window.simulateAddressData = simulateAddressData;
window.clearLocalStorage = clearLocalStorage;

// Ejecutar verificación automática
checkCurrentState();
showTestInstructions();

console.log('\n🎯 FUNCIONES DISPONIBLES:');
console.log('=========================');
console.log('- checkLocalStorageAddress() - Verificar datos guardados');
console.log('- simulateAddressData() - Simular dirección detectada');
console.log('- clearLocalStorage() - Limpiar datos guardados');

console.log('\n🚀 ¡Usa estas funciones para probar la detección de direcciones!');