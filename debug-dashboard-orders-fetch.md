[OPEN]

# Debug Session: dashboard-orders-fetch

## Sintoma
- En `localhost` aparece un error interceptado por `HydrationErrorSuppressor`, pero el origen real apunta a `useOrderNotifications.useCallback[fetchOrders]`.
- El stack sugiere que el problema ocurre al consultar `/api/dashboard/store-orders` desde el dashboard del dueno.

## Contexto
- Ruta afectada: `/dashboard`
- Hook afectado: `hooks/useOrderNotifications.ts`
- Flujo probable: carga inicial o polling de pedidos del dashboard

## Hipotesis Falsables
1. La API `/api/dashboard/store-orders` esta devolviendo `401` porque la sesion Clerk del usuario no esta disponible en esa llamada.
2. La API `/api/dashboard/store-orders` esta devolviendo `403` porque `selectedStoreId` no corresponde a una tienda realmente asociada al usuario autenticado.
3. El dashboard nuevo dispara el hook antes de que `selectedStoreId` o `ownedStores` queden estabilizados, generando una consulta con parametros inconsistentes.
4. La API `/api/dashboard/store-orders` esta devolviendo `500` por datos de pedido o tienda incompletos en Sanity para la tienda seleccionada.
5. El error visible no es de hidratacion; solo se propaga porque `useOrderNotifications` hace `console.error` cuando recibe una respuesta no OK.

## Evidencia Pendiente
- Estado HTTP real de `/api/dashboard/store-orders`
- Payload de error devuelto por esa API
- Valor de `selectedStoreId` y `enabled` al momento de disparar `fetchOrders`
- Confirmacion de si el usuario autenticado posee la tienda consultada

## Restricciones
- Antes de obtener evidencia runtime, no modificar logica de negocio.
- El primer cambio de codigo debe ser solo instrumentacion.
