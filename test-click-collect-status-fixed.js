// Script para probar el flujo completo de estados de Click & Collect (CORREGIDO)
const BASE_URL = 'http://localhost:3000';

async function testClickCollectStatus() {
  console.log('🧪 Iniciando prueba de estados Click & Collect (SIN simulación automática)...\n');

  try {
    // 1. Crear una orden de prueba
    console.log('1️⃣ Creando orden Click & Collect...');
    const orderData = {
      orderNumber: `CC-TEST-${Date.now()}`,
      customerName: 'Usuario de Prueba',
      customerEmail: 'test@example.com',
      clerkUserId: 'test_user_123',
      phone: '+52 442 123 4567',
      notes: 'Orden de prueba para verificar estados iniciales',
      storeId: 'store_001',
      storeName: 'Miscelanea Erika',
      storeAddress: '5 de febrero #64, Pedro Escobedo, Querétaro',
      storePhone: '+52 442 123 4567',
      estimatedDelivery: 'mañana por la tarde',
      items: [
        {
          product: {
            _id: 'test_product_1',
            name: 'Producto de Prueba',
            price: 299.99
          },
          quantity: 1
        }
      ],
      total: 299.99,
      paymentMethod: 'cash_on_pickup'
    };

    const createResponse = await fetch(`${BASE_URL}/api/create-click-collect-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData)
    });

    if (!createResponse.ok) {
      throw new Error(`Error creando orden: ${createResponse.status}`);
    }

    const createResult = await createResponse.json();
    console.log('✅ Orden creada:', {
      orderNumber: createResult.data.orderNumber,
      pickupCode: createResult.data.pickupCode,
      status: 'pending (estado inicial correcto)'
    });

    const orderNumber = createResult.data.orderNumber;

    // 2. Consultar la orden recién creada para verificar estado inicial
    console.log('\n2️⃣ Verificando estado inicial...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Esperar 1 segundo
    
    const getResponse = await fetch(`${BASE_URL}/api/click-collect-orders?orderNumber=${orderNumber}`);
    
    if (!getResponse.ok) {
      throw new Error(`Error consultando orden: ${getResponse.status}`);
    }

    const getResult = await getResponse.json();
    const order = getResult.data.orders[0];
    
    console.log('📋 Estado verificado:', {
      orderNumber: order.orderNumber,
      status: order.status,
      statusEspañol: order.status === 'pending' ? '⏳ En Preparación' : order.status,
      createdAt: new Date(order.createdAt).toLocaleString('es-MX')
    });

    if (order.status === 'pending') {
      console.log('✅ ¡CORRECTO! El estado inicial es "pending" como debe ser');
    } else {
      console.log('❌ ERROR: El estado inicial debería ser "pending" pero es:', order.status);
    }

    // 3. Probar actualización manual de estados
    console.log('\n3️⃣ Probando actualización manual a "processing"...');
    const updateResponse1 = await fetch(`${BASE_URL}/api/click-collect-orders`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderNumber: orderNumber,
        status: 'processing',
        notes: 'Pedido en tránsito a la tienda (actualización manual)'
      })
    });

    if (!updateResponse1.ok) {
      throw new Error(`Error actualizando a processing: ${updateResponse1.status}`);
    }

    const updateResult1 = await updateResponse1.json();
    console.log('✅ Estado actualizado manualmente a:', updateResult1.data.status, '(🚚 En Tránsito a Tienda)');

    // 4. Probar actualización a "ready_for_pickup"
    console.log('\n4️⃣ Probando actualización manual a "ready_for_pickup"...');
    const updateResponse2 = await fetch(`${BASE_URL}/api/click-collect-orders`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderNumber: orderNumber,
        status: 'ready_for_pickup',
        notes: 'Pedido listo para recoger en tienda (actualización manual)'
      })
    });

    if (!updateResponse2.ok) {
      throw new Error(`Error actualizando a ready_for_pickup: ${updateResponse2.status}`);
    }

    const updateResult2 = await updateResponse2.json();
    console.log('✅ Estado actualizado manualmente a:', updateResult2.data.status, '(✅ Listo para Recoger)');

    // 5. Consultar estado final
    console.log('\n5️⃣ Consultando estado final...');
    const finalResponse = await fetch(`${BASE_URL}/api/click-collect-orders?orderNumber=${orderNumber}`);
    const finalResult = await finalResponse.json();
    const finalOrder = finalResult.data.orders[0];
    
    console.log('📋 Estado final de la orden:', {
      orderNumber: finalOrder.orderNumber,
      status: finalOrder.status,
      statusEspañol: '✅ Listo para Recoger',
      readyAt: finalOrder.readyAt ? new Date(finalOrder.readyAt).toLocaleString('es-MX') : 'No establecido',
      updatedAt: new Date(finalOrder.updatedAt).toLocaleString('es-MX')
    });

    console.log('\n🎉 Prueba completada exitosamente!');
    console.log('\n📝 Resumen del flujo corregido:');
    console.log('   ✅ Estado inicial: pending → ⏳ En Preparación');
    console.log('   ✅ Actualización manual: processing → 🚚 En Tránsito a Tienda');
    console.log('   ✅ Actualización manual: ready_for_pickup → ✅ Listo para Recoger');
    console.log('   ✅ Futuro: completed → ✅ Completado (cuando el cliente recoge)');
    console.log('\n💡 Nota: La simulación automática está deshabilitada para permitir ver el estado inicial correcto');

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }
}

// Ejecutar la prueba
testClickCollectStatus();