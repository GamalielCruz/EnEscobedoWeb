// Script para probar el flujo completo de estados de Click & Collect
const BASE_URL = "http://localhost:3000";

async function testClickCollectStatus() {
  console.log("🧪 Iniciando prueba de estados Click & Collect...\n");

  try {
    // 1. Crear una orden de prueba
    console.log("1️⃣ Creando orden Click & Collect...");
    const orderData = {
      orderNumber: `CC-TEST-${Date.now()}`,
      customerName: "Usuario de Prueba",
      customerEmail: "test@example.com",
      clerkUserId: "test_user_123",
      phone: "+52 442 123 4567",
      notes: "Orden de prueba para verificar estados",
      storeId: "store_001",
      storeName: "Miscelanea Erika",
      storeAddress: "5 de febrero #64, Pedro Escobedo, Querétaro",
      storePhone: "+52 442 123 4567",
      estimatedDelivery: "mañana por la tarde",
      items: [
        {
          product: {
            _id: "test_product_1",
            name: "Producto de Prueba",
            price: 299.99,
          },
          quantity: 1,
        },
      ],
      total: 299.99,
      paymentMethod: "cash_on_pickup",
    };

    const createResponse = await fetch(
      `${BASE_URL}/api/create-click-collect-order`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(orderData),
      }
    );

    if (!createResponse.ok) {
      throw new Error(`Error creando orden: ${createResponse.status}`);
    }

    const createResult = await createResponse.json();
    console.log("✅ Orden creada:", {
      orderNumber: createResult.data.orderNumber,
      pickupCode: createResult.data.pickupCode,
      status: "pending (inicial)",
    });

    const orderNumber = createResult.data.orderNumber;

    // 2. Consultar la orden recién creada
    console.log("\n2️⃣ Consultando orden recién creada...");
    const getResponse = await fetch(
      `${BASE_URL}/api/click-collect-orders?orderNumber=${orderNumber}`
    );

    if (!getResponse.ok) {
      throw new Error(`Error consultando orden: ${getResponse.status}`);
    }

    const getResult = await getResponse.json();
    const order = getResult.data.orders[0];

    console.log("📋 Estado actual de la orden:", {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: new Date(order.createdAt).toLocaleString("es-MX"),
    });

    // 3. Simular cambio de estado a "processing"
    console.log('\n3️⃣ Actualizando estado a "processing"...');
    const updateResponse1 = await fetch(
      `${BASE_URL}/api/click-collect-orders`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderNumber: orderNumber,
          status: "processing",
          notes: "Pedido en tránsito a la tienda",
        }),
      }
    );

    if (!updateResponse1.ok) {
      throw new Error(
        `Error actualizando a processing: ${updateResponse1.status}`
      );
    }

    const updateResult1 = await updateResponse1.json();
    console.log("✅ Estado actualizado a:", updateResult1.data.status);

    // 4. Simular cambio de estado a "ready_for_pickup"
    console.log('\n4️⃣ Actualizando estado a "ready_for_pickup"...');
    const updateResponse2 = await fetch(
      `${BASE_URL}/api/click-collect-orders`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderNumber: orderNumber,
          status: "ready_for_pickup",
          notes: "Pedido listo para recoger en tienda",
        }),
      }
    );

    if (!updateResponse2.ok) {
      throw new Error(
        `Error actualizando a ready_for_pickup: ${updateResponse2.status}`
      );
    }

    const updateResult2 = await updateResponse2.json();
    console.log("✅ Estado actualizado a:", updateResult2.data.status);

    // 5. Consultar estado final
    console.log("\n5️⃣ Consultando estado final...");
    const finalResponse = await fetch(
      `${BASE_URL}/api/click-collect-orders?orderNumber=${orderNumber}`
    );
    const finalResult = await finalResponse.json();
    const finalOrder = finalResult.data.orders[0];

    console.log("📋 Estado final de la orden:", {
      orderNumber: finalOrder.orderNumber,
      status: finalOrder.status,
      readyAt: finalOrder.readyAt
        ? new Date(finalOrder.readyAt).toLocaleString("es-MX")
        : "No establecido",
      updatedAt: new Date(finalOrder.updatedAt).toLocaleString("es-MX"),
    });

    console.log("\n🎉 Prueba completada exitosamente!");
    console.log("\n📝 Resumen del flujo:");
    console.log("   1. pending → En Preparación (estado inicial)");
    console.log("   2. processing → En Tránsito a Tienda");
    console.log("   3. ready_for_pickup → Listo para Recoger");
    console.log("   4. completed → Completado (cuando el cliente recoge)");
  } catch (error) {
    console.error("❌ Error en la prueba:", error.message);
  }
}

// Ejecutar la prueba
testClickCollectStatus();
