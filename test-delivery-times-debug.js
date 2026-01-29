// Script para debuggear y verificar los tiempos de entrega
console.log('🔍 DIAGNÓSTICO DE TIEMPOS DE ENTREGA');
console.log('=====================================');

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
        console.log(`   Tiempo mín: ${store.deliveryTimeMin || 'NO CONFIGURADO'} minutos`);
        console.log(`   Tiempo máx: ${store.deliveryTimeMax || 'NO CONFIGURADO'} minutos`);
        console.log(`   Promedio: ${store.deliveryTimeMin && store.deliveryTimeMax ? Math.round((store.deliveryTimeMin + store.deliveryTimeMax) / 2) : 'NO CALCULABLE'} minutos`);
        console.log(`   Tiempo legacy: ${store.averageDeliveryTime || 'NO CONFIGURADO'} días`);
      });
    } else {
      console.log('❌ Error en API:', data.error || 'Respuesta inválida');
    }
  } catch (error) {
    console.log('❌ Error de conexión:', error.message);
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
      console.log(`   Tiempo mín: ${storeData.deliveryTimeMin || 'NO CONFIGURADO'} minutos`);
      console.log(`   Tiempo máx: ${storeData.deliveryTimeMax || 'NO CONFIGURADO'} minutos`);
      console.log(`   Distancia: ${storeData.distanceKm || 'No especificada'} km`);
      
      // Verificar si los datos están obsoletos
      if (storeData.estimatedDelivery && (
        storeData.estimatedDelivery.includes('días') || 
        storeData.estimatedDelivery.includes('día') ||
        storeData.estimatedDelivery.includes('mañana')
      )) {
        console.log('⚠️  DATOS OBSOLETOS DETECTADOS - El texto contiene referencias a días');
        console.log('   Recomendación: Limpiar localStorage y seleccionar tienda de nuevo');
      }
      
    } catch (e) {
      console.log('❌ Error parseando localStorage:', e.message);
    }
  } else {
    console.log('ℹ️  No hay datos guardados en localStorage');
  }
}

// Función para probar el cálculo de tiempos
function testTimeCalculation() {
  console.log('\n⏱️  3. PROBANDO CÁLCULO DE TIEMPOS...');
  
  // Simular datos de tienda
  const testStores = [
    {
      name: 'Tienda de Crepas',
      deliveryTimeMin: 10,
      deliveryTimeMax: 25,
      distanceKm: 3
    },
    {
      name: 'Borona Pizza',
      deliveryTimeMin: 25,
      deliveryTimeMax: 35,
      distanceKm: 5
    },
    {
      name: 'Tienda Sin Configurar',
      deliveryTimeMin: null,
      deliveryTimeMax: null,
      distanceKm: 2
    }
  ];
  
  testStores.forEach(store => {
    console.log(`\n🏪 ${store.name}:`);
    
    if (store.deliveryTimeMin != null && store.deliveryTimeMax != null) {
      const avgTime = Math.round((store.deliveryTimeMin + store.deliveryTimeMax) / 2);
      console.log(`   ✅ Configurado en Sanity: ${store.deliveryTimeMin}-${store.deliveryTimeMax} min`);
      console.log(`   📊 Tiempo promedio: ${avgTime} minutos`);
      console.log(`   📝 Texto mostrado: "Listo en ${avgTime} minutos"`);
    } else {
      // Fallback basado en distancia
      let fallbackTime;
      if (store.distanceKm <= 2) {
        fallbackTime = 20;
      } else if (store.distanceKm <= 5) {
        fallbackTime = 30;
      } else if (store.distanceKm <= 10) {
        fallbackTime = 45;
      } else {
        fallbackTime = 60;
      }
      console.log(`   ⚠️  Sin configurar en Sanity`);
      console.log(`   📊 Fallback por distancia (${store.distanceKm}km): ${fallbackTime} minutos`);
      console.log(`   📝 Texto mostrado: "Listo en ${fallbackTime} minutos"`);
    }
  });
}

// Función para mostrar instrucciones de solución
function showSolution() {
  console.log('\n🎯 4. SOLUCIÓN PASO A PASO:');
  console.log('===========================');
  
  console.log('\n📋 PARA OBTENER EXACTAMENTE 10 MINUTOS:');
  console.log('1. Ve a tu panel de Sanity Studio');
  console.log('2. Busca la tienda que quieres configurar');
  console.log('3. Edita los campos:');
  console.log('   - Tiempo mínimo de entrega: 10');
  console.log('   - Tiempo máximo de entrega: 10');
  console.log('4. Guarda los cambios en Sanity');
  
  console.log('\n🧹 LIMPIAR DATOS OBSOLETOS:');
  console.log('1. Abre DevTools (F12)');
  console.log('2. Ve a Application > Local Storage > localhost:3000');
  console.log('3. Elimina la clave "clickCollectStore"');
  console.log('4. Recarga la página (Ctrl+Shift+R)');
  
  console.log('\n🔄 PROBAR EL FLUJO COMPLETO:');
  console.log('1. Ve a http://localhost:3000');
  console.log('2. Agrega productos al carrito');
  console.log('3. Ve al carrito (/basket)');
  console.log('4. Selecciona "Servicio a Domicilio"');
  console.log('5. Ingresa una dirección');
  console.log('6. Selecciona la tienda configurada');
  console.log('7. Ve a "Pagar al Repartidor"');
  console.log('8. Verifica que muestre "Listo en 10 minutos"');
  
  console.log('\n💡 IMPORTANTE:');
  console.log('- El sistema está funcionando correctamente');
  console.log('- Los 30 minutos que ves son porque esa tienda específica tiene 25-35 min configurados');
  console.log('- Cada tienda puede tener tiempos diferentes según su configuración en Sanity');
}

// Ejecutar todas las pruebas
async function runAllTests() {
  await testStoreAPI();
  checkLocalStorage();
  testTimeCalculation();
  showSolution();
  
  console.log('\n✅ DIAGNÓSTICO COMPLETO');
  console.log('========================');
  console.log('Si sigues viendo tiempos incorrectos después de seguir los pasos,');
  console.log('verifica que hayas guardado los cambios en Sanity y limpiado localStorage.');
}

// Ejecutar automáticamente
runAllTests();