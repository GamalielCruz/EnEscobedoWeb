// Test script para verificar los nuevos tiempos de entrega para restaurante

console.log('🍽️ Probando tiempos de entrega para restaurante...');

// Función simulada de cálculo de tiempo (en minutos)
const getEstimatedDeliveryTime = (distanceKm) => {
  if (distanceKm <= 2) {
    return 20; // 20 minutos para tiendas muy cercanas
  } else if (distanceKm <= 5) {
    return 30; // 30 minutos para tiendas cercanas
  } else if (distanceKm <= 10) {
    return 45; // 45 minutos para tiendas moderadamente lejos
  } else if (distanceKm <= 15) {
    return 60; // 1 hora para tiendas más lejanas
  } else {
    return 90; // 1.5 horas para tiendas muy lejanas
  }
};

// Función simulada de texto amigable
const getDeliveryTimeText = (minutes) => {
  if (minutes <= 15) {
    return "Listo en 15 minutos";
  } else if (minutes <= 30) {
    return `Listo en ${minutes} minutos`;
  } else if (minutes <= 60) {
    return `Listo en ${minutes} minutos`;
  } else {
    const hours = Math.ceil(minutes / 60);
    if (hours <= 2) {
      return `Listo en ${hours} hora${hours > 1 ? 's' : ''}`;
    } else if (hours <= 6) {
      return `Listo en ${hours} horas`;
    } else {
      return "Listo hoy más tarde";
    }
  }
};

console.log('\n📊 Nuevos tiempos de entrega:');

const testCases = [
  { distance: 0.5, description: 'Muy cerca (0.5 km)' },
  { distance: 1.5, description: 'Cerca (1.5 km)' },
  { distance: 3, description: 'Moderado (3 km)' },
  { distance: 7, description: 'Lejos (7 km)' },
  { distance: 12, description: 'Muy lejos (12 km)' },
  { distance: 20, description: 'Extremo (20 km)' }
];

testCases.forEach(testCase => {
  const minutes = getEstimatedDeliveryTime(testCase.distance);
  const text = getDeliveryTimeText(minutes);
  console.log(`${testCase.description}: ${minutes} min → "${text}"`);
});

console.log('\n✅ Mejoras implementadas:');
console.log('- Tiempos en minutos en lugar de días');
console.log('- Rangos apropiados para restaurante');
console.log('- Texto más natural y realista');
console.log('- Máximo 90 minutos para entregas lejanas');

console.log('\n🎯 Comparación:');
console.log('ANTES: "Estará listo en 3 días" ❌');
console.log('AHORA: "Listo en 45 minutos" ✅');

console.log('\n🚀 Listo para probar en http://localhost:3000');