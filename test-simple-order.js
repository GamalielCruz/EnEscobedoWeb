// Script simplificado para probar la creación de órdenes
const testSimpleOrder = async () => {
  console.log('🧪 Probando creación de orden simple...\n');
  
  try {
    const testOrder = {
      orderNumber: `TEST-${Date.now()}`,
      customerName: 'Juan Pérez',
      customerEmail: 'juan.perez@example.com',
      clerkUserId: 'user_test123',
      phone: '+52 442 123 4567',
      storeId: 'test-store-001',
      storeName: 'Tienda Centro Pedro Escobedo',
      storeAddress: 'Calle Hidalgo 15, Centro',
      storePhone: '+52 442 234 5678',
      estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          product: {
            _id: 'test-product-1',
            name: 'Producto de Prueba',
            price: 25.99
          },
          quantity: 1
        }
      ],
      total: 25.99
    };
    
    console.log('📦 Datos de la orden:', JSON.stringify(testOrder, null, 2));
    console.log('\n📡 Enviando petición...');
    
    const response = await fetch('http://localhost:3000/api/create-click-collect-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testOrder)
    });
    
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    
    const responseText = await response.text();
    console.log('📄 Respuesta cruda:', responseText);
    
    try {
      const data = JSON.parse(responseText);
      console.log('📦 Respuesta parseada:', JSON.stringify(data, null, 2));
    } catch (parseError) {
      console.log('❌ Error parseando respuesta JSON:', parseError.message);
    }
    
  } catch (error) {
    console.error('❌ Error en la prueba:', error.message);
  }
};

testSimpleOrder();