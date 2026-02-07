# Script para ejecutar en la consola del navegador

## Instrucciones

1. Abre el dashboard: `http://localhost:3000/dashboard`
2. Abre la consola del navegador (F12)
3. Copia y pega este código completo:

```javascript
// 🔍 Test completo de la API del Dashboard
(async function testDashboardAPI() {
    console.clear();
    console.log('🔍 Iniciando test de API del Dashboard\n');
    console.log('═'.repeat(70));

    const storeId = '491d7dff-8884-402e-8e2b-1bcb8630e8ec';
    const url = `/api/dashboard/store-orders?storeId=${storeId}`;

    console.log('\n📡 Haciendo petición a:', url);
    
    try {
        const response = await fetch(url, {
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        });

        console.log('\n📊 Status:', response.status, response.statusText);
        
        const data = await response.json();
        
        console.log('\n📦 Respuesta completa:');
        console.log(data);
        
        if (data.success) {
            console.log('\n✅ Success:', data.success);
            console.log('📋 Órdenes encontradas:', data.orders?.length || 0);
            
            if (data.orders && data.orders.length > 0) {
                console.log('\n📝 Detalles de las órdenes:');
                data.orders.forEach((order, idx) => {
                    console.log(`\n  Orden ${idx + 1}:`);
                    console.log('    - ID:', order._id);
                    console.log('    - Número:', order.orderNumber);
                    console.log('    - Tipo:', order._type);
                    console.log('    - Estado:', order.status);
                    console.log('    - Cliente:', order.customerInfo?.name);
                    console.log('    - Tienda:', order.storeInfo?.storeName);
                    console.log('    - StoreId:', order.storeInfo?.storeId);
                    console.log('    - Items:', order.items?.length);
                });
            } else {
                console.log('\n⚠️ La API devolvió 0 órdenes');
                console.log('\n💡 Posibles causas:');
                console.log('   1. La query de Sanity no está encontrando las órdenes');
                console.log('   2. El storeId en la orden no coincide');
                console.log('   3. Hay un problema con la estructura de datos');
            }
        } else {
            console.log('\n❌ Error:', data.error);
        }
        
        console.log('\n═'.repeat(70));
        console.log('✅ Test completado');
        
        return data;
        
    } catch (error) {
        console.error('\n❌ Error de red:', error);
        console.log('\n═'.repeat(70));
        return null;
    }
})();
```

## Qué buscar en los resultados

### Si devuelve 0 órdenes:
```
📋 Órdenes encontradas: 0
⚠️ La API devolvió 0 órdenes
```
**Problema**: La query de Sanity no está encontrando las órdenes

### Si devuelve 1 orden:
```
📋 Órdenes encontradas: 1
  Orden 1:
    - ID: ...
    - Número: 1531dd7c-12a5-4dbc-a137-eb69f7011f00
```
**Problema**: Los datos llegan pero el componente no los muestra

### Si devuelve error 401:
```
❌ Error: No autorizado
```
**Problema**: No estás autenticado

### Si devuelve error 403:
```
❌ Error: No tienes permiso para esta tienda
```
**Problema**: El ownerClerkUserId no coincide

## Comparte los resultados

Copia y pega TODO lo que aparece en la consola después de ejecutar el script.
