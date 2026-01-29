// Script para probar la creación de órdenes COD
console.log('🧪 PRUEBA DE CREACIÓN DE ÓRDENES COD');
console.log('===================================');

// Función para simular datos de prueba
function generateTestOrderData() {
  return {
    orderNumber: crypto.randomUUID(),
    customerName: "Juan Pérez",
    customerEmail: "juan.perez@example.com",
    clerkUserId: "user_test123",
    phone: "+52 442 123 4567",
    shippingAddress: {
      line1: "Calle Hidalgo 123, Centro",
      line2: "Depto 2B",
      city: "Pedro Escobedo",
      state: "Querétaro",
      postal_code: "76240",
      country: "MX"
    },
    storeInfo: {
      storeId: "test-store-id",
      storeName: "Tienda de Crepas",
      storeAddress: "Av. Constitución 45, Pedro Escobedo",
      storePhone: "+52 442 234 5678",
      deliveryMethod: "delivery",
      estimatedDelivery: "Listo en 15 minutos"
    }
  };
}

// Función para probar la API de tiendas
async function testStoreAPI() {
  console.log('\n📡 1. PROBANDO API DE TIENDAS...');
  
  try {
    const response = await fetch('http://localhost:3000/api/nearest-store', {
      method: 'GET'
    });
    
    const data = await response.json();
    
    if (data.success && data.data.stores) {
      console.log(`✅ API funcionando - ${data.data.stores.length} tiendas encontradas`);
      
      data.data.stores.forEach((store, index) => {
        console.log(`\n🏪 TIENDA ${index + 1}: ${store.name}`);
        console.log(`   ID: ${store._id}`);
        console.log(`   Dirección: ${store.address?.street || 'No especificada'}`);
        console.log(`   Teléfono: ${store.contact?.phone || 'No especificado'}`);
        console.log(`   Tiempo mín: ${store.deliveryTimeMin || 'NO CONFIGURADO'} minutos`);
        console.log(`   Tiempo máx: ${store.deliveryTimeMax || 'NO CONFIGURADO'} minutos`);
      });
      
      return data.data.stores;
    } else {
      console.log('❌ Error en API:', data.error || 'Respuesta inválida');
      return [];
    }
  } catch (error) {
    console.log('❌ Error de conexión:', error.message);
    return [];
  }
}

// Función para verificar localStorage
function checkLocalStorage() {
  console.log('\n💾 2. VERIFICANDO LOCALSTORAGE...');
  
  const savedStore = localStorage.getItem('clickCollectStore');
  
  if (savedStore) {
    try {
      const storeData = JSON.parse(savedStore);
      console.log('✅ Datos encontrados en localStorage:');
      console.log(`   Tienda: ${storeData.storeName || 'Sin nombre'}`);
      console.log(`   Método: ${storeData.deliveryMethod || 'No especificado'}`);
      console.log(`   Tiempo estimado: ${storeData.estimatedDelivery || 'No especificado'}`);
      console.log(`   Dirección del cliente:`, storeData.customerAddress || 'No especificada');
      
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

// Función para simular creación de orden
function simulateOrderCreation() {
  console.log('\n🛒 3. SIMULANDO CREACIÓN DE ORDEN...');
  
  const testData = generateTestOrderData();
  console.log('📋 Datos de prueba generados:');
  console.log('   Número de orden:', testData.orderNumber);
  console.log('   Cliente:', testData.customerName);
  console.log('   Email:', testData.customerEmail);
  console.log('   Teléfono:', testData.phone);
  console.log('   Dirección:', testData.shippingAddress.line1);
  console.log('   Ciudad:', testData.shippingAddress.city);
  console.log('   Estado:', testData.shippingAddress.state);
  console.log('   Código postal:', testData.shippingAddress.postal_code);
  console.log('   Tienda:', testData.storeInfo.storeName);
  console.log('   Método de entrega:', testData.storeInfo.deliveryMethod);
  
  return testData;
}

// Función para mostrar checklist de validación
function showValidationChecklist() {
  console.log('\n✅ 4. CHECKLIST DE VALIDACIÓN:');
  console.log('==============================');
  
  console.log('\n📋 ANTES DE CREAR UNA ORDEN, VERIFICA:');
  console.log('1. ✓ Hay productos en el carrito');
  console.log('2. ✓ Usuario está autenticado (Clerk)');
  console.log('3. ✓ Se ha seleccionado una tienda');
  console.log('4. ✓ Se ha proporcionado una dirección válida');
  console.log('5. ✓ Se ha ingresado un número de teléfono');
  console.log('6. ✓ Los campos de dirección no están vacíos');
  
  console.log('\n🔍 CAMPOS CRÍTICOS DE DIRECCIÓN:');
  console.log('- line1: Debe contener la dirección principal');
  console.log('- city: Debe especificar la ciudad');
  console.log('- state: Debe especificar el estado');
  console.log('- postal_code: Código postal válido');
  console.log('- country: Código de país (MX para México)');
  
  console.log('\n🏪 INFORMACIÓN DE TIENDA REQUERIDA:');
  console.log('- storeId: ID de la tienda en Sanity');
  console.log('- storeName: Nombre de la tienda');
  console.log('- storeAddress: Dirección de la tienda');
  console.log('- storePhone: Teléfono de la tienda');
  console.log('- deliveryMethod: "delivery" o "pickup"');
  console.log('- estimatedDelivery: Tiempo estimado de entrega');
}

// Función para mostrar soluciones a problemas comunes
function showTroubleshooting() {
  console.log('\n🔧 5. SOLUCIÓN A PROBLEMAS COMUNES:');
  console.log('===================================');
  
  console.log('\n❌ PROBLEMA: Campos de dirección vacíos en Sanity');
  console.log('✅ SOLUCIÓN:');
  console.log('   1. Verificar que customerAddress en localStorage tenga datos');
  console.log('   2. Asegurar que los campos se mapeen correctamente');
  console.log('   3. Validar que no se usen valores undefined o null');
  
  console.log('\n❌ PROBLEMA: Error "stripeCustomerId required"');
  console.log('✅ SOLUCIÓN:');
  console.log('   1. Actualizar esquema de Sanity para hacer opcional este campo');
  console.log('   2. Usar valores placeholder para órdenes COD');
  console.log('   3. Verificar que el campo paymentMethod sea "cash_on_delivery"');
  
  console.log('\n❌ PROBLEMA: Información de tienda no se guarda');
  console.log('✅ SOLUCIÓN:');
  console.log('   1. Verificar que el storeId sea válido');
  console.log('   2. Usar pickupStore en lugar de affiliateStore para COD');
  console.log('   3. Mapear deliveryMethod correctamente (click_collect vs home_delivery)');
  
  console.log('\n❌ PROBLEMA: Dirección desde Google Maps no se guarda');
  console.log('✅ SOLUCIÓN:');
  console.log('   1. Verificar estructura de customerAddress en localStorage');
  console.log('   2. Mapear campos alternativos (formatted_address, locality, etc.)');
  console.log('   3. Proporcionar valores por defecto para campos faltantes');
}

// Función principal
async function runDiagnostic() {
  const stores = await testStoreAPI();
  const savedStore = checkLocalStorage();
  const testOrder = simulateOrderCreation();
  showValidationChecklist();
  showTroubleshooting();
  
  console.log('\n🎯 RESUMEN DEL DIAGNÓSTICO:');
  console.log('===========================');
  console.log(`📊 Tiendas disponibles: ${stores.length}`);
  console.log(`💾 Datos en localStorage: ${savedStore ? 'SÍ' : 'NO'}`);
  console.log(`🧪 Datos de prueba: GENERADOS`);
  
  if (stores.length > 0 && savedStore) {
    console.log('✅ Sistema listo para crear órdenes COD');
  } else {
    console.log('⚠️  Completar configuración antes de crear órdenes');
  }
  
  console.log('\n🚀 PRÓXIMOS PASOS:');
  console.log('1. Limpiar localStorage si es necesario');
  console.log('2. Seleccionar tienda desde /basket');
  console.log('3. Completar formulario en /checkout-cod');
  console.log('4. Verificar orden creada en Sanity Studio');
}

// Ejecutar diagnóstico
runDiagnostic();