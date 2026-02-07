# Solución: Caché de Órdenes Eliminadas

## Problema

Después de eliminar las órdenes en Sanity, la página `/click-collect-orders` seguía mostrando las órdenes eliminadas debido al caché.

## Causa

1. **Caché del servidor Next.js**: El directorio `.next` almacena datos en caché
2. **Caché del navegador**: El navegador guarda respuestas HTTP
3. **Caché de Sanity CDN**: Aunque `useCdn: false` en desarrollo, puede haber caché residual

## Solución Implementada

### 1. Headers No-Cache en las APIs

Se agregaron headers para forzar que las respuestas no se almacenen en caché:

**Archivos modificados:**
- `app/api/click-collect-orders/route.ts`
- `app/api/dashboard/store-orders/route.ts`

```typescript
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
  }
});
```

### 2. Script de Limpieza de Caché

Se creó `clear-all-cache.js` que elimina:
- Directorio `.next` (caché de Next.js)
- `node_modules/.cache` (si existe)

### 3. Scripts de Verificación

**check-deleted-orders.js**: Verifica que no haya órdenes en Sanity
**test-api-no-cache.js**: Prueba la API con headers no-cache

## Pasos para Resolver el Problema

### 1. Verificar que las órdenes estén eliminadas en Sanity

```bash
node check-deleted-orders.js
```

**Resultado esperado:**
```
✅ No hay órdenes click & collect en Sanity
```

### 2. Limpiar el caché del servidor

```bash
node clear-all-cache.js
```

Esto eliminará el directorio `.next` con todo el caché de Next.js.

### 3. Reiniciar el servidor

```bash
npm run dev
```

### 4. Limpiar el caché del navegador

**Opción A - Recarga forzada:**
- Windows/Linux: `Ctrl + Shift + R`
- Mac: `Cmd + Shift + R`

**Opción B - DevTools:**
1. Abre DevTools (F12)
2. Ve a la pestaña "Network"
3. Marca "Disable cache"
4. Recarga la página

**Opción C - Modo incógnito:**
1. Abre una ventana de incógnito
2. Visita `http://localhost:3000/click-collect-orders`

### 5. Verificar la API directamente

```bash
node test-api-no-cache.js
```

**Resultado esperado:**
```
✅ La API NO devuelve órdenes (correcto)
```

### 6. Verificar en el navegador

Visita: `http://localhost:3000/click-collect-orders`

**Resultado esperado:**
- Mensaje: "No hay órdenes para mostrar"
- Sin órdenes en la lista

## Prevención Futura

### Para evitar problemas de caché:

1. **Siempre usa headers no-cache en APIs de datos en tiempo real**
   ```typescript
   headers: {
     'Cache-Control': 'no-store, no-cache, must-revalidate',
   }
   ```

2. **Limpia el caché después de cambios importantes**
   ```bash
   node clear-all-cache.js
   npm run dev
   ```

3. **Usa DevTools con "Disable cache" durante desarrollo**

4. **Agrega timestamps a las peticiones para forzar actualización**
   ```javascript
   fetch(`/api/orders?t=${Date.now()}`)
   ```

## Verificación Final

### Checklist:

- [ ] `node check-deleted-orders.js` muestra 0 órdenes
- [ ] `node clear-all-cache.js` ejecutado exitosamente
- [ ] Servidor reiniciado con `npm run dev`
- [ ] Caché del navegador limpiado (Ctrl+Shift+R)
- [ ] `node test-api-no-cache.js` muestra 0 órdenes
- [ ] Página `/click-collect-orders` muestra "No hay órdenes"
- [ ] Dashboard `/dashboard` no muestra pedidos

## Comandos Rápidos

```bash
# Verificar órdenes en Sanity
node check-deleted-orders.js

# Limpiar caché del servidor
node clear-all-cache.js

# Reiniciar servidor
npm run dev

# Probar API sin caché (en otra terminal)
node test-api-no-cache.js
```

## Notas Importantes

1. **El caché es útil en producción** pero puede causar problemas en desarrollo
2. **Los headers no-cache** aseguran que siempre se obtengan datos frescos
3. **Limpia el caché regularmente** durante desarrollo activo
4. **Usa modo incógnito** para probar sin caché del navegador

## Archivos Creados/Modificados

### Modificados:
- `app/api/click-collect-orders/route.ts` - Agregados headers no-cache
- `app/api/dashboard/store-orders/route.ts` - Agregados headers no-cache

### Creados:
- `check-deleted-orders.js` - Verifica órdenes en Sanity
- `test-api-no-cache.js` - Prueba API sin caché
- `clear-all-cache.js` - Limpia caché del servidor
- `SOLUCION_CACHE_ORDENES.md` - Esta documentación
