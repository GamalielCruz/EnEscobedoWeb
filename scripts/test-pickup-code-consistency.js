// Script para probar la consistencia del código de recogida
const BASE_URL = 'http://localhost:3000';

async function testPickupCodeConsistency() {
  console.log('🧪 Probando consistencia del código de recogida...\n');

  try {
    // 1. Crear una orden Click & Collect
    console.log('1️⃣ Creando orden Click & Collect...');
    const orderData = {
      orderNumber: `CC-TEST-${Date.now()}`,
      customerName: 'Usuario de Prueba',
      customerEmail: 'test@example.com',
      clerkUserId: 'test_user_123',
      phone: '+52 442 123 4567',
      notes: 'Orden de prueba para verificar código de recogida',
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
    console.log('✅ Orden creada exitosamente');
    
    const orderNumber = createResult.data.orderNumber;
    const pickupCodeFromAPI = createResult.data.pickupCode;
    
    console.log(`📋 Número de orden: ${orderNumber}`);
    console.log(`🔑 Código de recogida de la API: ${pickupCodeFromAPI}`);

    // 2. Consultar la orden para verificar que el código se guardó correctamente
    console.log('\n2️⃣ Consultando orden en la base de datos...');
    
    const getResponse = await fetch(`${BASE_URL}/api/click-collect-orders?orderNumber=${orderNumber}`);
    
    if (!getResponse.ok) {
      throw new Error(`Error consultando orden: ${getResponse.status}`);
    }

    const getResult = await getResponse.json();
    const order = getResult.data.orders[0];
    const pickupCodeFromDB = order.pickupCode;
    
    console.log(`🔑 Código de recogida en la DB: ${pickupCodeFromDB}`);

    // 3. Verificar consistencia
    console.log('\n3️⃣ Verificando consistencia...');
    
    if (pickupCodeFromAPI === pickupCodeFromDB) {
      console.log('✅ ¡CORRECTO! Los códigos son consistentes');
      console.log(`   API: ${pickupCodeFromAPI}`);
      console.log(`   DB:  ${pickupCodeFromDB}`);
    } else {
      console.log('❌ ERROR: Los códigos NO son consistentes');
      console.log(`   API: ${pickupCodeFromAPI}`);
      console.log(`   DB:  ${pickupCodeFromDB}`);
      return false;
    }

    // 4. Simular la URL que se pasaría a la página de éxito
    console.log('\n4️⃣ Simulando URL de página de éxito...');
    
    const successUrl = `${BASE_URL}/success-click-collect?orderNumber=${orderNumber}&pickupCode=${pickupCodeFromAPI}`;
    console.log(`🔗 URL de éxito: ${successUrl}`);

    // 5. Verificar que la página de éxito recibiría el código correcto
    console.log('\n5️⃣ Verificando parámetros de URL...');
    
    const url = new URL(successUrl);
    const orderNumberFromUrl = url.searchParams.get('orderNumber');
    const pickupCodeFromUrl = url.searchParams.get('pickupCode');
    
    console.log(`📋 Número de orden desde URL: ${orderNumberFromUrl}`);
    console.log(`🔑 Código de recogida desde URL: ${pickupCodeFromUrl}`);

    if (pickupCodeFromUrl === pickupCodeFromAPI && pickupCodeFromUrl === pickupCodeFromDB) {
      console.log('✅ ¡PERFECTO! Todos los códigos son consistentes');
    } else {
      console.log('❌ ERROR: Inconsistencia detectada');
      return false;
    }

    console.log('\n🎉 Prueba completada exitosamente!');
    console.log('\n📊 Resumen:');
    console.log('===========');
    console.log(`✅ Código generado por API: ${pickupCodeFromAPI}`);
    console.log(`✅ Código guardado en DB: ${pickupCodeFromDB}`);
    console.log(`✅ Código pasado a página de éxito: ${pickupCodeFromUrl}`);
    console.log(`✅ Todos los códigos son idénticos: ${pickupCodeFromAPI === pickupCodeFromDB && pickupCodeFromDB === pickupCodeFromUrl}`);

    return true;

  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
    return false;
  }
}

// Ejecutar la prueba
testPickupCodeConsistency().then(success => {
  if (success) {
    console.log('\n🎯 RESULTADO: El sistema de códigos de recogida está funcionando correctamente');
  } else {
    console.log('\n🚨 RESULTADO: Se detectaron problemas en el sistema de códigos de recogida');
  }
});