# Documento de Diseño: Detalles de Órdenes en el Dashboard

## Visión General

El dashboard actualmente renderiza las órdenes en tarjetas (comandas) con información básica. El campo `customizations` de cada `OrderItem` ya llega correctamente desde la API (`/api/dashboard/store-orders`) — la query GROQ proyecta `customizations` y `notes` para ambos tipos de orden. El tipo TypeScript ya lo define en `hooks/useOrderNotifications.ts`.

**Diagnóstico del problema actual:** 

La query GROQ proyecta `customizations` correctamente para ambos tipos de orden. Los datos se guardan en Sanity con la estructura `{ title, options: [{ label, priceDelta }] }` (transformados por `transformCustomizations` en `create-click-collect-order/route.ts` para pick-up y en `webhook/route.ts` para delivery/Stripe).

Sin embargo, las personalizaciones no se muestran en el dashboard por las siguientes razones:

1. **El componente `OrderItemDetails`** ya existe y está correctamente implementado en `components/OrderItemDetails.tsx`, pero **no está importado ni usado** en `app/(store)/dashboard/page.tsx`.
2. **El código inline** en el dashboard tiene la lógica de personalización pero está rodeado de bloques IIFE de debug `{(() => { console.log(...); return null; })()}` que no afectan el renderizado directamente, pero indican que el código fue escrito de forma experimental y puede tener bugs.
3. **El tipo `Order`** en `hooks/useOrderNotifications.ts` no incluye `paymentMethod` explícitamente, por lo que ese campo no se muestra aunque llega en la respuesta de la API.
4. **El componente `OrderContactInfo`** existe pero tampoco está integrado en el dashboard.
5. **Para órdenes antiguas** (creadas antes de implementar la transformación de personalizaciones), el campo `customizations` puede ser `null` o `[]` en Sanity — esto es esperado y el componente `OrderItemDetails` ya lo maneja graciosamente.
6. **Posible problema de datos**: Si el producto no tiene `optionGroups` configurados en Sanity, o si la orden fue creada sin seleccionar personalizaciones, el campo `customizations` estará vacío y no hay nada que mostrar. Para verificar si hay datos, se puede revisar la respuesta de la API en las DevTools del navegador (`/api/dashboard/store-orders?storeId=...`) y buscar el campo `customizations` en los ítems.

**Nota sobre los dos flujos de compra:**
- **Pick-up / Click & Collect**: Documentos tipo `clickCollectOrder`. Las personalizaciones se guardan vía `create-click-collect-order/route.ts`.
- **Delivery / Envío**: Documentos tipo `order`. Las personalizaciones se guardan vía el webhook de Stripe en `webhook/route.ts`. Para órdenes de delivery, el campo `customizations` puede estar vacío si la orden fue creada sin personalizaciones o si el metadata de Stripe no incluía `itemsWithCustomizations`.

La solución consiste en:
1. Agregar `paymentMethod?: string` al tipo `Order` en `hooks/useOrderNotifications.ts`.
2. Importar y usar `OrderItemDetails` en el dashboard, reemplazando el bloque inline de renderizado de ítems.
3. Importar y usar `OrderContactInfo` en la comanda activa.
4. Mostrar el método de pago cuando esté disponible.
5. Limpiar todos los bloques de debug del renderizado de órdenes.
6. Mejorar la comanda del historial para mostrar más información útil.

No se requieren cambios en la API ni en los schemas de Sanity. No se crean nuevas rutas ni nuevos tipos de datos.

## Arquitectura

```
app/(store)/dashboard/page.tsx
  └── (tab "pedidos")
        ├── Pedidos Activos
        │     └── <OrderCard order={order} /> (refactorizado inline o extraído)
        │           ├── Header: badge estado, método entrega, código, fecha
        │           ├── <OrderContactInfo /> (ya existe en components/)
        │           ├── Lista de ítems con <OrderItemDetails /> (ya existe en components/)
        │           ├── Notas generales del pedido
        │           ├── Resumen financiero (total + método de pago)
        │           └── Selector de estado (sin cambios)
        └── Historial de Pedidos
              └── Fila mejorada con más info visible
```

No se introduce ningún componente nuevo de nivel superior. Se reutilizan los componentes existentes y se refactoriza el JSX inline del dashboard.

## Componentes e Interfaces

### Componentes existentes a integrar

**`components/OrderItemDetails.tsx`** — ya implementado, acepta `{ item: OrderItem }`.
- Renderiza: nombre del producto, cantidad, precio.
- Renderiza personalizaciones: título del grupo + opciones con priceDelta.
- Renderiza notas del ítem con fondo amarillo.
- Tiene logs de debug que se pueden dejar (son en el componente, no en el dashboard).

**`components/OrderContactInfo.tsx`** — ya implementado, acepta `{ customerName?, email?, phone? }`.
- Renderiza nombre, email, teléfono con iconos.
- Muestra aviso si no hay teléfono.

### Cambios en `app/(store)/dashboard/page.tsx`

**Sección "Pedidos Activos" — bloque de ítems (líneas ~800-840 aprox.):**

Reemplazar el bloque actual:
```tsx
// ANTES (con debug y lógica duplicada)
<ul className="space-y-2">
  {(order.items || []).map((i, idx) => (
    <li key={idx} className="text-sm">
      {/* ... lógica de customizations duplicada + debug ... */}
    </li>
  ))}
</ul>
```

Por:
```tsx
// DESPUÉS (usando componente existente)
import { OrderItemDetails } from "@/components/OrderItemDetails";
import { OrderContactInfo } from "@/components/OrderContactInfo";

// En la comanda activa:
<ul className="space-y-1 divide-y divide-gray-100">
  {(order.items || []).map((item, idx) => (
    <OrderItemDetails key={item.productId ? `${item.productId}-${idx}` : idx} item={item} />
  ))}
</ul>
```

**Sección de información de contacto:**

Agregar `OrderContactInfo` dentro de la comanda activa, antes del bloque de ítems:
```tsx
<OrderContactInfo
  customerName={order.customerInfo.name}
  email={order.customerInfo.email}
  phone={order.customerInfo.phone}
/>
```

**Método de pago:**

Agregar debajo del total:
```tsx
{order.paymentMethod && (
  <p className="text-xs text-gray-500 mt-1">
    Pago: {paymentMethodLabel(order.paymentMethod)}
  </p>
)}
```

Con un helper local:
```tsx
const paymentMethodLabel = (method: string) => {
  const labels: Record<string, string> = {
    cash_on_pickup: "Efectivo al recoger",
    card_on_pickup: "Tarjeta al recoger",
    cash_on_delivery: "Efectivo contra entrega",
    card: "Tarjeta",
    oxxo: "OXXO",
    bank_transfer: "Transferencia SPEI",
  };
  return labels[method] ?? method;
};
```

**Limpieza de debug:**

Eliminar todos los bloques `{(() => { console.log(...); return null; })()}` del renderizado de órdenes y el bloque de debug de items vacíos con fondo rojo.

### Tipo `Order` — sin cambios

El tipo ya incluye `paymentMethod?: string` implícitamente (viene de la API). Para mayor claridad, se puede agregar al tipo en `hooks/useOrderNotifications.ts`:

```typescript
export type Order = {
  // ... campos existentes ...
  paymentMethod?: string; // agregar si no está
};
```

## Modelos de Datos

No hay cambios en modelos de datos. La estructura de `customizations` ya está definida en Sanity y en los tipos TypeScript:

```typescript
// En hooks/useOrderNotifications.ts (ya existe)
export type OrderItem = {
  productName: string;
  productId: string;
  quantity: number;
  price: number;
  customizations?: Array<{
    title?: string;
    options?: Array<{
      label?: string;
      priceDelta?: number;
    }>;
  }>;
  notes?: string;
};
```

La query GROQ en `app/api/dashboard/store-orders/route.ts` ya proyecta `customizations` y `notes` para ambos tipos de orden (`clickCollectOrder` y `order`). No se requieren cambios en la API.

## Propiedades de Corrección

*Una propiedad es una característica o comportamiento que debe ser verdadero en todas las ejecuciones válidas del sistema. Las propiedades sirven como puente entre las especificaciones legibles por humanos y las garantías de corrección verificables por máquina.*

### Propiedad 1: Todos los ítems de una orden activa se renderizan

*Para cualquier* orden activa con N ítems, el componente de comanda debe renderizar exactamente N elementos de ítem, cada uno conteniendo el nombre del producto, la cantidad y el precio.

**Valida: Requisitos 1.1, 2.5**

### Propiedad 2: Las personalizaciones de todos los ítems se muestran

*Para cualquier* orden con ítems que tienen grupos de personalización, el renderizado debe contener el título de cada grupo y las etiquetas de cada opción seleccionada, para todos los ítems de la orden.

**Valida: Requisitos 2.1, 2.5**

### Propiedad 3: Los costos adicionales de personalización se formatean como MXN

*Para cualquier* opción de personalización con `priceDelta > 0`, el texto renderizado debe contener una representación en formato de moneda MXN (símbolo `$` y valor numérico).

**Valida: Requisito 2.2**

### Propiedad 4: La información de contacto del cliente se muestra completa

*Para cualquier* orden activa con datos de cliente (nombre, email, teléfono), el renderizado de la comanda debe contener los tres valores.

**Valida: Requisito 3.1**

### Propiedad 5: El total de la orden se formatea como moneda MXN

*Para cualquier* orden con `totalAmount`, el renderizado debe contener el valor formateado como moneda MXN.

**Valida: Requisito 4.1**

### Casos Edge

**Edge case 2.4:** Cuando un `OrderItem` tiene `customizations` vacío o `undefined` y `notes` vacío o `undefined`, el renderizado no debe contener secciones de personalización ni de notas.

**Edge case 3.3:** Cuando `order.customerInfo.phone` es `undefined` o vacío, el componente `OrderContactInfo` debe mostrar el aviso de "sin teléfono" en lugar del número.

**Edge case 5.2:** Cuando `order.notes` es `undefined` o vacío, la sección de notas generales no debe aparecer en el renderizado.

## Manejo de Errores

- Si `order.items` es `null` o `undefined` (puede ocurrir en órdenes antiguas), el renderizado usa `order.items || []` para evitar errores de runtime. Este patrón ya existe en el código actual.
- Si `order.customerInfo` tiene campos faltantes, `OrderContactInfo` los omite graciosamente (ya implementado en el componente).
- Si `customizations` tiene una estructura inesperada (ej. objeto en lugar de array), `OrderItemDetails` tiene un fallback que muestra `JSON.stringify(customGroup)`. Este comportamiento se mantiene.

## Estrategia de Pruebas

### Pruebas unitarias

Usar el framework de pruebas existente del proyecto. Los componentes `OrderItemDetails` y `OrderContactInfo` son candidatos directos para pruebas unitarias con React Testing Library:

- Renderizar `OrderItemDetails` con un ítem sin personalizaciones → verificar que no aparece sección de personalización.
- Renderizar `OrderItemDetails` con personalizaciones → verificar que aparecen título y opciones.
- Renderizar `OrderItemDetails` con `priceDelta > 0` → verificar formato MXN.
- Renderizar `OrderContactInfo` sin teléfono → verificar aviso de sin teléfono.

### Pruebas de propiedades (property-based testing)

Usar una librería de property-based testing compatible con el proyecto (ej. `fast-check` para TypeScript/JavaScript).

Cada propiedad debe ejecutarse con mínimo 100 iteraciones.

**Propiedad 1 — Todos los ítems se renderizan:**
```
// Feature: order-details-dashboard, Property 1: todos los ítems se renderizan
// Para cualquier array de OrderItems, el componente renderiza exactamente N ítems
fc.property(fc.array(arbitraryOrderItem(), { minLength: 1, maxLength: 10 }), (items) => {
  const rendered = render(<OrderItemDetails item={items[0]} />);
  // verificar que el nombre del producto aparece
})
```

**Propiedad 2 — Personalizaciones de todos los ítems:**
```
// Feature: order-details-dashboard, Property 2: personalizaciones se muestran
fc.property(arbitraryOrderItemWithCustomizations(), (item) => {
  const rendered = render(<OrderItemDetails item={item} />);
  item.customizations?.forEach(group => {
    expect(rendered.getByText(group.title)).toBeTruthy();
  });
})
```

**Propiedad 3 — Formato MXN para priceDelta:**
```
// Feature: order-details-dashboard, Property 3: priceDelta formateado como MXN
fc.property(fc.float({ min: 0.01, max: 1000 }), (delta) => {
  const item = makeItemWithPriceDelta(delta);
  const rendered = render(<OrderItemDetails item={item} />);
  expect(rendered.container.textContent).toContain('$');
})
```

**Propiedad 4 — Información de contacto completa:**
```
// Feature: order-details-dashboard, Property 4: contacto completo
fc.property(arbitraryCustomerInfo(), (customerInfo) => {
  const rendered = render(<OrderContactInfo {...customerInfo} />);
  expect(rendered.container.textContent).toContain(customerInfo.customerName);
  expect(rendered.container.textContent).toContain(customerInfo.email);
  expect(rendered.container.textContent).toContain(customerInfo.phone);
})
```

### Pruebas de integración

Verificar manualmente en el navegador que:
1. Las personalizaciones aparecen en las comandas activas.
2. El selector de estado sigue funcionando correctamente.
3. No hay errores de consola relacionados con el renderizado de órdenes.
4. La página es usable en móvil (viewport 375px).
