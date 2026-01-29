// Script para forzar la limpieza completa del localStorage
console.log('🧹 FORZANDO LIMPIEZA COMPLETA DEL LOCALSTORAGE');
console.log('===============================================');

// Limpiar localStorage automáticamente
console.log('\n🔄 LIMPIANDO AUTOMÁTICAMENTE...');
try {
  // Eliminar específicamente la clave de la tienda
  localStorage.removeItem('clickCollectStore');
  console.log('✅ Eliminada clave "clickCollectStore"');
  
  // Limpiar cualquier otra clave relacionada
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('store') || key.includes('delivery') || key.includes('basket'))) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`✅ Eliminada clave "${key}"`);
  });
  
  console.log(`\n✅ LIMPIEZA COMPLETADA - ${keysToRemove.length + 1} claves eliminadas`);
  
} catch (error) {
  console.log('❌ Error limpiando localStorage:', error.message);
}

console.log('\n📋 PASOS SIGUIENTES OBLIGATORIOS:');
console.log('=================================');

console.log('\n1. 🔄 RECARGA LA PÁGINA:');
console.log('   - Presiona Ctrl+Shift+R (Windows) o Cmd+Shift+R (Mac)');
console.log('   - Esto asegura que no queden datos en caché');

console.log('\n2. 🛒 PRUEBA EL FLUJO DESDE CERO:');
console.log('   a) Ve a http://localhost:3000');
console.log('   b) Agrega productos al carrito');
console.log('   c) Ve al carrito (/basket)');
console.log('   d) Selecciona "Servicio a Domicilio"');
console.log('   e) Ingresa una dirección (ej: "Pedro Escobedo, Querétaro")');
console.log('   f) Selecciona "Tienda de Crepas" (configurada con 10-25 min)');
console.log('   g) Ve a "Pagar al Repartidor / Contra entrega"');

console.log('\n3. ✅ RESULTADO ESPERADO:');
console.log('   - Tienda de Crepas: ~18 minutos (promedio de 10-25)');
console.log('   - Borona Pizza: ~30 minutos (promedio de 25-35)');
console.log('   - Esto es CORRECTO según la configuración actual');

console.log('\n4. 💡 PARA OBTENER EXACTAMENTE 10 MINUTOS:');
console.log('   a) Ve a tu panel de Sanity Studio');
console.log('   b) Busca "Tienda de Crepas"');
console.log('   c) Cambia ambos campos a 10:');
console.log('      - Tiempo mínimo de entrega: 10');
console.log('      - Tiempo máximo de entrega: 10');
console.log('   d) Guarda los cambios');
console.log('   e) Repite el flujo de prueba');

console.log('\n🎯 IMPORTANTE:');
console.log('==============');
console.log('El sistema está funcionando CORRECTAMENTE.');
console.log('Los tiempos que ves reflejan la configuración actual en Sanity.');
console.log('Si quieres tiempos diferentes, debes cambiar la configuración en Sanity.');

console.log('\n🚀 ¡LocalStorage limpiado! Recarga la página y prueba de nuevo.');

// Función adicional para verificar que la limpieza fue exitosa
setTimeout(() => {
  console.log('\n🔍 VERIFICACIÓN POST-LIMPIEZA:');
  const remainingKeys = Object.keys(localStorage);
  if (remainingKeys.length === 0) {
    console.log('✅ LocalStorage completamente limpio');
  } else {
    console.log(`ℹ️  Claves restantes en localStorage: ${remainingKeys.join(', ')}`);
  }
}, 100);