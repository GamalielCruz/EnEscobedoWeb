# 🚀 Solución Rápida: Dashboard No Muestra Órdenes

## El Problema

✅ Las órdenes aparecen en `/click-collect-orders` (panel admin)
❌ Las órdenes NO aparecen en `/dashboard` (panel del restaurante)

## La Causa

Tu usuario NO es el dueño de la tienda en Sanity.

**Estado actual:**
- Tienda "Borona Pizza" tiene dueño: `user_392Q7p9ahx7GuGwIit2aWNeWaak`
- Tu usuario probablemente tiene un ID diferente

## Solución en 3 Pasos

### Paso 1: Obtener Tu Clerk User ID

**Opción A - Más Fácil (Desde el Dashboard):**

1. Ve a: http://localhost:3000/dashboard
2. Si ves un mensaje que dice "Sin restaurante asignado", verás tu Clerk User ID en pantalla
3. Cópialo completo (ejemplo: `user_2abc123xyz...`)

**Opción B - Desde la Consola del Navegador:**

1. Ve a: http://localhost:3000/dashboard
2. Presiona `F12` para abrir DevTools
3. Ve a la pestaña "Console"
4. Escribe: `console.log(window.Clerk?.user?.id)`
5. Presiona Enter
6. Copia el ID que aparece

**Opción C - Archivo HTML:**

1. Abre en tu navegador: `file:///C:/Dev/EnEscobedo/get-my-clerk-id.html`
2. Sigue las instrucciones en pantalla

### Paso 2: Asignar Tu ID en Sanity

1. **Ve a Sanity Studio:**
   ```
   http://localhost:3000/studio
   ```

2. **Navega a tu tienda:**
   - En el menú lateral, busca "Tiendas Afiliadas" o "Affiliate Stores"
   - Haz clic en "Borona Pizza" (o el nombre de tu restaurante)

3. **Busca el campo "Usuario Dueño (ID de Clerk)":**
   - Debería estar cerca del inicio del formulario
   - Si dice "Unknown field", recarga la página (Ctrl+Shift+R)

4. **Pega tu Clerk User ID:**
   - Borra el valor actual si hay uno
   - Pega tu ID completo
   - Asegúrate de que no haya espacios extra

5. **Guarda:**
   - Haz clic en "Publish" (botón verde)
   - Espera a que se guarde

### Paso 3: Verificar

1. **Recarga el dashboard:**
   ```
   http://localhost:3000/dashboard
   ```

2. **Deberías ver:**
   - "Panel de Borona Pizza" en el título
   - La pestaña "Pedidos"
   - Tus órdenes en la lista

## Verificación Rápida

### Antes de cambiar el ID:

```bash
node check-user-store-access.js
```

Muestra:
```
Borona Pizza:
- ownerClerkUserId: user_392Q7p9ahx7GuGwIit2aWNeWaak
```

### Después de cambiar el ID:

1. **Verifica la API:**
   
   Abre en el navegador:
   ```
   http://localhost:3000/api/my-stores
   ```
   
   Debería devolver:
   ```json
   {
     "stores": [
       {
         "_id": "491d7dff-8884-402e-8e2b-1bcb8630e8ec",
         "name": "Borona Pizza",
         "storeId": "Borona"
       }
     ]
   }
   ```

2. **Si devuelve `stores: []`:**
   - El ID no coincide
   - Verifica que copiaste el ID completo
   - Verifica que no haya espacios extra

## Formato Correcto del Clerk User ID

✅ **Correcto:**
```
user_2abc123xyz456def789ghi
```

❌ **Incorrecto:**
```
user_2abc123xyz456def789ghi    (espacios al final)
 user_2abc123xyz456def789ghi   (espacio al inicio)
user_2abc123xyz456def789ghi\n  (salto de línea)
ignacio.ch@e.cobaq.edu.mx      (email, no es el ID)
```

## Si Sigue Sin Funcionar

### 1. Verifica que estés autenticado con el usuario correcto

1. Ve a: http://localhost:3000
2. Verifica qué usuario está autenticado (esquina superior derecha)
3. Si es el usuario incorrecto, cierra sesión e inicia con el correcto

### 2. Verifica que el ID se guardó correctamente

1. Ve a: http://localhost:3000/studio
2. Abre "Borona Pizza"
3. Verifica que el campo "Usuario Dueño (ID de Clerk)" tenga tu ID
4. Si está vacío o tiene otro valor, vuelve a pegarlo

### 3. Limpia el caché

```bash
# Detén el servidor (Ctrl+C)
Remove-Item -Recurse -Force .next
npm run dev
```

### 4. Verifica en la consola del navegador

1. Ve a: http://localhost:3000/dashboard
2. Presiona F12
3. Ve a la pestaña "Console"
4. Busca errores en rojo
5. Busca mensajes que digan "No autorizado" o "No tienes permiso"

## Múltiples Restaurantes

Si tienes varios restaurantes:

1. **Cada restaurante necesita tu Clerk User ID**
2. **Repite el Paso 2 para cada restaurante**
3. **El dashboard mostrará órdenes de TODOS tus restaurantes**

## Diferencia Entre las Páginas

| Página | Qué Muestra | Requiere Ser Dueño |
|--------|-------------|-------------------|
| `/click-collect-orders` | **Todas** las órdenes de **todos** los restaurantes | ❌ No |
| `/dashboard` | Solo órdenes de **tus** restaurantes | ✅ Sí |

## Resumen

**El problema es simple:**
- Tu usuario no es el dueño de la tienda en Sanity
- El dashboard solo muestra órdenes de TUS tiendas

**La solución es simple:**
1. Obtén tu Clerk User ID
2. Asígnalo en Sanity Studio
3. Recarga el dashboard

**Tiempo estimado:** 2-3 minutos

---

**¿Necesitas ayuda?**

Ejecuta estos scripts para diagnosticar:

```bash
# Ver qué usuario tiene acceso a qué tienda
node check-user-store-access.js

# Ver todas las órdenes y sus tiendas
node debug-dashboard-orders.js
```
