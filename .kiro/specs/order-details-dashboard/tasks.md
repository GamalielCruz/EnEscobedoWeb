# Plan de Implementación: Detalles de Órdenes en el Dashboard

## Visión General

Integrar los componentes existentes `OrderItemDetails` y `OrderContactInfo` en el dashboard, limpiar el código de debug, agregar el método de pago y mejorar la comanda del historial. No se requieren cambios en la API ni en Sanity.

## Tareas

- [ ] 1. Actualizar el tipo `Order` para incluir `paymentMethod`
  - En `hooks/useOrderNotifications.ts`, agregar `paymentMethod?: string` al tipo `Order`
  - Esto permite que TypeScript reconozca el campo que ya llega en la respuesta de la API
  - _Requisitos: 4.2_

- [ ] 2. Integrar `OrderItemDetails` y `OrderContactInfo` en la comanda activa del dashboard
  - En `app/(store)/dashboard/page.tsx`, agregar los imports de `OrderItemDetails` y `OrderContactInfo`
  - Reemplazar el bloque inline de renderizado de ítems (con los IIFE de debug) por `<OrderItemDetails key={...} item={item} />`
  - Agregar `<OrderContactInfo customerName={...} email={...} phone={...} />` dentro de la comanda activa, antes del bloque de ítems
  - Eliminar los bloques de debug `{(() => { console.log(...); return null; })()}` del renderizado de órdenes
  - Eliminar el bloque de debug con fondo rojo que muestra "⚠️ DEBUG: No hay items en este pedido"
  - _Requisitos: 1.1, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 6.3_

- [ ] 3. Agregar método de pago y helper de etiquetas en la comanda activa
  - Agregar la función helper `paymentMethodLabel` en el componente del dashboard (antes del `return`)
  - Mostrar el método de pago debajo del total en la sección de resumen financiero de la comanda activa
  - _Requisitos: 4.2_

- [ ] 4. Mejorar la comanda del historial de pedidos
  - En la sección "Historial de Pedidos", expandir la fila para mostrar: número de orden, estado (badge), nombre del cliente, número de ítems, total formateado como MXN, y fecha
  - Mantener el diseño compacto actual pero con más información visible
  - _Requisitos: 1.2, 4.1_

- [ ] 5. Checkpoint — Verificar que todo funciona correctamente
  - Asegurarse de que no hay errores de TypeScript en los archivos modificados
  - Verificar en el navegador que las personalizaciones aparecen en las comandas activas (si la orden tiene `customizations` con datos)
  - Verificar que el selector de estado sigue funcionando correctamente
  - Verificar que no hay errores de consola relacionados con el renderizado de órdenes
  - Preguntar al usuario si hay dudas o ajustes necesarios

## Notas

- Las tareas no tienen sub-tareas de pruebas marcadas como opcionales porque los cambios son principalmente de integración de componentes existentes, no lógica nueva
- Si al verificar en el navegador las personalizaciones siguen sin aparecer, el problema es de datos (la orden no tiene `customizations` guardadas en Sanity), no de código — en ese caso se debe crear una orden de prueba con un producto que tenga `optionGroups` configurados
- El componente `OrderItemDetails` ya tiene sus propios `console.log` de debug — se pueden dejar por ahora ya que están en el componente, no en el dashboard
- El bloque de debug panel (Debug Info: User ID, Selected Store, etc.) en la parte superior del dashboard NO debe modificarse — está fuera del alcance de este spec
