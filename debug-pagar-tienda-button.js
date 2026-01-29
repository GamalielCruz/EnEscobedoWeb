/**
 * Script de diagnóstico para el botón "Pagar en Tienda"
 * Verifica por qué no funciona el click
 */

console.log('🔍 Diagnosticando botón "Pagar en Tienda"...');

// Simular el estado del componente cuando se hace click
const mockComponentState = {
  isSignedIn: true,
  isLoading: false,
  user: {
    id: 'user123',
    fullName: 'Test User',
    emailAddresses: [{ emailAddress: 'test@example.com' }]
  },
  savedStoreInfo: {
    deliveryMethod: 'pickup',
    storeId: 'store123',
    storeName: 'Test Store',
    storeAddress: 'Test Address',
    storePhone: '+52 123 456 7890',
    estimatedDelivery: 'Listo en 30 minutos',
    shippingCost: 0,
    timestamp: Date.now()
  }
};

// Simular la función handleCheckout
const simulateHandleCheckout = async (paymentMethod) => {
  console.log(`🎯 handleCheckout llamado con: ${paymentMethod}`);
  
  if (!mockComponentState.isSignedIn) {
    console.log('❌ Usuario no autenticado - función termina aquí');
    return;
  }
  
  console.log('✅ Usuario autenticado, continuando...');
  
  // Simular setIsLoading(true)
  console.log('⏳ setIsLoading(true)');
  
  try {
    if (paymentMethod === 'card') {
      console.log('💳 Procesando pago con tarjeta...');
      // Lógica de tarjeta
    } else if (paymentMethod === 'cod') {
      console.log('💵 Procesando pago en efectivo...');
      console.log('🔄 Ejecutando router.push("/checkout-cod")');
      
      // Verificar si hay datos en localStorage
      const savedStore = localStorage.getItem('clickCollectStore');
      if (savedStore) {
        console.log('✅ Datos encontrados en localStorage:', JSON.parse(savedStore));
      } else {
        console.log('❌ No hay datos en localStorage - esto podría ser el problema');
      }
      
      // Simular navegación
      console.log('🚀 Navegando a /checkout-cod...');
    }
    
    console.log('✅ Checkout completado exitosamente');
  } catch (error) {
    console.error('❌ Error en handleCheckout:', error);
  } finally {
    console.log('⏳ setIsLoading(false)');
  }
};

// Test 1: Verificar condiciones previas
console.log('\n📝 Test 1: Verificar condiciones previas');
console.log('isSignedIn:', mockComponentState.isSignedIn);
console.log('isLoading:', mockComponentState.isLoading);
console.log('user:', mockComponentState.user ? 'Presente' : 'Ausente');
console.log('savedStoreInfo:', mockComponentState.savedStoreInfo ? 'Presente' : 'Ausente');

// Test 2: Simular click en "Pagar en Tienda"
console.log('\n📝 Test 2: Simular click en "Pagar en Tienda"');
simulateHandleCheckout('cod');

// Test 3: Verificar posibles problemas
console.log('\n📝 Test 3: Posibles problemas identificados');

const possibleIssues = [];

// Verificar si el botón está deshabilitado
if (mockComponentState.isLoading) {
  possibleIssues.push('El botón está deshabilitado por isLoading=true');
}

if (!mockComponentState.isSignedIn) {
  possibleIssues.push('Usuario no autenticado');
}

// Verificar localStorage
try {
  const savedStore = localStorage.getItem('clickCollectStore');
  if (!savedStore) {
    possibleIssues.push('No hay datos en localStorage - la página checkout-cod mostrará "Selecciona una tienda primero"');
  }
} catch (e) {
  possibleIssues.push('Error accediendo a localStorage (entorno Node.js)');
}

if (possibleIssues.length === 0) {
  console.log('✅ No se encontraron problemas obvios');
  console.log('\n🔧 Posibles causas del problema:');
  console.log('1. Error de JavaScript no capturado que impide la ejecución');
  console.log('2. Problema con el router de Next.js');
  console.log('3. Evento click no se está propagando correctamente');
  console.log('4. Componente se está re-renderizando y perdiendo el estado');
} else {
  console.log('❌ Problemas encontrados:');
  possibleIssues.forEach((issue, index) => {
    console.log(`${index + 1}. ${issue}`);
  });
}

// Test 4: Verificar estructura del botón
console.log('\n📝 Test 4: Estructura esperada del botón');
console.log(`
Estructura esperada:
<button
  onClick={() => handleCheckout('cod')}
  disabled={isLoading}
  className="..."
>
  Contenido del botón
</button>

Verificaciones:
- ✅ onClick está definido como arrow function
- ✅ Pasa 'cod' como parámetro
- ✅ disabled depende de isLoading
- ⚠️  Verificar que no hay otros event handlers que interfieran
`);

console.log('\n🚨 Recomendaciones para debugging:');
console.log('1. Agregar console.log al inicio de handleCheckout');
console.log('2. Verificar que no hay errores en la consola del navegador');
console.log('3. Verificar que localStorage tiene datos válidos');
console.log('4. Verificar que el usuario está autenticado');
console.log('5. Verificar que no hay preventDefault() en algún lugar');

console.log('\n🔧 Código de debugging sugerido:');
console.log(`
const handleCheckout = async (paymentMethod: 'card' | 'cod') => {
  console.log('🎯 handleCheckout iniciado con:', paymentMethod);
  console.log('🔐 isSignedIn:', isSignedIn);
  console.log('⏳ isLoading:', isLoading);
  
  if (!isSignedIn) {
    console.log('❌ Usuario no autenticado');
    return;
  }
  
  setIsLoading(true);
  console.log('⏳ isLoading establecido a true');

  try {
    if (paymentMethod === 'cod') {
      console.log('💵 Procesando pago en efectivo...');
      console.log('📦 localStorage data:', localStorage.getItem('clickCollectStore'));
      console.log('🚀 Navegando a /checkout-cod');
      router.push('/checkout-cod');
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    setIsLoading(false);
    console.log('⏳ isLoading establecido a false');
  }
};
`);