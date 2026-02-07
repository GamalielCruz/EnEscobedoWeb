# Migración del Schema de Productos - Flujo de Aprobación

## Resumen de Cambios

Se han agregado los siguientes campos al schema de productos en Sanity para soportar el flujo de aprobación:

### Campos Nuevos en `productType.ts`:

1. **approvalStatus** (string): Estado del producto
   - Valores: "pending", "approved", "rejected"
   - Por defecto: "approved"

2. **isVisible** (boolean): Si el producto aparece en la tienda
   - Por defecto: true
   - Los productos pendientes tendrán `false`

3. **pendingChanges** (object): Cambios propuestos para revisión
   - Contiene: name, price, stock, description, image, categories, optionGroups
   - Se crea cuando el dueño edita un producto

4. **submittedBy** (string): ID Clerk del usuario que envió cambios
5. **submittedAt** (datetime): Cuándo se enviaron los cambios

6. **approvedBy** (string): ID Clerk del admin que aprobó
7. **approvedAt** (datetime): Cuándo se aprobaron

8. **rejectedBy** (string): ID Clerk del admin que rechazó
9. **rejectedAt** (datetime): Cuándo se rechazaron
10. **rejectionReason** (string): Motivo del rechazo

---

## Pasos para Implementar

### 1️⃣ Verificar Cambios en el Schema

El archivo `sanity/schemaTypes/productType.ts` ya está actualizado con los nuevos campos.

### 2️⃣ Sincronizar el Schema en Sanity Studio

Reinicia Sanity Studio para que cargue el nuevo schema:

```bash
npm run dev
```

Luego accede a http://localhost:3000/studio y verás que Sanity detecta cambios en el schema.

### 3️⃣ Migrar Productos Existentes

Los productos que ya existen en la base de datos no tienen estos campos. Necesitamos agregarlos:

**Opción A: Migración Automática (Recomendado)**

```bash
# En Windows (PowerShell)
npm run migrate:products

# O manualmente:
npx sanity exec scripts/migrate-products.js --with-user-token
```

**Opción B: Manual en Sanity Studio**

1. Ve a http://localhost:3000/studio
2. Haz clic en un producto
3. Desplázate hasta los nuevos campos (Aprobación)
4. Rellena:
   - Estado de aprobación: "Aprobado"
   - Visible en tienda: ✓ (marcado)
5. Guarda

### 4️⃣ Verificar que Funciona

**Como Dueño:**
1. Ve a `/dashboard` → Productos
2. Crea un nuevo producto o edita uno existente
3. Deberías ver:
   - Mensaje: "Producto enviado para revisión"
   - Badge "Pendiente de revisión" en la lista
   - Botón Editar deshabilitado

**Como Admin:**
1. Ve a `/pending-products`
2. Deberías ver el producto pendiente
3. Haz clic en "Aprobar"
4. Vuelve al dashboard del dueño
5. El producto debería estar actualizado y visible

---

## Cambios en los Endpoints

### POST `/api/dashboard/store-products` (Crear producto)

```json
// Crea un producto con:
{
  "approvalStatus": "pending",
  "isVisible": false,
  "submittedBy": "user_123",
  "submittedAt": "2024-02-06T..."
}
```

### PATCH `/api/dashboard/store-products` (Editar producto)

```json
// Guarda los cambios bajo:
{
  "pendingChanges": { /* todos los cambios */ },
  "approvalStatus": "pending",
  "submittedBy": "user_123",
  "submittedAt": "2024-02-06T..."
}
```

### POST `/api/dashboard/pending-products/[id]/approve`

```json
// Aplica pendingChanges y marca:
{
  "approvalStatus": "approved",
  "isVisible": true,
  "approvedBy": "user_admin",
  "approvedAt": "2024-02-06T...",
  "pendingChanges": null
}
```

### POST `/api/dashboard/pending-products/[id]/reject`

```json
// Rechaza y marca:
{
  "approvalStatus": "rejected",
  "rejectedBy": "user_admin",
  "rejectedAt": "2024-02-06T...",
  "rejectionReason": "Imagen de baja calidad"
}
```

---

## Troubleshooting

### ¿Los cambios no aparecen?

1. Reinicia el servidor: `npm run dev`
2. Limpia el cache: `npm run clear-cache` (si existe)
3. Verifica que el schema está en `sanity/schemaTypes/productType.ts`

### ¿La migración falla?

```bash
# Asegúrate de que tienes token de Sanity
# Ejecuta con:
npx sanity exec scripts/migrate-products.js --with-user-token

# Si aún falla, migra manualmente en Sanity Studio
```

### ¿Los productos no se actualizan en el panel?

El dashboard recarga automáticamente cada 10 segundos. Si no ves cambios:

1. Haz clic en "Actualizar" en el panel de productos
2. Recarga la página completa (F5)
3. Verifica que estés logueado correctamente

---

## Diagrama del Flujo

```
┌─────────────────────┐
│  Dueño del Store    │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │ Crear/Editar │
    │   Producto   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────────┐
    │ approvalStatus: "pending" │
    │ isVisible: false          │
    │ pendingChanges: {...}     │
    │ submittedBy: userId       │
    └──────┬───────────────────┘
           │
           ▼
┌──────────────────────────┐
│   Admin Panel            │
│ /pending-products        │
│ (muestra cambios)        │
└──────┬────────┬──────────┘
       │        │
    ┌──▼──┐  ┌──▼──┐
    │Apro-│  │Recha│
    │bar  │  │zar  │
    └──┬──┘  └──┬──┘
       │        │
       ▼        ▼
   APPROVED  REJECTED
   isVisible: true
   approvalStatus: "approved"
```

---

## Resumen para el Equipo

✅ Schema actualizado con campos de aprobación
✅ Endpoints POST/PATCH crean productos pendientes
✅ Endpoint GET devuelve approvalStatus
✅ Admin panel visible en `/pending-products`
✅ Dashboard se recarga cada 10 segundos
✅ Botón "Actualizar" manual disponible

**Siguiente paso:** Ejecutar migración con `npm run migrate:products`
