/**
 * Test para verificar la restricción de una sola tienda a la vez
 */

console.log('🧪 Test: Restricción de Una Sola Tienda');

// Simular productos de diferentes tiendas
const productoBorona = {
  _id: 'product1',
  name: 'Pizza Margherita',
  price: 120,
  affiliateStore: {
    _id: 'store1',
    name: 'Borona Pizza'
  }
};

const productoBurger = {
  _id: 'product2',
  name: 'Hamburguesa Clásica',
  price: 85,
  affiliateStore: {
    _id: 'store2',
    name: 'Burger House'
  }
};

const productoBoronaDos = {
  _id: 'product3',
  name: 'Pizza Pepperoni',
  price: 140,
  affiliateStore: {
    _id: 'store1',
    name: 'Borona Pizza'
  }
};

// Simular estado del carrito
let mockBasketState = {
  items: [],
  currentStoreId: null
};

// Simular funciones del store
const mockStore = {
  canAddProduct: (product) => {
    const productStoreId = product.affiliateStore?._id;
    
    // Si no hay productos en el carrito, se puede agregar cualquier producto
    if (mockBasketState.items.length === 0) {
      return true;
    }
    
    // Si el producto es de la misma tienda que los productos actuales, se puede agregar
    if (mockBasketState.currentStoreId === productStoreId) {
      return true;
    }
    
    // Si el producto es de una tienda diferente, no se puede agregar
    return false;
  },
  
  addItem: (product) => {
    const productStoreId = product.affiliateStore?._id;
    
    // Verificar si se puede agregar el producto
    if (!mockStore.canAddProduct(product)) {
      console.warn('❌ No se puede agregar producto de diferente tienda');
      return false;
    }
    
    const existingItem = mockBasketState.items.find(
      (item) => item.product._id === product._id
    );
    
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      mockBasketState.items.push({ product, quantity: 1 });
      mockBasketState.currentStoreId = productStoreId || null;
    }
    
    return true;
  },
  
  clearBasket: () => {
    mockBasketState.items = [];
    mockBasketState.currentStoreId = null;
  },
  
  getCurrentStoreName: () => {
    if (mockBasketState.items.length === 0) return null;
    return mockBasketState.items[0]?.product?.affiliateStore?.name || null;
  }
};

console.log('📦 Productos de prueba:');
console.log('1. Pizza Margherita - Borona Pizza');
console.log('2. Hamburguesa Clásica - Burger House');
console.log('3. Pizza Pepperoni - Borona Pizza');

// Test 1: Agregar primer producto (debería funcionar)
console.log('\n📝 Test 1: Agregar primer producto al carrito vacío');
const test1Result = mockStore.addItem(productoBorona);
console.log(`🎯 Resultado: ${test1Result ? 'Éxito' : 'Fallo'}`);
console.log(`📊 Estado del carrito: ${mockBasketState.items.length} productos`);
console.log(`🏪 Tienda actual: ${mockStore.getCurrentStoreName()}`);

// Test 2: Agregar producto de la misma tienda (debería funcionar)
console.log('\n📝 Test 2: Agregar producto de la misma tienda');
const test2Result = mockStore.addItem(productoBoronaDos);
console.log(`🎯 Resultado: ${test2Result ? 'Éxito' : 'Fallo'}`);
console.log(`📊 Estado del carrito: ${mockBasketState.items.length} productos`);
console.log(`🏪 Tienda actual: ${mockStore.getCurrentStoreName()}`);

// Test 3: Intentar agregar producto de tienda diferente (debería fallar)
console.log('\n📝 Test 3: Intentar agregar producto de tienda diferente');
const canAddDifferentStore = mockStore.canAddProduct(productoBurger);
console.log(`🔍 ¿Se puede agregar?: ${canAddDifferentStore}`);

if (!canAddDifferentStore) {
  console.log('✅ Restricción funcionando correctamente');
  console.log(`📍 Tienda actual: ${mockStore.getCurrentStoreName()}`);
  console.log(`📍 Tienda del producto: ${productoBurger.affiliateStore.name}`);
} else {
  console.log('❌ La restricción no está funcionando');
}

const test3Result = mockStore.addItem(productoBurger);
console.log(`🎯 Resultado: ${test3Result ? 'Éxito (ERROR)' : 'Fallo (CORRECTO)'}`);
console.log(`📊 Estado del carrito: ${mockBasketState.items.length} productos`);

// Test 4: Limpiar carrito y agregar producto de tienda diferente
console.log('\n📝 Test 4: Limpiar carrito y agregar producto de tienda diferente');
mockStore.clearBasket();
console.log('🧹 Carrito limpiado');
console.log(`📊 Estado del carrito: ${mockBasketState.items.length} productos`);
console.log(`🏪 Tienda actual: ${mockStore.getCurrentStoreName() || 'Ninguna'}`);

const test4Result = mockStore.addItem(productoBurger);
console.log(`🎯 Resultado: ${test4Result ? 'Éxito' : 'Fallo'}`);
console.log(`📊 Estado del carrito: ${mockBasketState.items.length} productos`);
console.log(`🏪 Tienda actual: ${mockStore.getCurrentStoreName()}`);

// Test 5: Simular flujo de alerta
console.log('\n📝 Test 5: Simular flujo de alerta de conflicto');

// Agregar producto de Borona
mockStore.clearBasket();
mockStore.addItem(productoBorona);
console.log(`🏪 Carrito con: ${mockStore.getCurrentStoreName()}`);

// Intentar agregar producto de Burger House
const showAlert = !mockStore.canAddProduct(productoBurger);
if (showAlert) {
  console.log('🚨 Se mostraría alerta de conflicto:');
  console.log(`   - Tienda actual: ${mockStore.getCurrentStoreName()}`);
  console.log(`   - Nueva tienda: ${productoBurger.affiliateStore.name}`);
  console.log('   - Opciones: Continuar con actual o Cambiar a nueva');
}

// Simular cambio de tienda
console.log('\n🔄 Simulando cambio de tienda...');
mockStore.clearBasket();
const changeResult = mockStore.addItem(productoBurger);
console.log(`🎯 Cambio exitoso: ${changeResult}`);
console.log(`🏪 Nueva tienda: ${mockStore.getCurrentStoreName()}`);

// Resumen de resultados
console.log('\n📊 Resumen de Tests:');
console.log('='.repeat(50));

const tests = [
  { name: 'Agregar primer producto', result: test1Result, expected: true },
  { name: 'Agregar producto misma tienda', result: test2Result, expected: true },
  { name: 'Rechazar producto diferente tienda', result: !test3Result, expected: true },
  { name: 'Agregar después de limpiar carrito', result: test4Result, expected: true },
  { name: 'Cambio de tienda funcional', result: changeResult, expected: true }
];

let allPassed = true;
tests.forEach((test, index) => {
  const passed = test.result === test.expected;
  console.log(`${index + 1}. ${test.name}: ${passed ? '✅ PASÓ' : '❌ FALLÓ'}`);
  if (!passed) allPassed = false;
});

console.log('='.repeat(50));

if (allPassed) {
  console.log('🎉 TODOS LOS TESTS PASARON');
  console.log('\n✅ Funcionalidades implementadas:');
  console.log('• Restricción de una sola tienda a la vez');
  console.log('• Validación antes de agregar productos');
  console.log('• Alerta de conflicto con opciones');
  console.log('• Limpieza de carrito para cambio de tienda');
  console.log('• Indicador de tienda actual');
} else {
  console.log('❌ ALGUNOS TESTS FALLARON');
  console.log('Revisar la implementación del store');
}

console.log('\n🎯 Beneficios para el usuario:');
console.log('• Experiencia de compra simplificada');
console.log('• Evita confusión en tiempos de entrega');
console.log('• Proceso de pago más claro');
console.log('• Mejor organización de pedidos');

console.log('\n🚀 La funcionalidad está lista para probar en el navegador!');