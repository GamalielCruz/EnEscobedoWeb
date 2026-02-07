# Configurar Dueño de Tienda (ownerClerkUserId)

## Problema Resuelto

El campo `ownerClerkUserId` **YA ESTÁ en el schema** pero Sanity Studio mostraba "Unknown field". 

**Solución:** Regenerar los tipos de TypeScript.

## ✅ Tipos Regenerados

Acabo de ejecutar:
```bash
npx sanity schema extract
npx sanity typegen generate
```

**Resultado:**
```
✓ Generated TypeScript types for 22 schema types
```

## Próximos Pasos

### 1. Reiniciar Sanity Studio

El servidor de desarrollo de Sanity Studio necesita reiniciarse para reconocer los cambios.

**Si Sanity Studio está corriendo en una terminal separada:**
1. Ve a esa terminal
2. Presiona `Ctrl + C` para detenerlo
3. Ejecuta: `npm run dev` (o el comando que uses para Sanity)

**Si Sanity Studio está integrado en Next.js:**
- Ya está corriendo en `http://localhost:3000/studio`
- Simplemente recarga la página del navegador

### 2. Asignar el Dueño

1. **Ve a Sanity Studio:**
   ```
   http://localhost:3000/studio
   ```

2. **Busca "Tiendas Afiliadas" en el menú lateral**

3. **Abre "Borona Pizza"**

4. **Busca el campo "Usuario Dueño (ID de Clerk)"**
   - Ahora debería aparecer como un campo normal (no "Unknown field")
   - Debería tener una descripción: "ID del usuario en Clerk que es dueño..."

5. **Obtén tu Clerk User ID:**
   
   **Opción A - Desde el Dashboard:**
   - Ve a: `http://localhost:3000/dashboard`
   - Si no tienes tienda asignada, verás tu ID
   - Ejemplo: `user_2abc123xyz...`

   **Opción B - Desde la Consola:**
   - Abre DevTools (F12) en cualquier página
   - Escribe: `console.log(window.Clerk?.user?.id)`
   - Copia el ID

6. **Pega tu Clerk User ID en el campo**
   - Asegúrate de copiar el ID completo
   - No agregues espacios ni caracteres extra

7. **Haz clic en "Publish" o "Guardar"**

### 3. Verificar en el Dashboard

1. **Ve al dashboard:**
   ```
   http://localhost:3000/dashboard
   ```

2. **Deberías ver:**
   - "Panel de Borona Pizza" en el título
   - La pestaña "Pedidos"
   - Tu orden en la lista de pedidos

## Estructura del Campo en el Schema

El campo está definido así en `sanity/schemaTypes/affiliateStoreType.ts`:

```typescript
defineField({
  name: "ownerClerkUserId",
  title: "Usuario Dueño (ID de Clerk)",
  type: "string",
  description:
    "ID del usuario en Clerk que es dueño o administrador de esta tienda (ej: user_xxx). Vincular al acceso autenticado del usuario.",
}),
```

## Verificación

### Antes de asignar el dueño:

```bash
node check-user-store-access.js
```

Debería mostrar:
```
Borona Pizza:
- ownerClerkUserId: user_392Q7p9ahx7GuGwIit2aWNeWaak
- Para ver las órdenes, el usuario debe tener este Clerk ID
```

### Después de asignar tu ID:

1. **Verifica la API:**
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

2. **Verifica el dashboard:**
   - Deberías ver "Panel de Borona Pizza"
   - Deberías ver la orden en la pestaña "Pedidos"

## Formato del Clerk User ID

Los IDs de Clerk tienen este formato:
```
user_2abc123xyz456def789ghi
```

**Características:**
- Comienza con `user_`
- Seguido de caracteres alfanuméricos
- Longitud aproximada: 27-30 caracteres

## Si el Campo Sigue Mostrando "Unknown field"

1. **Verifica que el schema esté actualizado:**
   ```bash
   # Ver si el campo está en el schema
   grep -n "ownerClerkUserId" sanity/schemaTypes/affiliateStoreType.ts
   ```

2. **Regenera los tipos nuevamente:**
   ```bash
   npx sanity schema extract
   npx sanity typegen generate
   ```

3. **Reinicia COMPLETAMENTE el servidor:**
   ```bash
   # Detén el servidor (Ctrl+C)
   # Limpia el caché
   Remove-Item -Recurse -Force .next
   # Inicia de nuevo
   npm run dev
   ```

4. **Limpia el caché del navegador:**
   - Presiona `Ctrl + Shift + R` en Sanity Studio
   - O abre en modo incógnito

## Múltiples Restaurantes

Si tienes múltiples restaurantes:

1. **Cada restaurante debe tener su propio `ownerClerkUserId`**
2. **Un usuario puede ser dueño de múltiples restaurantes**
3. **El dashboard mostrará órdenes de TODOS los restaurantes del usuario**

**Ejemplo:**
```
Usuario: user_abc123
Restaurantes:
  - Borona Pizza (ownerClerkUserId: user_abc123)
  - Tienda de Crepas (ownerClerkUserId: user_abc123)

Dashboard mostrará órdenes de ambos restaurantes
```

## Notas Importantes

1. **El campo es obligatorio para el dashboard** - Sin él, el usuario no verá órdenes
2. **Es case-sensitive** - Copia el ID exactamente como aparece
3. **No uses el email** - Debe ser el Clerk User ID (user_xxx)
4. **Un restaurante = Un dueño** - Con la configuración actual, solo un usuario por restaurante

## Scripts de Ayuda

```bash
# Ver qué usuario tiene acceso a qué tienda
node check-user-store-access.js

# Ver todas las órdenes y sus tiendas
node debug-dashboard-orders.js

# Ver estructura de las órdenes
node debug-order-structure.js
```

## Resumen

✅ **Campo en el schema:** Sí, está definido
✅ **Tipos regenerados:** Sí, acabamos de hacerlo
✅ **Próximo paso:** Reiniciar Sanity Studio y asignar tu Clerk User ID

Una vez que asignes tu ID, el dashboard mostrará las órdenes inmediatamente.
