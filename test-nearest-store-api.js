/**
 * Script para probar la API de nearest-store
 * Ejecutar en la consola del navegador
 */

console.log('🧪 PROBANDO API DE TIENDAS CERCANAS');
console.log('==================================');

// Función para probar la API con coordenadas
async function testAPIWithCoordinates() {
  console.log('\n📍 1. PROBANDO API CON COORDENADAS...');
  
  const testData = {
    address: {
      street: 'Ubicación detectada',
      city: 'Pedro Escobedo',
      state: 'Querétaro',
      postalCode: '76240',
      country: 'México',
      latitude: 20.5089,
      longitude: -100.1456
    },
    latitude: 20.5089,
    longitude: -100.1456
  };
  
  try {
    console.log('📤 Enviando datos:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('/api/nearest-store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });
    
    console.log('📥 Respuesta HTTP:', response.status, response.statusText);
    
    const data = await response.json();
    console.log('📦 Datos recibidos:', JSON.stringify(data, null, 2));
    
    if (response.ok && data.success) {
      console.log('✅ API funciona correctamente');
      
      if (data.data.stores && data.data.stores.length > 0) {
        console.log(`✅ Se encontraron ${data.data.stores.length} tienda(s)`);
        const store = data.data.stores[0];
        console.log(`📍 Tienda más cercana: ${store.name}`);
        console.log(`📏 Distancia: ${store.distanceKm} km`);
      } else {
        console.error('❌ No se encontraron tiendas en la respuesta');
      }
    } else {
      console.error('❌ Error en la API:', data.error || 'Error desconocido');
    }
    
  } catch (error) {
    console.error('❌ Error de conexión:', error);
  }
}

// Función para probar la API GET (obtener todas las tiendas)
async function testAPIGetStores() {
  console.log('\n🏪 2. PROBANDO API GET (TODAS LAS TIENDAS)...');
  
  try {
    const response = await fetch('/api/nearest-store', {
      method: 'GET'
    });
    
    console.log('📥 Respuesta HTTP:', response.status, response.statusText);
    
    const data = await response.json();
    console.log('📦 Datos recibidos:', JSON.stringify(data, null, 2));
    
    if (response.ok && data.success) {
      console.log('✅ API GET funciona correctamente');
      console.log(`📊 Total de tiendas disponibles: ${data.data.count}`);
      
      if (data.data.stores && data.data.stores.length > 0) {
        data.data.stores.forEach((store, index) => {
          console.log(`${index + 1}. ${store.name} - ${store.address.street}`);
        });
      }
    } else {
      console.error('❌ Error en la API GET:', data.error || 'Error desconocido');
    }
    
  } catch (error) {
    console.error('❌ Error de conexión GET:', error);
  }
}

// Función para probar con datos reales del usuario
async function testWithUserLocation() {
  console.log('\n🌍 3. PROBANDO CON UBICACIÓN REAL DEL USUARIO...');
  
  if (!navigator.geolocation) {
    console.log('❌ Geolocalización no disponible');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      console.log(`📍 Ubicación del usuario: ${latitude}, ${longitude}`);
      
      const testData = {
        address: {
          street: 'Ubicación actual del usuario',
          city: 'Pedro Escobedo',
          state: 'Querétaro',
          postalCode: '76240',
          country: 'México',
          latitude: latitude,
          longitude: longitude
        },
        latitude: latitude,
        longitude: longitude
      };
      
      try {
        const response = await fetch('/api/nearest-store', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(testData)
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          console.log('✅ API funciona con ubicación real');
          const store = data.data.stores[0];
          console.log(`📍 Tienda más cercana: ${store.name}`);
          console.log(`📏 Distancia: ${store.distanceKm} km`);
        } else {
          console.error('❌ Error con ubicación real:', data.error);
        }
        
      } catch (error) {
        console.error('❌ Error probando ubicación real:', error);
      }
    },
    (error) => {
      console.log('❌ No se pudo obtener ubicación:', error.message);
    }
  );
}

// Función para mostrar diagnóstico completo
function showDiagnostic() {
  console.log('\n🔍 DIAGNÓSTICO DE LA IMPLEMENTACIÓN:');
  console.log('===================================');
  console.log('✅ API modificada para aceptar coordenadas');
  console.log('✅ Respuesta incluye array de tiendas');
  console.log('✅ Manejo de errores mejorado');
  console.log('✅ Logs detallados para debugging');
  console.log('✅ Datos mock disponibles como fallback');
  
  console.log('\n🎯 PRÓXIMOS PASOS:');
  console.log('1. Verificar que la API responda correctamente');
  console.log('2. Probar con ubicación real del usuario');
  console.log('3. Verificar que el frontend procese la respuesta');
  console.log('4. Confirmar que se muestre la tienda seleccionada');
}

// Ejecutar pruebas automáticamente
async function runAllTests() {
  console.log('🚀 EJECUTANDO TODAS LAS PRUEBAS...\n');
  
  await testAPIGetStores();
  await testAPIWithCoordinates();
  testWithUserLocation();
  showDiagnostic();
}

// Ejecutar automáticamente
runAllTests();

// Exportar funciones para uso manual
window.apiTest = {
  testAPIWithCoordinates,
  testAPIGetStores,
  testWithUserLocation,
  runAllTests,
  showDiagnostic
};

console.log('\n🛠️ FUNCIONES DISPONIBLES:');
console.log('• apiTest.testAPIWithCoordinates() - Probar con coordenadas');
console.log('• apiTest.testAPIGetStores() - Obtener todas las tiendas');
console.log('• apiTest.testWithUserLocation() - Probar con ubicación real');
console.log('• apiTest.runAllTests() - Ejecutar todas las pruebas');

console.log('\n🏁 PRUEBAS INICIADAS - Revisa los resultados arriba');