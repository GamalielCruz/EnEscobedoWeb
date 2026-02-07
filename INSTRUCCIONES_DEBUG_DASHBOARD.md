# Instrucciones para Diagnosticar Dashboard

## ✅ Lo que hemos verificado

1. **La tienda existe y está configurada correctamente**
   - ID: `491d7dff-8884-402e-8e2b-1bcb8630e8ec`
   - Nombre: Borona Pizza
   - Owner: `user_392Q7p9ahx7GuGwIit2aWNeWaak` ✅

2. **La orden existe en Sanity**
   - Orden #: `1531dd7c-12a5-4dbc-a137-eb69f7011f00`
   - StoreId coincide perfectamente ✅
   - Estado: `pending`

3. **La query de la API funciona**
   - Devuelve 1 orden correctamente ✅

## 🔧 Cambios realizados

He agregado **logs de debug** en el código para identificar exactamente dónde está el problema:

### Archivos modificados:
1. `app/(store)/dashboard/page.tsx` - Agregado logging del estado del hook
2. `hooks/useOrderNotifications.ts` - Agregado logging de las peticiones

## 📋 Pasos para diagnosticar

### 1. Reinicia el servidor de desarrollo

```bash
# Detén el servidor actual (Ctrl+C)
# Luego reinicia:
npm run dev
```

### 2. Abre el Dashboard en el navegador

Navega a: `http://localhost:3000/dashboard`

### 3. Abre la Consola del Navegador

- Presiona `F12` o `Ctrl+Shift+I`
- Ve a la pestaña **"Console"**

### 4. Busca los logs de debug

Deberías ver mensajes como estos:

```
🔍 [Dashboard Debug]
  - Store ID: 491d7dff-8884-402e-8e2b-1bcb8630e8ec
  - Tab: pedidos
  - Hook enabled: true
  - Orders count: 0 o 1
  - Orders loading: false
  - Last update: ...
```

Y también:

```
🔍 [useOrderNotifications] Fetching orders for store: 491d7dff-8884-402e-8e2b-1bcb8630e8ec
🔍 [useOrderNotifications] Response status: 200
🔍 [useOrderNotifications] Response data: { success: true, orders: [...] }
```

### 5. Revisa la pestaña Network

- Ve a la pestaña **"Network"** en DevTools
- Filtra por: `store-orders`
- Busca la petición a `/api/dashboard/store-orders`
- Haz clic en ella y revisa:
  - **Headers**: ¿Incluye el parámetro `storeId`?
  - **Response**: ¿Qué devuelve?
  - **Status**: ¿Es 200, 401, 403?

## 🎯 Qué buscar en los logs

### Escenario 1: Hook no se ejecuta
```
🔍 [useOrderNotifications] Fetch skipped: { storeId: null, enabled: false }
```
**Problema**: El hook no está habilitado
**Causa**: `store._id` es null o `tab` no es "pedidos"

### Escenario 2: Error de autenticación
```
🔍 [useOrderNotifications] Response status: 401
```
**Problema**: No estás autenticado
**Solución**: Cierra sesión y vuelve a iniciar sesión

### Escenario 3: Error de permisos
```
🔍 [useOrderNotifications] Response status: 403
```
**Problema**: El `ownerClerkUserId` no coincide
**Solución**: Verifica en Sanity Studio que el campo está correcto

### Escenario 4: API funciona pero no se muestran
```
🔍 [useOrderNotifications] Response data: { success: true, orders: [1 orden] }
🔍 [Dashboard Debug]
  - Orders count: 0  ← ❌ PROBLEMA AQUÍ
```
**Problema**: Los datos llegan pero no se actualizan en el estado
**Causa**: Posible problema con el estado de React

### Escenario 5: Todo funciona correctamente
```
🔍 [useOrderNotifications] Response data: { success: true, orders: [1 orden] }
🔍 [Dashboard Debug]
  - Orders count: 1  ← ✅ CORRECTO
  - Orders: [{ orderNumber: "1531dd7c...", ... }]
```
**Resultado**: Las órdenes deberían aparecer en la UI

## 📸 Qué compartir

Por favor comparte:

1. **Captura de pantalla de la consola** con los logs de debug
2. **Captura de la pestaña Network** mostrando la petición a `store-orders`
3. **El contenido de la respuesta** de la API (clic en la petición → Response)

## 🔍 Script adicional para probar en la consola

Si quieres probar manualmente, ejecuta esto en la consola del navegador:

```javascript
// Probar la API directamente
fetch('/api/dashboard/store-orders?storeId=491d7dff-8884-402e-8e2b-1bcb8630e8ec')
  .then(r => {
    console.log('Status:', r.status);
    return r.json();
  })
  .then(data => {
    console.log('Success:', data.success);
    console.log('Orders:', data.orders?.length || 0);
    console.log('Data:', data);
  })
  .catch(err => console.error('Error:', err));
```

## 📁 Archivos de diagnóstico creados

1. `SOLUCION_DASHBOARD_ORDENES_NO_APARECEN.md` - Análisis detallado del problema
2. `debug-dashboard-browser.js` - Script completo para ejecutar en el navegador
3. `check-order-store-reference.js` - Verificación de datos en Sanity (ya ejecutado ✅)
4. `test-dashboard-api.js` - Test de la API (requiere autenticación)

## ⏭️ Próximos pasos

1. **Reinicia el servidor** con `npm run dev`
2. **Abre el dashboard** en `http://localhost:3000/dashboard`
3. **Revisa la consola** y busca los logs de debug
4. **Comparte los resultados** para continuar con la solución

---

**Nota**: Los logs de debug son temporales y se pueden remover una vez que identifiquemos el problema.
