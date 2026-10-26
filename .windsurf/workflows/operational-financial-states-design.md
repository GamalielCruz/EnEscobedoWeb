---
description: Diseño de arquitectura para separación de estados operativos y financieros
---

# Diseño de Separación de Estados Operativos y Financieros

## 1. Estados Operativos

Los estados operativos describen el ciclo de vida físico del pedido desde su creación hasta la entrega al cliente.

### Estados Definidos

| Estado | Descripción | Trigger |
|--------|-------------|---------|
| `draft` | Pedido en creación, aún no enviado al restaurante | Usuario completa checkout |
| `pending_restaurant` | Pedido enviado, esperando aceptación del restaurante | Pedido enviado a restaurante |
| `accepted` | Restaurante aceptó el pedido | Restaurante confirma aceptación |
| `preparing` | Restaurante está preparando el pedido | Restaurante inicia preparación |
| `ready_for_pickup` | Pedido listo para recoger | Restaurante marca como listo |
| `picked_up` | Repartidor recogió el pedido | Repartidor confirma pickup |
| `on_the_way` | Repartidor en ruta al cliente | Repartidor inicia entrega |
| `delivered` | Pedido entregado al cliente | Repartidor confirma entrega |
| `cancelled` | Pedido cancelado | Cancelación por cliente o restaurante |
| `no_show` | Cliente no se presentó (pickup) | Timeout en pickup |

### Flujo Operativo Típico

```
draft → pending_restaurant → accepted → preparing → ready_for_pickup
                                                              ↓
delivery:                                         picked_up → on_the_way → delivered
pickup:                                                    ↓
                                                      delivered (cliente recoge)
```

### Estados Especiales por Tipo de Pedido

**Delivery:**
- Flujo completo: `draft → pending_restaurant → accepted → preparing → ready_for_pickup → picked_up → on_the_way → delivered`

**Pickup:**
- Flujo simplificado: `draft → pending_restaurant → accepted → preparing → ready_for_pickup → delivered`

**Mandado:**
- Flujo especial: `draft → pending_restaurant → accepted → on_the_way → delivered`

---

## 2. Estados Financieros

Los estados financieros describen el ciclo de vida de las transacciones monetarias, completamente independiente del flujo operativo.

### Estados Definidos

| Estado | Descripción | Trigger |
|--------|-------------|---------|
| `pending` | Pedido creado, sin snapshot financiero | Pedido creado |
| `snapshot_created` | Snapshot financiero generado (importes definitivos) | Importes se vuelven inmutables |
| `awaiting_payment` | Esperando confirmación de pago | Pago iniciado pero no confirmado |
| `payment_confirmed` | Pago confirmado por procesador | Stripe/otro procesador confirma |
| `payment_collected` | Efectivo cobrado por repartidor/tienda | Repartidor/tienda confirma cobro |
| `ready_for_settlement` | Listo para liquidar a partes | Pago confirmado y pedido entregado |
| `settled` | Liquidación ejecutada | Transferencias enviadas |
| `reconciled` | Conciliado con procesador de pagos | Stripe/otro procesador conciliado |
| `refunded` | Reembolso completo | Reembolso procesado |
| `partially_refunded` | Reembolso parcial | Reembolso parcial procesado |
| `disputed` | Disputa de pago iniciada | Cliente inicia disputa |
| `chargeback` | Chargeback procesado | Procesador revierte pago |

### Máquina de Estados Financieros

```
pending → snapshot_created → awaiting_payment → payment_confirmed → ready_for_settlement → settled → reconciled
                                              ↓
                                              payment_collected (cash)
                                              ↓
                                         ready_for_settlement → settled → reconciled

refunded ←─────┘
partially_refunded ←─────┘
disputed ←─────┘
chargeback ←─────┘
```

### Transiciones Válidas

| Desde | Hacia | Condición |
|-------|-------|----------|
| `pending` | `snapshot_created` | Importes son definitivos |
| `snapshot_created` | `awaiting_payment` | Pago en línea iniciado |
| `snapshot_created` | `payment_collected` | Efectivo cobrado |
| `awaiting_payment` | `payment_confirmed` | Procesador confirma pago |
| `awaiting_payment` | `refunded` | Pago falló o fue cancelado |
| `payment_confirmed` | `ready_for_settlement` | Pedido entregado |
| `payment_collected` | `ready_for_settlement` | Pedido entregado |
| `ready_for_settlement` | `settled` | Liquidaciones ejecutadas |
| `settled` | `reconciled` | Conciliación con procesador |
| `settled` | `refunded` | Reembolso solicitado |
| `settled` | `partially_refunded` | Reembolso parcial solicitado |
| `settled` | `disputed` | Disputa iniciada |
| `disputed` | `chargeback` | Chargeback procesado |
| `reconciled` | `refunded` | Reembolso post-conciliación |
| `reconciled` | `partially_refunded` | Reembolso parcial post-conciliación |

---

## 3. Eventos

Los eventos son los disparadores que causan transiciones de estado.

### Eventos Operativos

| Evento | Descripción | Efecto Operativo |
|--------|-------------|------------------|
| `OrderCreated` | Usuario completa checkout | `draft` → `pending_restaurant` |
| `RestaurantAccepted` | Restaurante acepta pedido | `pending_restaurant` → `accepted` |
| `RestaurantRejected` | Restaurante rechaza pedido | `pending_restaurant` → `cancelled` |
| `PreparationStarted` | Restaurante inicia preparación | `accepted` → `preparing` |
| `OrderReady` | Pedido listo para recoger | `preparing` → `ready_for_pickup` |
| `DriverPickedUp` | Repartidor recogió pedido | `ready_for_pickup` → `picked_up` |
| `DriverOnTheWay` | Repartidor en ruta | `picked_up` → `on_the_way` |
| `OrderDelivered` | Pedido entregado | `on_the_way` → `delivered` |
| `CustomerPickedUp` | Cliente recogió pedido (pickup) | `ready_for_pickup` → `delivered` |
| `OrderCancelled` | Pedido cancelado | Cualquier → `cancelled` |
| `CustomerNoShow` | Cliente no se presentó | `ready_for_pickup` → `no_show` |

### Eventos Financieros

| Evento | Descripción | Efecto Financiero |
|--------|-------------|-------------------|
| `SnapshotCreated` | Importes se vuelven definitivos | `pending` → `snapshot_created` |
| `PaymentInitiated` | Pago en línea iniciado | `snapshot_created` → `awaiting_payment` |
| `PaymentSucceeded` | Procesador confirma pago | `awaiting_payment` → `payment_confirmed` |
| `PaymentFailed` | Procesador rechaza pago | `awaiting_payment` → `refunded` |
| `CashCollected` | Efectivo cobrado | `snapshot_created` → `payment_collected` |
| `OrderCompleted` | Pedido entregado | `payment_confirmed/payment_collected` → `ready_for_settlement` |
| `SettlementExecuted` | Liquidaciones enviadas | `ready_for_settlement` → `settled` |
| `ReconciliationCompleted` | Conciliación finalizada | `settled` → `reconciled` |
| `RefundRequested` | Reembolso solicitado | `settled/reconciled` → `refunded` |
| `PartialRefundRequested` | Reembolso parcial solicitado | `settled/reconciled` → `partially_refunded` |
| `DisputeOpened` | Disputa iniciada | `settled/reconciled` → `disputed` |
| `ChargebackProcessed` | Chargeback procesado | `disputed` → `chargeback` |

---

## 4. Reglas de Coexistencia de Estados

Los estados operativos y financieros pueden coexistir en diferentes combinaciones sin inconsistencias.

### Combinaciones Válidas

| Estado Operativo | Estado Financiero | Significado |
|------------------|-------------------|-------------|
| `draft` | `pending` | Pedido en creación, sin snapshot |
| `pending_restaurant` | `snapshot_created` | Pedido enviado, importes definitivos |
| `accepted` | `awaiting_payment` | Restaurante aceptó, esperando pago |
| `preparing` | `payment_confirmed` | Preparando, pago confirmado |
| `ready_for_pickup` | `payment_confirmed` | Listo, pago confirmado |
| `ready_for_pickup` | `payment_collected` | Listo, efectivo cobrado |
| `on_the_way` | `payment_confirmed` | En ruta, pago confirmado |
| `on_the_way` | `payment_collected` | En ruta, efectivo cobrado |
| `delivered` | `ready_for_settlement` | Entregado, listo para liquidar |
| `delivered` | `settled` | Entregado, liquidado |
| `delivered` | `reconciled` | Entregado, conciliado |
| `cancelled` | `refunded` | Cancelado, reembolsado |
| `cancelled` | `pending` | Cancelado antes de snapshot |

### Combinaciones Inválidas

| Estado Operativo | Estado Financiero | Razón |
|------------------|-------------------|-------|
| `draft` | `payment_confirmed` | No puede haber pago sin snapshot |
| `cancelled` | `settled` | Pedido cancelado no puede estar liquidado |
| `delivered` | `awaiting_payment` | Pedido entregado debe tener pago confirmado |
| `preparing` | `settled` | No se puede liquidar antes de entregar |

---

## 5. Casos Especiales

### Efectivo

**Flujo:**
1. `pending` → `snapshot_created` (al aceptar restaurante)
2. `snapshot_created` → `payment_collected` (al cobrar efectivo)
3. `payment_collected` → `ready_for_settlement` (al entregar)
4. `ready_for_settlement` → `settled` (liquidación)

**Snapshot Timing:**
- Se crea cuando restaurante acepta (importes son definitivos)
- No requiere confirmación de pago externo

### Stripe

**Flujo:**
1. `pending` → `snapshot_created` (al capturar pago)
2. `snapshot_created` → `awaiting_payment` (pago iniciado)
3. `awaiting_payment` → `payment_confirmed` (Stripe confirma)
4. `payment_confirmed` → `ready_for_settlement` (al entregar)
5. `ready_for_settlement` → `settled` (liquidación)
6. `settled` → `reconciled` (conciliación Stripe)

**Snapshot Timing:**
- Se crea cuando Stripe captura el pago (importes son definitivos)
- Incluye fees reales de Stripe

### Pedidos Cancelados

**Antes de Snapshot:**
- Operativo: `cancelled`
- Financiero: `pending`
- No se crea snapshot
- Sin liquidaciones

**Después de Snapshot:**
- Operativo: `cancelled`
- Financiero: `refunded`
- Snapshot existe, se usa para calcular reembolso
- Reembolso proporcional según política

### Reembolsos

**Reembolso Completo:**
- Operativo: `cancelled` o `delivered`
- Financiero: `refunded`
- Usa snapshot para calcular importes a devolver
- Registra `refundAmount` y `refundReason`

**Reembolso Parcial:**
- Operativo: `delivered`
- Financiero: `partially_refunded`
- Usa snapshot para calcular importes
- Registra `refundAmount` y `refundReason`

### Pagos Parciales

**No soportado actualmente:**
- El sistema no permite pagos parciales
- Si se requiere en futuro, agregar estado `partially_paid`

### Promociones y Cupones

**Snapshot Timing:**
- Descuentos se incluyen en snapshot
- `discountAmount` es parte del snapshot
- No se recalcula después

**Reembolsos con Promociones:**
- Reembolso proporcional considerando descuento aplicado
- Política de reembolso de promociones configurable

### Propinas

**No incluidas en snapshot actual:**
- Propinas se manejan separadamente
- Futuro: agregar `tipAmount` a snapshot
- Propinas no afectan liquidaciones principales

### Pedidos Programados

**Snapshot Timing:**
- Snapshot se crea al aceptar restaurante (importes son definitivos)
- No se crea al programar (importes pueden cambiar)
- Estado financiero: `snapshot_created` antes de `preparing`

---

## 6. Migración y Compatibilidad

### Estrategia de Migración

**Fase 1: Agregar nuevos campos (sin breaking changes)**
- Agregar `operationalStatus` al schema
- Agregar `financialStatus` al schema
- Mantener `orderStatus` existente como campo legacy
- Mantener `paymentStatus` existente como campo legacy

**Fase 2: Mapeo de estados existentes**
- Mapear `orderStatus` existente a `operationalStatus`
- Mapear `paymentStatus` existente a `financialStatus`
- Crear función de migración para pedidos existentes

**Fase 3: Actualizar código para usar nuevos estados**
- Actualizar funciones que leen estados para usar nuevos campos
- Mantener compatibilidad leyendo campos legacy si nuevos no existen
- Agregar logs para trackear migración

**Fase 4: Eliminar campos legacy**
- Después de confirmar que todos los pedidos tienen nuevos estados
- Eliminar `orderStatus` y `paymentStatus` legacy
- Actualizar referencias en código

### Mapeo de Estados Existentes

**Operativo (orderStatus → operationalStatus):**
- `pending` → `pending_restaurant`
- `processing` → `preparing`
- `ready_for_pickup` → `ready_for_pickup`
- `shipped` → `on_the_way`
- `delivered` → `delivered`
- `completed` → `delivered`
- `cancelled` → `cancelled`

**Financiero (paymentStatus → financialStatus):**
- `unpaid` → `pending` (si no snapshot) o `snapshot_created` (si snapshot)
- `pending` → `awaiting_payment`
- `paid` → `payment_confirmed` (Stripe) o `payment_collected` (efectivo)
- `refunded` → `refunded`

### Backward Compatibility

**Lectura de estados:**
```typescript
function getOperationalStatus(order: Order): OperationalStatus {
  // Preferir nuevo campo, fallback a legacy
  return order.operationalStatus || mapLegacyStatus(order.orderStatus);
}

function getFinancialStatus(order: Order): FinancialStatus {
  // Preferir nuevo campo, fallback a legacy
  return order.financialStatus || mapLegacyFinancialStatus(order.paymentStatus);
}
```

**Escritura de estados:**
```typescript
function setOperationalStatus(order: Order, status: OperationalStatus) {
  // Escribir ambos campos durante migración
  return {
    ...order,
    operationalStatus: status,
    orderStatus: mapToLegacyStatus(status), // Temporal durante migración
  };
}
```

### Validación de Migración

**Antes de eliminar campos legacy:**
1. Verificar que todos los pedidos tienen `operationalStatus`
2. Verificar que todos los pedidos tienen `financialStatus`
3. Verificar que no hay código leyendo campos legacy
4. Correr script de migración en ambiente de prueba
5. Validar con pedidos de prueba en producción

---

## 7. Implementación Sugerida

### Schema de Sanity

```typescript
// Nuevos campos
defineField({ name: "operationalStatus", title: "Operational Status", type: "string" }),
defineField({ name: "financialStatus", title: "Financial Status", type: "string" }),

// Campos legacy (eliminar después de migración)
defineField({ name: "orderStatus", title: "Order Status (Legacy)", type: "string" }),
defineField({ name: "paymentStatus", title: "Payment Status (Legacy)", type: "string" }),
```

### Tipos TypeScript

```typescript
type OperationalStatus = 
  | "draft"
  | "pending_restaurant"
  | "accepted"
  | "preparing"
  | "ready_for_pickup"
  | "picked_up"
  | "on_the_way"
  | "delivered"
  | "cancelled"
  | "no_show";

type FinancialStatus = 
  | "pending"
  | "snapshot_created"
  | "awaiting_payment"
  | "payment_confirmed"
  | "payment_collected"
  | "ready_for_settlement"
  | "settled"
  | "reconciled"
  | "refunded"
  | "partially_refunded"
  | "disputed"
  | "chargeback";
```

### Funciones de Transición

```typescript
// Operativo
function transitionOperationalStatus(
  current: OperationalStatus,
  event: OperationalEvent
): OperationalStatus {
  const transitions = {
    draft: { OrderCreated: "pending_restaurant" },
    pending_restaurant: { RestaurantAccepted: "accepted", RestaurantRejected: "cancelled" },
    accepted: { PreparationStarted: "preparing" },
    preparing: { OrderReady: "ready_for_pickup" },
    ready_for_pickup: { DriverPickedUp: "picked_up", CustomerPickedUp: "delivered" },
    picked_up: { DriverOnTheWay: "on_the_way" },
    on_the_way: { OrderDelivered: "delivered" },
  };
  return transitions[current]?.[event] ?? current;
}

// Financiero
function transitionFinancialStatus(
  current: FinancialStatus,
  event: FinancialEvent
): FinancialStatus {
  const transitions = {
    pending: { SnapshotCreated: "snapshot_created" },
    snapshot_created: { PaymentInitiated: "awaiting_payment", CashCollected: "payment_collected" },
    awaiting_payment: { PaymentSucceeded: "payment_confirmed", PaymentFailed: "refunded" },
    payment_confirmed: { OrderCompleted: "ready_for_settlement" },
    payment_collected: { OrderCompleted: "ready_for_settlement" },
    ready_for_settlement: { SettlementExecuted: "settled" },
    settled: { ReconciliationCompleted: "reconciled", RefundRequested: "refunded" },
    reconciled: { RefundRequested: "refunded" },
  };
  return transitions[current]?.[event] ?? current;
}
```

### Validación de Estados

```typescript
function validateStateCombination(
  operational: OperationalStatus,
  financial: FinancialStatus
): { valid: boolean; reason?: string } {
  const invalidCombinations = [
    { op: "draft", fin: "payment_confirmed", reason: "No payment without snapshot" },
    { op: "cancelled", fin: "settled", reason: "Cancelled order cannot be settled" },
    { op: "delivered", fin: "awaiting_payment", reason: "Delivered order must have confirmed payment" },
  ];

  for (const { op, fin, reason } of invalidCombinations) {
    if (operational === op && financial === fin) {
      return { valid: false, reason };
    }
  }

  return { valid: true };
}
```

---

## 8. Próximos Pasos

1. **Revisar y aprobar este diseño**
2. **Crear script de migración** para pedidos existentes
3. **Implementar nuevos campos en schema**
4. **Actualizar código para usar nuevos estados**
5. **Implementar funciones de transición**
6. **Agregar validaciones**
7. **Probar en ambiente de desarrollo**
8. **Ejecutar migración en producción**
9. **Eliminar campos legacy**
10. **Actualizar documentación**
