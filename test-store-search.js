// Script de prueba para verificar la búsqueda de tiendas
// Ejecutar con: node test-store-search.js

const testStoreSearch = async () => {
  const baseUrl = 'http://localhost:3000'; // Ajustar según tu configuración
  
  console.log('🧪 Probando búsqueda de tiendas...\n');
  
  try {
    // 1. Probar obtener todas las tiendas
    console.log('1️⃣ Obteniendo todas las tiendas disponibles...');
    const storesResponse = await fetch(`${baseUrl}/api/nearest-store`, {
      method: 'GET'
    });
    
    const storesData = await storesResponse.json();
    console.log('✅ Respuesta de tiendas:', JSON.stringify(storesData, null, 2));
    
    if (storesData.success && storesData.data.stores.length > 0) {
      console.log(`📍 Se encontraron ${storesData.data.stores.length} tiendas\n`);
      
      // 2. Probar búsqueda con dirección manual
      console.log('2️⃣ Probando búsqueda con dirección manual...');
      const searchResponse = await fetch(`${baseUrl}/api/nearest-store`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          address: {
            street: 'Calle Hidalgo 20',
            city: 'Pedro Escobedo',
            state: 'Querétaro',
            country: 'México'
          },
          useGoogleMaps: false // Usar OpenStreetMap para evitar problemas de API key
        })
      });
      
      const searchData = await searchResponse.json();
      console.log('✅ Respuesta de búsqueda:', JSON.stringify(searchData, null, 2));
      
      if (searchData.success) {
        console.log('🎉 ¡La búsqueda funciona correctamente!');
        console.log(`📍 Tienda más cercana: ${searchData.data.store.name}`);
        console.log(`📏 Distancia: ${searchData.data.store.distanceKm} km`);
      } else {
        console.log('❌ Error en la búsqueda:', searchData.error);
      }
    } else {
      console.log('❌ No se encontraron tiendas disponibles');
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.log('\n💡 Asegúrate de que el servidor esté ejecutándose en http://localhost:3000');
  }
};

// Ejecutar la prueba
testStoreSearch();