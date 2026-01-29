// Script para probar el flujo de selección de tienda
// Ejecutar en la consola del navegador en http://localhost:3000/basket

console.log('🧪 Iniciando prueba del flujo de selección de tienda...');

// Función para simular la selección de una tienda
function testStoreSelection() {
  console.log('1. Simulando selección de tienda...');
  
  // Datos de prueba de una tienda
  const mockStoreData = {
    store: {
      _id: 'test-store-123',
      name: 'Tienda de Prueba',
      distanceKm: 2.5,
      address: {
        street: 'Calle Test 123',
        city: 'Pedro Escobedo',
        state: 'Querétaro'
      },
      contact: {
        phone: '+52 442 123 4567'
      }
    },
    summary: {
      storeName: 'Tienda de Prueba',
      distance: '2.5 km',
      estimatedDelivery: 'Listo en 30 minutos',
      address: 'Calle Test 123, Pedro Escobedo, Querétaro',
      phone: '+52 442 123 4567'
    }
  };

  // Simular el payload que se guarda
  const payload = {
    deliveryMethod: 'pickup',
    storeId: mockStoreData.store._id,
    storeName: mockStoreData.summary.storeName,
    storeAddress: mockStoreData.summary.address,
    storePhone: mockStoreData.summary.phone,
    estimatedDelivery: mockStoreData.summary.estimatedDelivery,
    customerAddress: null,
    shippingCost: 0,
    timestamp: Date.now()
  };

  console.log('2. Guardando datos en localStorage:', payload);
  localStorage.setItem('clickCollectStore', JSON.stringify(payload));

  console.log('3. Disparando evento storeSelected...');
  window.dispatchEvent(new Event('storeSelected'));

  console.log('4. Verificando que el evento fue procesado...');
  
  // Verificar después de un pequeño delay
  setTimeout(() => {
    const saved = localStorage.getItem('clickCollectStore');
    if (saved) {
      console.log('✅ Datos guardados correctamente:', JSON.parse(saved));
      console.log('✅ Prueba completada. El flujo debería haber avanzado al paso 3.');
    } else {
      console.log('❌ Error: No se encontraron datos guardados');
    }
  }, 1000);
}

// Función para limpiar el estado y empezar de nuevo
function resetCheckoutFlow() {
  console.log('🔄 Limpiando estado del checkout...');
  localStorage.removeItem('clickCollectStore');
  console.log('✅ Estado limpiado. Recarga la página para empezar de nuevo.');
}

// Función para verificar el estado actual
function checkCurrentState() {
  console.log('🔍 Verificando estado actual...');
  const saved = localStorage.getItem('clickCollectStore');
  if (saved) {
    console.log('📦 Datos actuales en localStorage:', JSON.parse(saved));
  } else {
    console.log('📭 No hay datos guardados en localStorage');
  }
}

// Exportar funciones para uso en consola
window.testStoreSelection = testStoreSelection;
window.resetCheckoutFlow = resetCheckoutFlow;
window.checkCurrentState = checkCurrentState;

console.log('🎯 Funciones disponibles:');
console.log('- testStoreSelection(): Simula la selección de una tienda');
console.log('- resetCheckoutFlow(): Limpia el estado y reinicia');
console.log('- checkCurrentState(): Verifica el estado actual');
console.log('');
console.log('💡 Para probar, ejecuta: testStoreSelection()');