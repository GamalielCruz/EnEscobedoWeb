// 🔍 Script de diagnóstico para ejecutar en la consola del navegador
// Copia y pega este código en la consola del navegador cuando estés en http://localhost:3000/dashboard

console.log('🔍 Iniciando diagnóstico del dashboard...\n');

// 1. Verificar que estamos en la página correcta
console.log('📍 URL actual:', window.location.href);

// 2. Verificar el storeId en localStorage o estado
const checkStoreId = () => {
  console.log('\n🏪 Verificando storeId...');
  
  // Buscar en el DOM si hay alguna referencia al storeId
  const bodyText = document.body.innerText;
  const storeIdMatch = bodyText.match(/491d7dff-8884-402e-8e2b-1bcb8630e8ec/);
  
  if (storeIdMatch) {
    console.log('✅ StoreId encontrado en el DOM');
  } else {
    console.log('❌ StoreId NO encontrado en el DOM');
  }
};

// 3. Probar la API directamente
const testAPI = async () => {
  console.log('\n📡 Probando API de órdenes...');
  
  const storeId = '491d7dff-8884-402e-8e2b-1bcb8630e8ec';
  const url = `/api/dashboard/store-orders?storeId=${storeId}`;
  
  try {
    console.log('🔄 Haciendo petición a:', url);
    const response = await fetch(url, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });
    
    console.log('📊 Status:', response.status);
    
    const data = await response.json();
    console.log('📦 Respuesta:', data);
    
    if (data.success) {
      console.log('✅ API funcionando correctamente');
      console.log('📋 Órdenes encontradas:', data.orders?.length || 0);
      
      if (data.orders && data.orders.length > 0) {
        console.log('\n📝 Detalles de las órdenes:');
        data.orders.forEach((order, idx) => {
          console.log(`\n  Orden ${idx + 1}:`);
          console.log('    - ID:', order._id);
          console.log('    - Número:', order.orderNumber);
          console.log('    - Estado:', order.status);
          console.log('    - Cliente:', order.customerInfo?.name);
          console.log('    - Tienda:', order.storeInfo?.storeName);
          console.log('    - StoreId:', order.storeInfo?.storeId);
        });
      } else {
        console.log('⚠️  No hay órdenes para esta tienda');
      }
    } else {
      console.log('❌ Error en la API:', data.error);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Error al llamar a la API:', error);
    return null;
  }
};

// 4. Verificar el hook useOrderNotifications
const checkHook = () => {
  console.log('\n🪝 Verificando hook useOrderNotifications...');
  
  // Buscar en React DevTools si está disponible
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    console.log('✅ React DevTools detectado');
    console.log('💡 Abre React DevTools y busca el componente DashboardPage');
    console.log('💡 Verifica el estado del hook useOrderNotifications');
  } else {
    console.log('⚠️  React DevTools no detectado');
  }
};

// 5. Verificar errores en la consola
const checkConsoleErrors = () => {
  console.log('\n🐛 Revisa si hay errores en la consola arriba de este mensaje');
  console.log('💡 Busca errores relacionados con:');
  console.log('   - Fetch failed');
  console.log('   - 401 Unauthorized');
  console.log('   - 403 Forbidden');
  console.log('   - Network error');
};

// Ejecutar diagnóstico
(async () => {
  checkStoreId();
  await testAPI();
  checkHook();
  checkConsoleErrors();
  
  console.log('\n✅ Diagnóstico completado');
  console.log('\n💡 Próximos pasos:');
  console.log('   1. Si la API devuelve órdenes pero no se muestran, el problema está en el componente');
  console.log('   2. Si la API no devuelve órdenes, verifica que las órdenes tengan el storeId correcto');
  console.log('   3. Si hay error 401/403, verifica la autenticación de Clerk');
})();
