// Script para probar la creación y consulta de órdenes de click and collect
// Ejecutar con: node test-click-collect-orders.js

const testClickCollectOrders = async () => {
  const baseUrl = 'http://localhost:3000'; // Ajustar según tu configuración
  
  console.log('🧪 Probando sistema de órdenes Click & Collect...\n');
  
  try {
    // 1. Consultar órdenes existentes
    console.log('1️⃣ Consultando órdenes existentes...');
    const ordersResponse = await fetch(`${baseUrl}/api/click-collect-orders`);
    const ordersData = await ordersResponse.json();
    
    console.log('📋 Órdenes existentes:', JSON.stringify(ordersData, null, 2));
    console.log(`📊 Total de órdenes: ${ordersData.data?.count || 0}\n`);
    
    // 2. Crear una orden de prueba
    console.log('2️⃣ Creando orden de prueba...');
    const testOrder = {
      orderNumber: `TEST-${Date.now()}`,
      customerName: 'Juan Pérez',
      customerEmail: 'juan.perez@example.com',
      clerkUserId: 'user_test123',
      phone: '+52 442 123 4567',
      notes: 'Orden de prueba - favor manejar con cuidado',
      storeId: 'test-store-001',
      storeName: 'Tienda Centro Pedro Escobedo',
      storeAddress: 'Calle Hidalgo 15, Centro, Pedro Escobedo, Querétaro',
      storePhone: '+52 442 234 5678',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          product: {
            _id: 'test-product-1',
            id: 'test-product-1',
            name: 'Producto de Prueba 1',
            price: 25.99
          },
          quantity: 2
        },
        {
          product: {
            _id: 'test-product-2',
            id: 'test-product-2',
            name: 'Producto de Prueba 2',
            price: 15.50
          },
          quantity: 1
        }
      ],
      total: 67.48,
      paymentMethod: 'cash_on_pickup'
    };
    
    const createResponse = await fetch(`${baseUrl}/api/create-click-collect-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testOrder)
    });
    
    const createData = await createResponse.json();
    console.log('📦 Respuesta de creación:', JSON.stringify(createData, null, 2));
    
    if (createData.success) {
      console.log('✅ Orden creada exitosamente!');
      console.log(`📋 Número de orden: ${createData.data.orderNumber}`);
      console.log(`🔑 Código de recogida: ${createData.data.pickupCode}`);
      console.log(`🏪 Tienda: ${createData.data.storeInfo.name}`);
      console.log(`💰 Total: $${createData.data.total}\n`);
      
      // 3. Consultar la orden recién creada
      console.log('3️⃣ Consultando la orden recién creada...');
      const orderResponse = await fetch(`${baseUrl}/api/click-collect-orders?orderNumber=${createData.data.orderNumber}`);
      const orderData = await orderResponse.json();
      
      console.log('🔍 Orden encontrada:', JSON.stringify(orderData, null, 2));
      
      if (orderData.success && orderData.data.orders.length > 0) {
        const order = orderData.data.orders[0];
        console.log('✅ Orden verificada en Sanity:');
        console.log(`   📋 ID: ${order._id}`);
        console.log(`   📋 Número: ${order.orderNumber}`);
        console.log(`   👤 Cliente: ${order.customerInfo.name}`);
        console.log(`   📧 Email: ${order.customerInfo.email}`);
        console.log(`   🏪 Tienda: ${order.storeInfo.storeName}`);
        console.log(`   📦 Items: ${order.items.length}`);
        console.log(`   💰 Total: $${order.totalAmount}`);
        console.log(`   📊 Estado: ${order.status}`);
        console.log(`   📅 Creada: ${new Date(order.createdAt).toLocaleString()}\n`);
        
        // 4. Probar actualización de estado
        console.log('4️⃣ Probando actualización de estado...');
        const updateResponse = await fetch(`${baseUrl}/api/click-collect-orders`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            orderNumber: order.orderNumber,
            status: 'processing',
            notes: 'Orden en proceso de preparación'
          })
        });
        
        const updateData = await updateResponse.json();
        console.log('🔄 Respuesta de actualización:', JSON.stringify(updateData, null, 2));
        
        if (updateData.success) {
          console.log('✅ Estado actualizado exitosamente!');
        } else {
          console.log('❌ Error actualizando estado:', updateData.error);
        }
        
      } else {
        console.log('❌ No se pudo encontrar la orden recién creada');
      }
      
    } else {
      console.log('❌ Error creando orden:', createData.error);
    }
    
    // 5. Consultar órdenes por estado
    console.log('\n5️⃣ Consultando órdenes por estado...');
    const pendingResponse = await fetch(`${baseUrl}/api/click-collect-orders?status=pending`);
    const pendingData = await pendingResponse.json();
    
    console.log(`📋 Órdenes pendientes: ${pendingData.data?.count || 0}`);
    
    const processingResponse = await fetch(`${baseUrl}/api/click-collect-orders?status=processing`);
    const processingData = await processingResponse.json();
    
    console.log(`🔄 Órdenes en proceso: ${processingData.data?.count || 0}`);
    
    const readyResponse = await fetch(`${baseUrl}/api/click-collect-orders?status=ready_for_pickup`);
    const readyData = await readyResponse.json();
    
    console.log(`📦 Órdenes listas: ${readyData.data?.count || 0}`);
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    console.log('\n💡 Asegúrate de que:');
    console.log('   - El servidor esté ejecutándose en http://localhost:3000');
    console.log('   - Sanity esté configurado correctamente');
    console.log('   - El esquema clickCollectOrder esté desplegado');
  }
};

// Ejecutar la prueba
testClickCollectOrders();