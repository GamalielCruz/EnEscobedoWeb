// Script para probar la API de tiendas y verificar la estructura de datos
// Ejecutar con: node test-api-stores.js

const testStoresAPI = async () => {
  const baseUrl = "http://localhost:3000"; // Ajustar según tu configuración

  console.log("🧪 Probando API de tiendas...\n");

  try {
    // Probar GET /api/nearest-store
    console.log("📡 Llamando a GET /api/nearest-store...");
    const response = await fetch(`${baseUrl}/api/nearest-store`, {
      method: "GET",
    });

    const data = await response.json();
    console.log("📦 Respuesta completa:", JSON.stringify(data, null, 2));

    if (data.success && data.data.stores) {
      console.log(`\n✅ Se encontraron ${data.data.stores.length} tiendas`);

      // Verificar estructura de cada tienda
      data.data.stores.forEach((store, index) => {
        console.log(`\n🏪 Tienda ${index + 1}: ${store.name || "SIN NOMBRE"}`);
        console.log(`   📍 ID: ${store._id || "SIN ID"}`);
        console.log(
          `   🏠 Dirección: ${store.address?.street || "SIN DIRECCIÓN"}`
        );
        console.log(
          `   📞 Teléfono: ${store.contact?.phone || "SIN TELÉFONO"}`
        );
        console.log(
          `   🗺️ Coordenadas: ${store.coordinates?.latitude || "SIN LAT"}, ${store.coordinates?.longitude || "SIN LNG"}`
        );
        console.log(
          `   ⏰ Horarios: ${Object.keys(store.operatingHours || {}).length} días configurados`
        );
        console.log(
          `   🚚 Tiempo entrega: ${store.averageDeliveryTime || "NO DEFINIDO"} días`
        );

        // Verificar campos críticos
        const issues = [];
        if (!store._id) issues.push("❌ Falta _id");
        if (!store.name) issues.push("❌ Falta name");
        if (!store.contact?.phone) issues.push("❌ Falta contact.phone");
        if (!store.address?.street) issues.push("❌ Falta address.street");
        if (!store.coordinates?.latitude)
          issues.push("❌ Falta coordinates.latitude");
        if (!store.coordinates?.longitude)
          issues.push("❌ Falta coordinates.longitude");

        if (issues.length > 0) {
          console.log(`   🚨 PROBLEMAS ENCONTRADOS:`);
          issues.forEach((issue) => console.log(`      ${issue}`));
        } else {
          console.log(`   ✅ Estructura válida`);
        }
      });

      // Probar cálculo de distancias
      console.log("\n🧮 Probando cálculo de distancias...");
      const testLat = 20.5089;
      const testLng = -100.1456;

      data.data.stores.forEach((store) => {
        if (store.coordinates?.latitude && store.coordinates?.longitude) {
          const distance = calculateDistance(
            testLat,
            testLng,
            store.coordinates.latitude,
            store.coordinates.longitude
          );
          console.log(`   📏 ${store.name}: ${distance.toFixed(2)} km`);
        }
      });
    } else {
      console.log("❌ No se encontraron tiendas o estructura inválida");
      console.log("Respuesta:", data);
    }
  } catch (error) {
    console.error("❌ Error en la prueba:", error.message);
    console.log(
      "\n💡 Asegúrate de que el servidor esté ejecutándose en http://localhost:3000"
    );
  }
};

// Función para calcular distancia (copia de la función del componente)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Ejecutar la prueba
testStoresAPI();
