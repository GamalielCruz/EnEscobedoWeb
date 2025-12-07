// Script para probar la consulta de órdenes de un usuario
const testUserOrders = async () => {
  console.log('🧪 Probando consulta de órdenes de usuario...\n');
  
  try {
    // Simular una petición a la página de órdenes
    // En la aplicación real, esto se haría a través de la función getMyOrders
    
    const testUserId = 'user_test123';
    console.log(`👤 Consultando órdenes para usuario: ${testUserId}`);
    
    // Consultar órdenes de click & collect
    const clickCollectResponse = await fetch('http://localhost:3000/api/click-collect-orders');
    const clickCollectData = await clickCollectResponse.json();
    
    console.log('📦 Órdenes Click & Collect encontradas:', clickCollectData.data?.count || 0);
    
    if (clickCollectData.success && clickCollectData.data.orders.length > 0) {
      console.log('\n🏪 Órdenes Click & Collect:');
      clickCollectData.data.orders.forEach((order, index) => {
        console.log(`\n${index + 1}. Orden ${order.orderNumber}`);
        console.log(`   👤 Cliente: ${order.customerInfo.name}`);
        console.log(`   📧 Email: ${order.customerInfo.email}`);
        console.log(`   🆔 Clerk ID: ${order.customerInfo.clerkUserId}`);
        console.log(`   🔑 Código: ${order.pickupCode}`);
        console.log(`   📊 Estado: ${order.status}`);
        console.log(`   💰 Total: $${order.totalAmount}`);
        console.log(`   🏪 Tienda: ${order.storeInfo.storeName}`);
        console.log(`   📅 Creada: ${new Date(order.createdAt).toLocaleString()}`);
      });
      
      // Filtrar órdenes del usuario de prueba
      const userOrders = clickCollectData.data.orders.filter(
        order => order.customerInfo.clerkUserId === testUserId
      );
      
      console.log(`\n✅ Órdenes del usuario ${testUserId}: ${userOrders.length}`);
      
      if (userOrders.length > 0) {
        console.log('\n🎯 Estas órdenes deberían aparecer en /orders:');
        userOrders.forEach((order, index) => {
          console.log(`${index + 1}. ${order.orderNumber} - ${order.pickupCode} - $${order.totalAmount}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }
};

testUserOrders();