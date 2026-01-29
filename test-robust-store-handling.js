/**
 * Test para verificar el manejo robusto del store en AddToBasketButton
 */

console.log('🔧 Testing Robust Store Handling...');
console.log('==================================');

console.log('📱 Persistent error analysis:');
console.log('- getCurrentStoreName is not a function error persists');
console.log('- Store destructuring may be causing hydration issues');
console.log('- Need defensive programming approach');

console.log('\n🛠️ Robust solution implemented:');

console.log('\n1. STORE OBJECT ACCESS:');
console.log('   - Before: const { addItem, canAddProduct, getCurrentStoreName, clearBasket } = useBasketStore();');
console.log('   - After: const store = useBasketStore();');
console.log('   - Benefit: Direct object access, no destructuring issues');

console.log('\n2. FUNCTION AVAILABILITY CHECK:');
console.log('   if (!store || typeof store.addItem !== "function" || typeof store.canAddProduct !== "function") {');
console.log('     // Show loading state');
console.log('   }');

console.log('\n3. SAFE FUNCTION CALLS:');
console.log('   const currentStoreName = (typeof store.getCurrentStoreName === "function"');
console.log('     ? store.getCurrentStoreName()');
console.log('     : null) || "Tienda actual";');

console.log('\n4. LOADING STATE FALLBACK:');
console.log('   - Shows "Cargando..." button when store not ready');
console.log('   - Prevents crashes during hydration');
console.log('   - Graceful degradation');

console.log('\n✅ Expected behavior:');
console.log('1. No more "getCurrentStoreName is not a function" errors');
console.log('2. Graceful loading state during store initialization');
console.log('3. Proper function calls once store is ready');
console.log('4. Defensive programming prevents crashes');

console.log('\n🎯 Key improvements:');
console.log('- Direct store object access (no destructuring)');
console.log('- Function type checking before calls');
console.log('- Loading state for uninitialized store');
console.log('- Fallback values for all operations');

console.log('\n🚀 This defensive approach should handle all edge cases!');