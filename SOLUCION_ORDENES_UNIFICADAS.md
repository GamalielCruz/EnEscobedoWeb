# Solución: Órdenes Unificadas desde Order y ClickCollectOrder

## Problema Identificado

Las páginas de órdenes no mostraban todas las órdenes porque:

1. **Click & Collect Orders Admin** (`/click-collect-orders`): Solo consultaba el schema `clickCollectOrder`
2. **Dashboard del Restaurante** (`/dashboard`): Solo consultaba el schema `clickCollectOrder`
3. Las órdenes más comunes se encuentran en el schema `Order` con `deliveryMethod == "click_collect"`

## Solución Implementada

### 1. API de Click & Collect Orders (`app/api/click-collect-orders/route.ts`)

**Cambios realizados:**

- ✅ Actualizada la query principal `ORDERS_QUERY` para consultar ambos schemas usando `select()`
- ✅ Actualizada la query `ORDER_BY_NUMBER_QUERY` para buscar en ambos schemas
- ✅ Corregida la query de filtro por estado para incluir ambos tipos de documentos
- ✅ Normalización de campos para que ambos tipos de documentos tengan la misma estructura:
  - `customerInfo`: Unifica `customerInfo` (clickCollectOrder) y campos individuales (order)
  - `storeInfo`: Unifica `storeInfo` (clickCollectOrder) y referencia a `pickupStore` (order)
  - `items`: Unifica `items` (clickCollectOrder) y `products` (order)
  - `totalAmount`: Usa `coalesce(totalAmount, totalPrice)`
  - `createdAt`: Usa `coalesce(createdAt, orderDate)`

### 2. API de Store Orders (`app/api/dashboard/store-orders/route.ts`)

**Cambios realizados:**

- ✅ Actualizada la query `ORDERS_QUERY` con la misma normalización
- ✅ Filtrado correcto por `storeId` para ambos tipos de documentos
- ✅ Soporte para actualizar estado en ambos tipos de documentos

### 3. Componentes de UI

**ClickCollectOrdersAdmin.tsx:**
- ✅ Agregado estado `pending_pickup` a la configuración de estados
- ✅ Agregado filtro para "Pendientes de Recoger"

**Dashboard Page (`app/(store)/dashboard/page.tsx`):**
- ✅ Agregado estado `pending_pickup` a la configuración de estados
- ✅ Agregada opción "Pendiente de Recoger" en el selector de estado

### 4. Query Unificada (GROQ)

```groq
*[
  (_type == "clickCollectOrder") || (_type == "order" && deliveryMethod == "click_collect")
] | order(coalesce(createdAt, orderDate) desc) {
  _id,
  _type,
  orderNumber,
  pickupCode,
  "customerInfo": select(
    _type == "clickCollectOrder" => customerInfo,
    _type == "order" => { "name": customerName, "email": email, "clerkUserId": clerkUserId, "phone": phone }
  ),
  "storeInfo": select(
    _type == "clickCollectOrder" => storeInfo,
    _type == "order" => { "storeId": pickupStore._ref, "storeName": pickupStore->name, "storeAddress": pickupStore->address.street, "storePhone": pickupStore->contact.phone }
  ),
  "items": select(
    _type == "clickCollectOrder" => items,
    _type == "order" => products[]{ 
      _key, 
      "productName": product->name,
      "productId": product->_id,
      "quantity": quantity, 
      "price": product->price
    }
  ),
  "totalAmount": coalesce(totalAmount, totalPrice),
  paymentMethod,
  status,
  estimatedPickupDate,
  readyAt,
  pickedUpAt,
  notes,
  "createdAt": coalesce(createdAt, orderDate),
  updatedAt
}
```

## Ventajas de la Solución

1. **Unificación Completa**: Ambas páginas ahora consultan ambos schemas
2. **Estructura Consistente**: Los datos se normalizan para tener la misma estructura
3. **Retrocompatibilidad**: Soporta tanto órdenes antiguas como nuevas
4. **Filtrado Correcto**: Los filtros por estado funcionan en ambos tipos
5. **Actualización de Estado**: Se puede actualizar el estado de cualquier tipo de orden

## Estados Soportados

- `pending`: Pendiente
- `pending_pickup`: Pendiente de Recoger (nuevo)
- `processing`: Procesando
- `ready_for_pickup`: Listo para Recoger
- `completed`: Completado
- `cancelled`: Cancelado

## Pruebas Realizadas

Se creó el script `test-unified-orders-query.js` que verifica:

- ✅ Conteo de órdenes por tipo
- ✅ Query unificada obtiene todas las órdenes
- ✅ Estructura de datos correcta
- ✅ Filtrado por estado funciona correctamente

**Resultado de la prueba:**
```
📊 Contando órdenes por tipo:
   - clickCollectOrder: 0
   - order (click_collect): 1
   - Total esperado: 1

✅ Órdenes obtenidas: 1
✅ Todas las órdenes tienen la estructura correcta
```

## Próximos Pasos

1. Probar en el navegador:
   - Visitar `/click-collect-orders` y verificar que se muestren todas las órdenes
   - Visitar `/dashboard` y verificar que se muestren los pedidos del restaurante
   
2. Verificar que los filtros funcionen correctamente

3. Confirmar que la actualización de estado funciona para ambos tipos de órdenes

## Archivos Modificados

- `app/api/click-collect-orders/route.ts`
- `app/api/dashboard/store-orders/route.ts`
- `components/ClickCollectOrdersAdmin.tsx`
- `app/(store)/dashboard/page.tsx`

## Archivos Creados

- `test-unified-orders-query.js` - Script de prueba para verificar las queries
