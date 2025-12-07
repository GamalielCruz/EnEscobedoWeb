// Script simple para probar la API
async function testAPI() {
  try {
    console.log('🧪 Probando API nearest-store...');
    
    // Probar GET
    console.log('\n1. Probando GET /api/nearest-store');
    const getResponse = await fetch('http://localhost:3000/api/nearest-store');
    const getData = await getResponse.json();
    console.log('GET Response:', JSON.stringify(getData, null, 2));
    
    // Probar POST
    console.log('\n2. Probando POST /api/nearest-store');
    const postResponse = await fetch('http://localhost:3000/api/nearest-store', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: {
          street: 'Av. Francisco I. Madero 50',
          city: 'Ciudad de México',
          state: 'CDMX'
        }
      })
    });
    
    const postData = await postResponse.json();
    console.log('POST Response:', JSON.stringify(postData, null, 2));
    
    console.log('\n✅ Pruebas completadas!');
    
  } catch (error) {
    console.error('❌ Error en las pruebas:', error);
  }
}

testAPI();