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

async function checkRecentOrders() {
  try {
    console.log("=== VERIFICANDO PEDIDOS RECIENTES ===");
    
    // Buscar pedidos de las últimas 2 horas
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    
    const recentOrders = await client.fetch(`*[_type in ["order", "clickCollectOrder"] && orderDate >= $twoHoursAgo]{
      _type,
      orderNumber,
      orderDate,
      status,
      paymentMethod,
      clerkUserId,
      stripeCheckoutSessionId,
      customerName,
      email,
      totalPrice,
      "pickupStore": pickupStore->name,
      "affiliateStore": affiliateStore->name
    } | order(orderDate desc)`, { twoHoursAgo });
    
    console.log(`Pedidos encontrados: ${recentOrders.length}`);
    
    if (recentOrders.length === 0) {
      console.log("❌ No se encontraron pedidos recientes");
      
      // Buscar todos los pedidos para ver si hay alguno
      const allOrders = await client.fetch(`*[_type in ["order", "clickCollectOrder"]][0...5]{
        _type,
        orderNumber,
        orderDate,
        status,
        paymentMethod,
        clerkUserId,
        customerName,
        email,
        totalPrice
      } | order(orderDate desc)`);
      
      console.log("\n=== ÚLTIMOS 5 PEDIDOS (TODOS) ===");
      if (allOrders.length === 0) {
        console.log("❌ No hay pedidos en el sistema");
      } else {
        allOrders.forEach((order, index) => {
          console.log(`\n${index + 1}. ${order.orderNumber}`);
          console.log(`   Tipo: ${order._type}`);
          console.log(`   Fecha: ${order.orderDate}`);
          console.log(`   Estado: ${order.status}`);
          console.log(`   Método: ${order.paymentMethod}`);
          console.log(`   Cliente: ${order.customerName} (${order.email})`);
          console.log(`   Total: $${order.totalPrice}`);
        });
      }
    } else {
      console.log("\n=== PEDIDOS RECIENTES ===");
      recentOrders.forEach((order, index) => {
        console.log(`\n${index + 1}. ${order.orderNumber}`);
        console.log(`   Tipo: ${order._type}`);
        console.log(`   Fecha: ${order.orderDate}`);
        console.log(`   Estado: ${order.status}`);
        console.log(`   Método: ${order.paymentMethod}`);
        console.log(`   Cliente: ${order.customerName} (${order.email})`);
        console.log(`   Usuario Clerk: ${order.clerkUserId}`);
        console.log(`   Tienda: ${order.pickupStore || order.affiliateStore || 'No especificada'}`);
        console.log(`   Total: $${order.totalPrice}`);
        console.log(`   Stripe Session: ${order.stripeCheckoutSessionId || 'No disponible'}`);
      });
    }
    
  } catch (error) {
    console.error("Error:", error);
  }
}

checkRecentOrders();
