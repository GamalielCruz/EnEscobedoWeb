// Script para limpiar caché y probar los nuevos tiempos

console.log('🧹 Limpiando caché y datos guardados...');

// Instrucciones para limpiar localStorage en el navegador
console.log('\n📋 Pasos para limpiar completamente:');
console.log('1. Abrir DevTools (F12)');
console.log('2. Ir a la pestaña "Application" o "Aplicación"');
console.log('3. En el menú izquierdo, expandir "Local Storage"');
console.log('4. Hacer clic en "http://localhost:3000"');
console.log('5. Hacer clic derecho y seleccionar "Clear"');
console.log('6. Alternativamente, ejecutar en Console:');
console.log('   localStorage.clear();');
console.log('7. Recargar la página (Ctrl+F5 o Cmd+Shift+R)');

console.log('\n🔄 O usar este comando en la consola del navegador:');
console.log('localStorage.removeItem("clickCollectStore");');
console.log('window.location.reload();');

console.log('\n🎯 Datos que pueden estar cacheados:');
console.log('- clickCollectStore (información de tienda seleccionada)');
console.log('- Datos de tiendas con tiempos antiguos');
console.log('- Caché del navegador con respuestas anteriores');

console.log('\n✅ Después de limpiar, deberías ver:');
console.log('- "Listo en 20 minutos" para tiendas cercanas');
console.log('- "Listo en 30 minutos" para tiendas moderadas');
console.log('- "Listo en 45 minutos" para tiendas lejanas');
console.log('- "Listo en 60 minutos" para tiendas muy lejanas');

console.log('\n🚫 NO deberías ver:');
console.log('- "Estará listo en 3 días"');
console.log('- "Estará listo mañana"');
console.log('- Cualquier referencia a días');

console.log('\n🔧 Si el problema persiste:');
console.log('1. Verificar que el servidor se reinició correctamente');
console.log('2. Hacer hard refresh (Ctrl+Shift+R)');
console.log('3. Abrir en ventana de incógnito');
console.log('4. Verificar que no hay otros archivos con lógica antigua');

console.log('\n🚀 Servidor corriendo en: http://localhost:3000');