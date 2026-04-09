# Documento de Requisitos

## Introducción

Esta funcionalidad mejora la visualización de órdenes en el dashboard del restaurante en `/dashboard`. Actualmente, el dashboard muestra las órdenes en tarjetas (comandas) con información básica, pero las **opciones de personalización** de los productos (`customizations`) no se muestran de forma clara y completa. El objetivo es que cada comanda muestre todos los detalles del pedido directamente en la tarjeta, incluyendo personalizaciones, notas por ítem, información de contacto del cliente y resumen financiero, sin necesidad de navegar a otra pantalla.

El proyecto usa Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Sanity como CMS, y Clerk para autenticación. Los tipos `Order` y `OrderItem` ya están definidos en `hooks/useOrderNotifications.ts`. Los componentes `OrderItemDetails` y `OrderContactInfo` ya existen en `components/` pero no están integrados en el dashboard principal.

## Glosario

- **Dashboard**: Página en `/dashboard` donde el dueño del restaurante gestiona pedidos y productos.
- **Comanda**: Tarjeta visual en el dashboard que representa una orden y muestra todos sus detalles.
- **Orden**: Documento de tipo `clickCollectOrder` u `order` en Sanity que representa un pedido de un cliente.
- **OrderItem**: Ítem dentro de una orden, con nombre de producto, cantidad, precio, personalizaciones y notas.
- **Customization (Personalización)**: Grupo de opciones seleccionadas por el cliente al pedir un producto (ej. "Tamaño: Grande", "Salsa: Picante"). Estructura: `{ title: string, options: { label: string, priceDelta: number }[] }`.
- **Pedidos Activos**: Órdenes cuyo estado no es `completed`, `cancelled`, `delivered`, `picked_up` ni `failed`.
- **Historial de Pedidos**: Órdenes con estado `completed`, `cancelled`, `delivered`, `picked_up` o `failed`.
- **OrderItemDetails**: Componente existente en `components/OrderItemDetails.tsx` que renderiza un ítem con sus personalizaciones.
- **OrderContactInfo**: Componente existente en `components/OrderContactInfo.tsx` que renderiza la información de contacto del cliente.

## Requisitos

### Requisito 1: Visualización completa de ítems en la comanda

**Historia de usuario:** Como dueño de restaurante, quiero ver todos los productos de una orden directamente en la comanda, para preparar el pedido sin necesidad de abrir pantallas adicionales.

#### Criterios de Aceptación

1. WHEN el Dashboard muestra una orden activa, THE Comanda SHALL mostrar la lista completa de ítems del pedido con nombre del producto, cantidad y precio unitario.
2. WHEN el Dashboard muestra una orden en el historial, THE Comanda SHALL mostrar un resumen con el número de productos y el total de la orden.
3. THE Comanda SHALL usar el componente `OrderItemDetails` existente para renderizar cada ítem de la lista de pedidos activos.

### Requisito 2: Visualización de opciones de personalización en la comanda

**Historia de usuario:** Como dueño de restaurante, quiero ver claramente las opciones de personalización de cada producto directamente en la comanda, para preparar exactamente lo que el cliente pidió sin ambigüedades.

#### Criterios de Aceptación

1. WHEN un OrderItem tiene personalizaciones (`customizations`), THE Comanda SHALL mostrar cada grupo de personalización con su título y las opciones seleccionadas, directamente debajo del nombre del producto.
2. WHEN una opción de personalización tiene un costo adicional (`priceDelta`) mayor a cero, THE Comanda SHALL mostrar el costo adicional formateado como moneda MXN junto al nombre de la opción.
3. WHEN un OrderItem tiene notas específicas del ítem (`notes`), THE Comanda SHALL mostrar dichas notas diferenciadas visualmente de las personalizaciones (fondo amarillo/ámbar).
4. WHEN un OrderItem no tiene personalizaciones ni notas, THE Comanda SHALL mostrar únicamente el nombre del producto, cantidad y precio sin secciones adicionales vacías.
5. THE Comanda SHALL mostrar las personalizaciones de todos los ítems de la orden, no solo del primero.

### Requisito 3: Información de contacto del cliente en la comanda

**Historia de usuario:** Como dueño de restaurante, quiero ver la información de contacto del cliente directamente en la comanda, para poder comunicarme con él si hay algún problema con el pedido.

#### Criterios de Aceptación

1. WHEN el Dashboard muestra una orden activa, THE Comanda SHALL mostrar el nombre, teléfono y correo electrónico del cliente.
2. WHEN la orden tiene número de teléfono del cliente, THE Comanda SHALL mostrar el teléfono de forma destacada para facilitar el contacto rápido.
3. IF la orden no tiene número de teléfono registrado, THEN THE Comanda SHALL mostrar un aviso visual indicando que no hay teléfono disponible.
4. THE Comanda SHALL usar el componente `OrderContactInfo` existente para renderizar la información de contacto.

### Requisito 4: Información de resumen financiero en la comanda

**Historia de usuario:** Como dueño de restaurante, quiero ver el total de la orden y el método de pago en la comanda, para confirmar el cobro correcto al cliente.

#### Criterios de Aceptación

1. WHEN el Dashboard muestra una orden, THE Comanda SHALL mostrar el monto total de la orden formateado como moneda MXN.
2. WHEN el Dashboard muestra una orden, THE Comanda SHALL mostrar el método de pago de la orden (efectivo al recoger, tarjeta, etc.) si está disponible.
3. WHEN el Dashboard muestra una orden con ítems que tienen costos adicionales por personalización, THE Comanda SHALL reflejar esos costos en el total mostrado.

### Requisito 5: Notas generales del pedido

**Historia de usuario:** Como dueño de restaurante, quiero ver las notas generales del pedido en la comanda, para atender instrucciones especiales del cliente que aplican a toda la orden.

#### Criterios de Aceptación

1. IF una orden tiene notas generales del cliente (`order.notes`), THEN THE Comanda SHALL mostrar dichas notas en una sección destacada con fondo amarillo/ámbar, diferenciada de los ítems.
2. WHEN una orden no tiene notas generales, THE Comanda SHALL no mostrar la sección de notas para mantener la comanda limpia.

### Requisito 6: Consistencia visual y accesibilidad

**Historia de usuario:** Como dueño de restaurante, quiero que las comandas sean visualmente claras y consistentes, para poder leer la información rápidamente durante el servicio.

#### Criterios de Aceptación

1. THE Comanda SHALL usar la paleta de colores existente del proyecto (naranja `#ff8800` como color primario, azul para personalizaciones, ámbar para notas).
2. WHEN el Dashboard se visualiza en dispositivos móviles, THE Comanda SHALL ser completamente legible con scroll vertical sin elementos cortados.
3. THE Comanda SHALL eliminar los mensajes de debug (`console.log`, bloques `DEBUG`) actualmente presentes en el código de renderizado de ítems del dashboard.
4. THE Comanda SHALL mantener el selector de actualización de estado en la misma posición que actualmente para no romper el flujo de trabajo existente.
