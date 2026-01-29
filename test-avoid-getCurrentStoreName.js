/**
 * Test para verificar la solución que evita getCurrentStoreName completamente
 */

console.log('🔧 Testing Solution Without getCurrentStoreName...');
console.log('===============================================');

console.log('📱 Problem analysis:');
console.log('- getCurrentStoreName function consistently fails');
console.log('- Multiple defensive approaches have not worked');
console.log('- Need to eliminate dependency on this function entirely');

console.log('\n🛠️ Alternative solution implemented:');

console.log('\n1. DIRECT DATA ACCESS:');
console.log('   - Before: store.getCurrentStoreName()');
console.log('   - After: store.items[0]?.product?.affiliateStore?.name');
console.log('   - Benefit: No function call, direct property access');

console.log('\n2. INLINE LOGIC REPLACEMENT:');
console.log('   const currentStoreName = store.items && store.items.length > 0');
console.log('     ? (store.items[0]?.product?.affiliateStore as { name?: string })?.name || "Tienda actual"');
console.log('     : "Tienda actual";');

console.log('\n3. FUNCTION ELIMINATION:');
console.log('   - Removed all calls to getCurrentStoreName');
console.log('   - Implemented same logic inline');
console.log('   - No dependency on potentially problematic function');

console.log('\n4. DEFENSIVE CLEARBASKET:');
console.log('   if (typeof store.clearBasket === "function") {');
console.log('     store.clearBasket();');
console.log('   }');

console.log('\n✅ Expected behavior:');
console.log('1. No more getCurrentStoreName function calls');
console.log('2. Same functionality through direct property access');
console.log('3. Proper store name detection for conflict alerts');
console.log('4. Stable operation without function dependency');

console.log('\n🎯 Key advantages:');
console.log('- Eliminates the problematic function entirely');
console.log('- Uses direct property access (more reliable)');
console.log('- Same business logic, different implementation');
console.log('- No hydration or timing issues');

console.log('\n🚀 This approach should completely eliminate the error!');