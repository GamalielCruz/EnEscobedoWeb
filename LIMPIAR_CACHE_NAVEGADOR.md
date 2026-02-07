# Cómo Limpiar el Caché del Navegador Completamente

## El Problema

Las órdenes eliminadas siguen apareciendo porque el navegador tiene datos en caché. Necesitas limpiar TODOS los datos del sitio.

## Solución Rápida: Modo Incógnito

La forma más rápida de verificar sin caché:

1. Abre una ventana de incógnito:
   - Chrome/Edge: `Ctrl + Shift + N` (Windows) o `Cmd + Shift + N` (Mac)
   - Firefox: `Ctrl + Shift + P` (Windows) o `Cmd + Shift + P` (Mac)

2. Visita: `http://localhost:3000/click-collect-orders`

3. Si NO aparecen órdenes → El problema es el caché del navegador normal
4. Si SÍ aparecen órdenes → El problema es el servidor (continúa abajo)

## Solución Completa: Limpiar Todo el Caché

### Opción 1: DevTools (Recomendado)

1. **Abre DevTools:**
   - Presiona `F12` o `Ctrl + Shift + I` (Windows)
   - O `Cmd + Option + I` (Mac)

2. **Ve a la pestaña "Application" (Chrome/Edge) o "Storage" (Firefox)**

3. **Limpia todo:**
   - En el panel izquierdo, busca "Storage" o "Clear storage"
   - Haz clic en "Clear site data" o "Clear all"
   - Confirma

4. **Recarga la página:**
   - Presiona `Ctrl + Shift + R` (Windows) o `Cmd + Shift + R` (Mac)

### Opción 2: Configuración del Navegador

#### Chrome/Edge:

1. Presiona `Ctrl + Shift + Delete`
2. Selecciona:
   - ✅ Cookies y otros datos de sitios
   - ✅ Imágenes y archivos en caché
3. Rango de tiempo: "Desde siempre" o "Última hora"
4. Haz clic en "Borrar datos"

#### Firefox:

1. Presiona `Ctrl + Shift + Delete`
2. Selecciona:
   - ✅ Cookies
   - ✅ Caché
3. Rango de tiempo: "Todo"
4. Haz clic en "Limpiar ahora"

### Opción 3: Deshabilitar Caché Durante Desarrollo

1. Abre DevTools (`F12`)
2. Ve a la pestaña "Network"
3. Marca la casilla "Disable cache"
4. Mantén DevTools abierto mientras desarrollas

## Verificación Paso a Paso

### 1. Verifica que no hay órdenes en Sanity

```bash
node check-deleted-orders.js
```

**Debe mostrar:**
```
✅ No hay órdenes click & collect en Sanity
```

### 2. Limpia el caché del servidor

```bash
# Detener el servidor (Ctrl+C)
# Luego ejecutar:
Remove-Item -Recurse -Force .next
npm run dev
```

### 3. Limpia el caché del navegador

Usa una de las opciones de arriba.

### 4. Verifica la API directamente

Abre en el navegador (con DevTools abierto):
```
http://localhost:3000/api/click-collect-orders?t=123456
```

**Debe devolver:**
```json
{
  "success": true,
  "data": {
    "orders": [],
    "count": 0
  }
}
```

### 5. Verifica la página

Visita: `http://localhost:3000/click-collect-orders`

**Debe mostrar:**
- "No hay órdenes para mostrar"

## Si Todavía Aparecen Órdenes

### Paso 1: Verifica la consola del navegador

1. Abre DevTools (`F12`)
2. Ve a la pestaña "Console"
3. Busca errores en rojo
4. Copia y pega los errores

### Paso 2: Verifica la pestaña Network

1. En DevTools, ve a "Network"
2. Recarga la página (`Ctrl + R`)
3. Busca la petición a `/api/click-collect-orders`
4. Haz clic en ella
5. Ve a la pestaña "Response"
6. Verifica qué datos está devolviendo

### Paso 3: Verifica el localStorage

1. En DevTools, ve a "Application" > "Local Storage"
2. Selecciona `http://localhost:3000`
3. Busca cualquier dato relacionado con órdenes
4. Elimínalo manualmente

### Paso 4: Hard Reset del Navegador

**Chrome/Edge:**
```
chrome://settings/clearBrowserData
```

**Firefox:**
```
about:preferences#privacy
```

Limpia TODO desde "Desde siempre".

## Comandos Útiles

```bash
# Verificar Sanity
node check-deleted-orders.js

# Limpiar caché del servidor
Remove-Item -Recurse -Force .next

# Reiniciar servidor
npm run dev

# Probar API sin caché
node test-api-no-cache.js
```

## Checklist Final

- [ ] Ejecuté `node check-deleted-orders.js` → 0 órdenes
- [ ] Eliminé el directorio `.next`
- [ ] Reinicié el servidor con `npm run dev`
- [ ] Abrí modo incógnito
- [ ] Visité `/click-collect-orders`
- [ ] NO aparecen órdenes en modo incógnito
- [ ] Limpié el caché del navegador normal
- [ ] Deshabilité caché en DevTools
- [ ] Recargué con `Ctrl + Shift + R`
- [ ] Verifiqué la pestaña Network en DevTools
- [ ] La API devuelve `orders: []`

## Notas Importantes

1. **Modo incógnito es tu amigo**: Siempre prueba primero ahí
2. **DevTools abierto**: Mantén DevTools abierto con "Disable cache" marcado
3. **Hard reload**: Usa `Ctrl + Shift + R` en lugar de `F5`
4. **Verifica la API**: Asegúrate de que la API devuelva datos correctos
5. **localStorage**: A veces los datos se guardan ahí también

## Si Nada Funciona

1. Cierra TODOS los navegadores
2. Ejecuta:
   ```bash
   Remove-Item -Recurse -Force .next
   npm run dev
   ```
3. Abre un navegador diferente (si usabas Chrome, prueba Firefox)
4. Ve directamente a: `http://localhost:3000/api/click-collect-orders`
5. Verifica que devuelva `orders: []`
6. Luego visita la página

## Contacto

Si después de seguir todos estos pasos sigues viendo órdenes:

1. Toma una captura de pantalla de:
   - La página mostrando las órdenes
   - DevTools > Network > Respuesta de la API
   - DevTools > Console (si hay errores)
   - Terminal del servidor

2. Verifica que realmente eliminaste las órdenes en Sanity Studio
