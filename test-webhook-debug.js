// Script para simular un pago completo de Stripe y crear el pedido directamente
const { createClient } = require("@sanity/client");
const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

async function createTestOrder() {
  try {
    console.log("🧪 Creando pedido de prueba directo en Sanity...");
    
    const orderData = {
      _type: "order",
      orderNumber: "TEST-" + Date.now(),
      stripeCheckoutSessionId: "test_session_" + Date.now(),
      stripePaymentIntentId: "test_pi_" + Date.now(),
      customerName: "Cliente de Prueba",
      stripeCustomerId: "cus_test_" + Date.now(),
      clerkUserId: "user_39PJAdoHsbEvxZpKcZEmhIVzNHL", // Tu usuario de prueba
      email: "test@example.com",
      phone: "+1234567890",
      paymentMethod: "card",
      currency: "mxn",
      amountDiscount: 0,
      products: [
        {
          _key: "item_" + Date.now(),
          product: {
            _type: "reference",
            _ref: "70a5bb8d-10f5-4932-850c-38f5e1747d75" // ID de un producto real
          },
          quantity: 2
        }
      ],
      totalPrice: 32,
      status: "paid",
      orderDate: new Date().toISOString(),
      // Campos para delivery
      deliveryMethod: "delivery",
      customerAddress: "Salon Verde, 76700, Pedro Escobedo, Qro., México",
      affiliateStore: {
        _type: "reference",
        _ref: "a36a9d33-ee5f-4b17-bedf-40a715577c01" // Tienda de Crepas
      }
    };
    
    const order = await client.create(orderData);
    
    console.log("✅ Pedido creado exitosamente:");
    console.log("   Order Number:", order.orderNumber);
    console.log("   Status:", order.status);
    console.log("   Total:", order.totalPrice);
    console.log("   Cliente:", order.customerName);
    console.log("   Tienda:", "Tienda de Crepas");
    
    return order;
    
  } catch (error) {
    console.error("❌ Error creando pedido:", error);
    throw error;
  }
}

createTestOrder().then(() => {
  console.log("\n🎯 Ahora verifica:");
  console.log("1. Ve a http://localhost:3000/orders (vista del cliente)");
  console.log("2. Ve a http://localhost:3000/dashboard (vista del restaurante)");
  console.log("3. El pedido debería aparecer en ambos lugares");
}).catch(console.error);
