# Solución: Dashboard No Muestra Órdenes

## Problema

Las órdenes aparecen en `/click-collect-orders` pero NO en `/dashboard`

## Causa

El dashboard solo muestra órdenes de tiendas que **pertenecen al usuario autenticado**.

La tienda "Borona Pizza" tiene:
- `ownerClerkUserId: user_392Q7p9ahx7GuGwIit2aWNeWaak`

Si tu usuario tiene un ID diferente, no verás las órdenes en el dashboard.

## Cómo Funciona el Dashboard

1. El dashboard obtiene tu Clerk User ID
2. Busca tiendas donde `ownerClerkUserId == tu_user_id`
3. Muestra solo las órdenes de TUS tiendas

## Solución

Necesitas asignar tu Clerk User ID como dueño de la tienda "Borona Pizza".

### Paso 1: Obtener tu Clerk User ID

**Opción A - Desde el Dashboard:**

1. Ve a: `http://localhost:3000/dashboard`
2. Si no tienes tienda asignada, verás un mensaje con tu Clerk User ID
3. Cópialo completo (ejemplo: `user_2abc123xyz...`)

**Opción B - Desde la Consola del Navegador:**

1. Ve a: `http://localhost:3000/dashboard`
2. Abre la consola (F12)
3. Escribe: `console.log(window.Clerk?.user?.id)`
4. Copia el ID que aparece

**Opción C - Desde Clerk Dashboard:**

1. Ve a: https://dashboard.clerk.com
2. Selecciona tu aplicación
3. Ve a "Users"
4. Busca tu usuario
5. Copia el "User ID"

### Paso 2: Asignar el Dueño en Sanity

1. Ve a: `http://localhost:3000/studio`
2. En el menú lateral, busca "Tiendas Afiliadas"
3. Abre "Borona Pizza"
4. Busca el campo "Usuario Dueño (ID de Clerk)" o "ownerClerkUserId"
5. Pega tu Clerk User ID (el que copiaste en el Paso 1)
6. Haz clic en "Publish" o "Guardar"

### Paso 3: Verificar

1. Recarga el dashboard: `http://localhost:3000/dashboard`
2. Deberías ver:
   - "Panel de Borona Pizza" en el título
   - La pestaña "Pedidos"
   - Tu orden en la lista

## Verificación Rápida

Ejecuta este script para ver el estado actual:

```bash
node check-user-store-access.js
```

Te mostrará:
- Qué tiendas tienen órdenes
- Qué `ownerClerkUserId` tiene cada tienda
- Si hay problemas de asignación

## Ejemplo de Clerk User ID

Los Clerk User IDs tienen este formato:
```
user_2abc123xyz456def789ghi
```

**IMPORTANTE:** 
- Copia el ID completo
- No agregues espacios
- No modifiques el ID

## Si Sigues Sin Ver Órdenes

### 1. Verifica que el ID sea correcto

En Sanity Studio, el campo debe tener exactamente tu Clerk User ID.

### 2. Verifica en la consola del navegador

1. Abre el dashboard: `http://localhost:3000/dashboard`
2. Abre DevTools (F12)
3. Ve a la pestaña "Console"
4. Busca mensajes de error

### 3. Verifica la API

Con el servidor corriendo, abre en el navegador:
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

Si devuelve `stores: []`, el `ownerClerkUserId` no coincide.

### 4. Verifica las órdenes de la tienda

Ejecuta:
```bash
node debug-dashboard-orders.js
```

Esto te mostrará:
- Todas las tiendas
- Todas las órdenes
- Qué tienda tiene qué órdenes
- Si la query del dashboard encuentra órdenes

## Resumen

**El problema NO es técnico**, es de configuración:

1. ✅ Las queries funcionan correctamente
2. ✅ La API encuentra las órdenes
3. ✅ El componente renderiza correctamente
4. ❌ El usuario autenticado no es dueño de la tienda

**Solución:**
Asigna tu Clerk User ID como `ownerClerkUserId` de la tienda "Borona Pizza" en Sanity Studio.

## Múltiples Usuarios

Si necesitas que varios usuarios vean las órdenes:

**Opción 1 - Múltiples Tiendas:**
- Crea una tienda por usuario
- Cada usuario ve solo sus órdenes

**Opción 2 - Roles (Requiere Desarrollo):**
- Implementar sistema de roles
- Permitir múltiples usuarios por tienda
- Requiere cambios en el código

**Opción 3 - Página Admin:**
- Usa `/click-collect-orders` para ver todas las órdenes
- Esta página NO requiere ser dueño
- Muestra todas las órdenes de todas las tiendas

## Scripts Disponibles

```bash
# Ver qué usuario tiene acceso a qué tienda
node check-user-store-access.js

# Ver todas las órdenes y sus tiendas
node debug-dashboard-orders.js

# Ver estructura de las órdenes
node debug-order-structure.js
```

## Notas Importantes

1. **El dashboard es personal**: Solo muestra TUS tiendas
2. **Click & Collect Orders es global**: Muestra TODAS las órdenes
3. **Un usuario puede tener múltiples tiendas**
4. **Una tienda solo puede tener un dueño** (con la configuración actual)

---

**Estado Actual:**
- ✅ Tienda "Borona Pizza" existe
- ✅ Tiene 1 orden
- ✅ Tiene dueño asignado: `user_392Q7p9ahx7GuGwIit2aWNeWaak`
- ❓ ¿Tu usuario tiene este ID?

**Próximo paso:** Verifica tu Clerk User ID y actualiza la tienda en Sanity Studio.
