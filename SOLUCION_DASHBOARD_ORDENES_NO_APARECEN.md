# Solución: Órdenes no aparecen en Dashboard

## Diagnóstico Realizado

### ✅ Verificaciones Completadas

1. **Tienda configurada correctamente**
   - ID: `491d7dff-8884-402e-8e2b-1bcb8630e8ec`
   - Nombre: Borona Pizza
   - Owner: `user_392Q7p9ahx7GuGwIit2aWNeWaak`

2. **Orden existe en Sanity**
   - Orden #: `1531dd7c-12a5-4dbc-a137-eb69f7011f00`
   - Tipo: `clickCollectOrder`
   - StoreId: `491d7dff-8884-402e-8e2b-1bcb8630e8ec` ✅ COINCIDE
   - Estado: `pending`
   - Cliente: CRUZ HERNANDEZ IGNACIO GAMALIEL

3. **Query de API funciona correctamente**
   - La query GROQ devuelve 1 orden
   - El storeId coincide perfectamente
   - La estructura de datos es correcta

### 🔍 Problema Identificado

El problema NO está en:
- ❌ La configuración de la tienda
- ❌ La query de Sanity
- ❌ Los datos de la orden

El problema ESTÁ en:
- ✅ **La autenticación o el frontend no está llamando correctamente a la API**

## Pasos para Diagnosticar en el Navegador

### 1. Abre el Dashboard
Navega a: `http://localhost:3000/dashboard`

### 2. Abre la Consola del Navegador
- Presiona `F12` o `Ctrl+Shift+I`
- Ve a la pestaña "Console"

### 3. Ejecuta el Script de Diagnóstico
Copia y pega el contenido de `debug-dashboard-browser.js` en la consola

### 4. Revisa la Pestaña Network
- Ve a la pestaña "Network" en DevTools
- Filtra por "store-orders"
- Busca la petición a `/api/dashboard/store-orders`
- Verifica:
  - ¿Se está haciendo la petición?
  - ¿Qué status code devuelve? (200, 401, 403, 500)
  - ¿Qué respuesta devuelve?

## Posibles Causas y Soluciones

### Causa 1: Hook no se está ejecutando
**Síntoma**: No ves ninguna petición a `/api/dashboard/store-orders` en Network

**Solución**: Verificar que el hook `useOrderNotifications` se está llamando correctamente

```typescript
// En app/(store)/dashboard/page.tsx línea ~100
const {
  orders,
  isLoading: ordersLoading,
  lastUpdate,
  refresh: refreshOrders,
} = useOrderNotifications({
  storeId: store?._id ?? null,  // ¿Tiene valor?
  enabled: !!store?._id && tab === "pedidos",  // ¿Es true?
  pollingInterval: 15000,
});
```

**Verificar**:
1. `store?._id` tiene el valor correcto
2. `tab === "pedidos"` es true
3. El hook está habilitado

### Causa 2: Error de autenticación (401)
**Síntoma**: La petición devuelve status 401

**Solución**: Verificar que estás autenticado con Clerk
- Cierra sesión y vuelve a iniciar sesión
- Verifica que tu Clerk User ID es correcto
- Limpia cookies y localStorage

### Causa 3: Error de permisos (403)
**Síntoma**: La petición devuelve status 403

**Solución**: Verificar que el `ownerClerkUserId` en Sanity coincide con tu Clerk User ID
- Tu Clerk ID: `user_392Q7p9ahx7GuGwIit2aWNeWaak`
- Debe estar exactamente así en el campo `ownerClerkUserId` de la tienda en Sanity

### Causa 4: storeId no se está pasando correctamente
**Síntoma**: La petición no incluye el parámetro `storeId`

**Solución**: Verificar que `store._id` tiene valor antes de llamar al hook

```typescript
// Agregar console.log para debug
useEffect(() => {
  console.log('🏪 Store ID:', store?._id);
  console.log('📋 Tab:', tab);
  console.log('✅ Hook enabled:', !!store?._id && tab === "pedidos");
}, [store?._id, tab]);
```

### Causa 5: El componente no se está re-renderizando
**Síntoma**: Los datos llegan pero no se muestran

**Solución**: Verificar que el estado `orders` se está actualizando

```typescript
// Agregar console.log en el hook
useEffect(() => {
  console.log('📦 Orders updated:', orders.length);
  console.log('📦 Orders:', orders);
}, [orders]);
```

## Script de Diagnóstico Rápido

Ejecuta esto en la consola del navegador cuando estés en `/dashboard`:

```javascript
// Verificar que la API funciona
fetch('/api/dashboard/store-orders?storeId=491d7dff-8884-402e-8e2b-1bcb8630e8ec')
  .then(r => r.json())
  .then(data => {
    console.log('✅ API Response:', data);
    if (data.success && data.orders) {
      console.log(`📦 Órdenes: ${data.orders.length}`);
      data.orders.forEach(o => console.log(`  - #${o.orderNumber}: ${o.status}`));
    } else {
      console.log('❌ Error:', data.error);
    }
  })
  .catch(err => console.error('❌ Fetch error:', err));
```

## Próximos Pasos

1. **Ejecuta el diagnóstico en el navegador** usando `debug-dashboard-browser.js`
2. **Revisa la pestaña Network** para ver si la petición se está haciendo
3. **Verifica el status code** de la respuesta
4. **Comparte los resultados** para continuar con la solución

## Archivos Relacionados

- `app/(store)/dashboard/page.tsx` - Componente del dashboard
- `hooks/useOrderNotifications.ts` - Hook de polling
- `app/api/dashboard/store-orders/route.ts` - API endpoint
- `debug-dashboard-browser.js` - Script de diagnóstico para navegador
- `check-order-store-reference.js` - Verificación de datos en Sanity
