# AUDITORÍA TÉCNICA Y FINANCIERA - MÓDULO MANDADOS ELMENU

**Fecha:** 19 de agosto de 2026  
**Alcance:** Exclusivamente inspección y análisis. Sin modificaciones.  
**Objetivo:** Determinar preparación para monetizar Mandados.

---

## 1. RESUMEN EJECUTIVO

1. **El precio al cliente se calcula** basado en zonas geográficas + tarifa de servicio fija ($14 MXN)
2. **NO existe cálculo de pago al repartidor** - actualmente `driverPayout` = precio total del Mandado
3. **El sistema financiero está parcialmente implementado** - usa settlement snapshots genéricos
4. **Costos de procesador de pagos** están calculados (Stripe: 3.6% + $3.00 MXN)
5. **NO existe margen de ElMenu** - actualmente `platformNetTotal` = -fee de Stripe (pérdida)
6. **La distancia NO se calcula** - solo se usa para determinar zona geográfica
7. **Google Maps se usa solo para UI** - NO para cálculo de distancia real
8. **Baserow sincroniza datos financieros** pero NO específicos para Mandados
9. **NO existen promociones/descuentos** específicos para Mandados
10. **El modelo actual NO es sostenible** - cada Mandado genera pérdida por fees de Stripe

---

## 2. ESTADO ACTUAL DE MONETIZACIÓN

| Componente | Estado | Detalle |
|------------|--------|---------|
| Cálculo de precio al cliente | 🟢 Existe | Zonas + tarifa servicio fija |
| Pago al repartidor | 🔴 No existe | driverPayout = precio total (100%) |
| Margen de ElMenu | 🔴 No existe | platformNetTotal = -Stripe fee |
| Fees de procesador | 🟢 Existe | Stripe: 3.6% + $3.00 MXN |
| Settlement snapshots | 🟡 Parcial | Genéricos, NO específicos Mandados |
| Baserow financiero | 🟡 Parcial | Sincroniza pero NO específico |
| Cálculo de distancia | 🔴 No existe | Solo para determinar zona |
| Tarifas dinámicas | 🔴 No existe | Solo horarios fijos |
| Promociones/descuentos | 🔴 No existe | NO implementado |
| Reembolsos | 🟡 Parcial | Schema existe, NO lógica Mandados |

---

## 3. FLUJO FINANCIERO ACTUAL

```
Cliente
   ↓
MandadoCheckout.tsx (selección método pago)
   ↓
├─→ Tarjeta: /api/mandado/checkout-session
│      ↓
│   Stripe Checkout Session
│      ↓
│   stripe-order.ts (webhook)
│      ↓
│   buildMandadoOrderDocument()
│      ↓
│   Sanity (order document)
│      ↓
│   Baserow (sync)
│
└─→ Efectivo: /api/mandado/orders
       ↓
    buildMandadoOrderDocument()
       ↓
    Sanity (order document)
       ↓
    Baserow (sync)
```

**Flujo de dinero:**
- Cliente paga → Stripe (tarjeta) o repartidor (efectivo)
- Stripe cobra fee → ElMenu absorbe pérdida
- Repartidor recibe → 100% del precio (NO hay retención)
- ElMenu recibe → NEGATIVO (solo paga fees)

---

## 4. FÓRMULA ECONÓMICA ACTUAL

### Cálculo de precio al cliente

**Archivo:** `lib/mandado.ts` (líneas 39-55)

```typescript
finalPrice = Math.max(origin.finalPrice, destination.finalPrice) + MANDADO_SERVICE_FEE
```

**Donde:**
- `origin.finalPrice` = tarifa de zona de origen (desde Sanity `deliveryPricingConfig`)
- `destination.finalPrice` = tarifa de zona de destino
- `MANDADO_SERVICE_FEE` = $14 MXN (hardcodeado en `lib/mandado.ts` línea 37)

**Cálculo de tarifa de zona:**
- Archivo: `lib/delivery-zones.ts` (líneas 273-333)
- Fórmula: `zone.basePrice * demandMultiplier * scheduleMultiplier`
- `demandMultiplier` = 1 (fijo, NO dinámico)
- `scheduleMultiplier` = 1.0-1.3 según horario (normal/nocturno/pico)

**Ejemplo realista:**
```
Zona origen (Centro): $45
Zona destino (Centro): $45
Tarifa servicio: $14
----------------------
Total cliente: $59 MXN
```

### Cálculo de pago al repartidor

**Archivo:** `lib/mandado-order.ts` (línea 154)

```typescript
driverPayout: input.draft.price
```

**Actualmente:** `driverPayout` = 100% del precio que paga el cliente

**NO existe:** cálculo de porcentaje, tarifa por km, o cualquier deducción.

### Cálculo de utilidad de ElMenu

**Archivo:** `lib/mandado-order.ts` (línea 157)

```typescript
platformNetTotal: paidOnline ? -stripeFee : 0
```

**Actualmente:**
- Pago tarjeta: `platformNetTotal` = -fee de Stripe (PÉRDIDA)
- Pago efectivo: `platformNetTotal` = 0 (cero utilidad)

**NO existe:** comisión de plataforma, margen, o cualquier ingreso.

---

## 5. INFORMACIÓN FINANCIERA DISPONIBLE

### Campos existentes en Sanity (schema `orderType.ts`)

| Campo | Tipo | Usado en Mandados | Descripción |
|-------|------|-------------------|-------------|
| `totalPrice` | number | ✅ Sí | Precio total pagado por cliente |
| `grossTotal` | number | ✅ Sí | Total bruto (igual a totalPrice) |
| `shippingFee` | number | ✅ Sí | Costo de envío (igual a totalPrice) |
| `productsSubtotal` | number | ✅ Sí | Siempre 0 en Mandados |
| `platformServiceFee` | number | ✅ Sí | Siempre 0 en Mandados |
| `platformCommission` | number | ✅ Sí | Siempre 0 en Mandados |
| `stripeFee` | number | ✅ Sí | Fee de Stripe (legacy) |
| `stripeFeePercentage` | number | ✅ Sí | Porcentaje fee Stripe (legacy) |
| `stripeFixedFee` | number | ✅ Sí | Tarifa fija Stripe (legacy) |
| `stripeNetAmount` | number | ✅ Sí | Neto después de fee Stripe (legacy) |
| `paymentProcessingFee` | number | ✅ Sí | Fee procesador genérico |
| `paymentProcessingFeePercentage` | number | ✅ Sí | Porcentaje fee procesador |
| `paymentProcessingFixedFee` | number | ✅ Sí | Tarifa fija procesador |
| `paymentNetAmount` | number | ✅ Sí | Neto después de fee procesador |
| `driverPayout` | number | ✅ Sí | Pago al repartidor (100% del precio) |
| `storeNetTotal` | number | ✅ Sí | Siempre 0 en Mandados |
| `platformNetTotal` | number | ✅ Sí | Utilidad de plataforma (negativa o cero) |
| `settlementSnapshot` | object | ✅ Sí | Snapshot financiero inmutable |
| `paymentMethod` | string | ✅ Sí | stripe / cash_on_delivery |
| `paymentProvider` | string | ✅ Sí | stripe / cash |
| `paymentStatus` | string | ✅ Sí | paid / unpaid / pending |
| `settlementStatus` | string | ✅ Sí | ready / pending / settled |

### Settlement Snapshot (existentes)

**Archivo:** `lib/settlements.ts` (líneas 61-83)

Campos disponibles:
- `version`: número de versión del snapshot
- `createdAt`: timestamp de creación
- `paymentProvider`: stripe/cash
- `settlementPolicy`: política usada
- `currency`: MXN
- `restaurantSubtotal`: 0 en Mandados
- `deliveryAmount`: precio del Mandado
- `platformCommission`: 0 en Mandados
- `platformServiceFee`: 0 en Mandados
- `paymentProcessingFee`: fee de Stripe
- `paymentProcessingFeePercentage`: 3.6%
- `paymentProcessingFixedFee`: $3.00
- `restaurantProcessingFee`: 0
- `courierProcessingFee`: fee asignada a repartidor
- `platformProcessingFee`: fee asignada a plataforma
- `restaurantSettlement`: 0
- `courierSettlement`: pago neto a repartidor
- `platformNetRevenue`: ingreso neto plataforma (negativo)
- `grossTotal`: total del Mandado

---

## 6. INFORMACIÓN FINANCIERA FALTANTE

| Campo/Dato | Estado | Impacto |
|------------|--------|---------|
| Distancia real recorrida | 🔴 No existe | CRÍTICO - no se puede cobrar por km |
| Tiempo de espera | 🔴 No existe | IMPORTANTE - no se puede cobrar por espera |
| Tarifa por km | 🔴 No existe | CRÍTICO - modelo de negocio básico |
| Tarifa base por zona | 🟡 Parcial | Existe pero NO específica para Mandados |
| Tarifa de espera | 🔴 No existe | IMPORTANTE - para tiempos largos |
| Comisión de plataforma | 🔴 No existe | CRÍTICO - sin ingresos |
| Porcentaje para repartidor | 🔴 No existe | CRÍTICO - actualmente 100% |
| Tarifa mínima | 🔴 No existe | IMPORTANTE - protección contra pérdidas |
| Tarifa máxima | 🔴 No existe | IMPORTANTE - protección cliente |
| Costos operativos | 🔴 No existe | IMPORTANTE - para calcular margen real |
| Propinas | 🔴 No existe | OPORTUNIDAD - ingreso adicional |
| Recargos por demanda | 🔴 No existe | OPORTUNIDAD - dinámica |
| Descuentos promocionales | 🔴 No existe | OPORTUNIDAD - marketing |
| Límites de distancia | 🔴 No existe | RIESGO - viajes muy largos |
| Validación de rentabilidad | 🔴 No existe | RIESGO - puede perder dinero |

---

## 7. RIESGOS DE RENTABILIDAD

### A. Mandado corto (1-3 km)

**Escenario actual:**
```
Distancia: 2 km
Zona Centro: $45
Tarifa servicio: $14
Total cliente: $59
Fee Stripe (3.6% + $3): $5.12
Neto ElMenu: -$5.12 (PÉRDIDA)
Repartidor recibe: $59 (100%)
```

**Riesgo:** ALTO - Pérdida garantizada en cada Mandado con tarjeta.

### B. Mandado largo (8-15 km)

**Escenario actual:**
```
Distancia: 12 km
Zona Lira: $80
Tarifa servicio: $14
Total cliente: $94
Fee Stripe (3.6% + $3): $6.38
Neto ElMenu: -$6.38 (PÉRDIDA)
Repartidor recibe: $94 (100%)
```

**Riesgo:** CRÍTICO - Pérdida mayor en viajes largos, sin compensación por distancia.

### C. Espera prolongada

**Escenario actual:**
```
Precio: $59
Tiempo espera: 30 minutos
Costo adicional: $0 (NO cobrado)
Repartidor: NO compensado por tiempo
ElMenu: NO cobra por espera
```

**Riesgo:** MEDIO - Repartidor puede rechazar pedidos con espera larga.

### D. Recolección + entrega

**Escenario actual:**
```
Distancia recolección: 2 km
Distancia entrega: 3 km
Total recorrido: 5 km
Precio cobrado: basado en ZONA (no distancia)
Diferencia: NO se mide
```

**Riesgo:** ALTO - Puede cobrar poco por recorrido real largo.

### E. Repartidor sin disponibilidad

**Escenario actual:**
```
Sin repartidores: notificación al cliente
Costo operativo: $0 (NO medido)
Costo oportunidad: NO cuantificado
```

**Riesgo:** BAJO - Solo afecta experiencia, no costo directo.

### F. Cancelación

**Escenario actual:**
```
Cliente cancela: orderStatus = "cancelled"
Fee Stripe: NO recuperable (si ya pagó)
Reembolso: manual (NO automatizado)
Costo cancelación: NO cobrado
```

**Riesgo:** MEDIO - Pérdida de fee de Stripe en cancelaciones.

### G. Reembolso

**Escenario actual:**
```
Reembolso solicitado: refundStatus = "requested"
Proceso: manual (NO automatizado)
Fee Stripe: NO recuperable
```

**Riesgo:** ALTO - Pérdida de fee + costo operativo de reembolso.

### H. Alta demanda

**Escenario actual:**
```
Demanda alta: demandMultiplier = 1 (fijo)
Precio: NO aumenta
Repartidores: mismos precios
```

**Riesgo:** MEDIO - Sin incentivos para repartidores en alta demanda.

### I. Promociones/descuentos

**Escenario actual:**
```
Descuento: NO existe
Quién absorbe: N/A
```

**Riesgo:** BAJO - No aplica actualmente, pero riesgo futuro si se implementan sin lógica de absorción.

---

## 8. AUDITORÍA DE DISTANCIA Y CÁLCULO GEOGRÁFICO

### Uso actual de Google Maps

**Archivos:**
- `components/GooglePlacesAutocomplete.tsx` - UI de selección de direcciones
- `components/GoogleMapsProvider.tsx` - Proveedor de mapa
- `hooks/useGoogleMaps.ts` - Hook para cargar Google Maps

**Función:** Solo para UI - selección de direcciones por el cliente.

**Cálculo de distancia:** NO existe cálculo de distancia real.

### Determinación de zonas

**Archivo:** `lib/delivery-zones.ts` (líneas 239-251)

```typescript
function findMatchingZone(zones: DeliveryZone[], lat: number, lng: number) {
  const userPoint = point([lng, lat]);
  return zones.find((zone) => {
    const ring = zone.coordinates.map((coord) => [coord.lng, coord.lat]);
    return booleanPointInPolygon(userPoint, polygon([closedRing]));
  }) ?? null;
}
```

**Método:** Point-in-polygon (Turf.js) - determina si un punto está dentro de un polígono.

**NO usa:** Google Maps Distance Matrix, Directions API, o cualquier API de distancia.

### Configuración de zonas

**Archivo:** `lib/delivery-zones.ts` (líneas 125-202)

Zonas predefinidas en código (Pedro Escobedo):
- Chamizal: $45
- Centro: $30
- Lira: $80
- El Sauz: $70

**Fuente:** Hardcodeadas en código, NO en Sanity.

### Horarios y multiplicadores

**Archivo:** `lib/delivery-zones.ts` (líneas 84-109)

- Normal (08:00-20:59): multiplier 1.0
- Nocturno (21:00-23:59): multiplier 1.2
- Pico (13:00-15:30): multiplier 1.3

**Aplicación:** `zone.basePrice * demandMultiplier * scheduleMultiplier`

**Demand multiplier:** Fijo en 1 (NO dinámico).

### Riesgo de distancia

**Problema:** El precio se basa en ZONA, no en distancia real.

**Ejemplo de riesgo:**
```
Cliente A: Zona Centro (30km al norte) → $30 + $14 = $44
Cliente B: Zona Centro (1km al norte) → $30 + $14 = $44
Misma zona, distancias muy diferentes, mismo precio.
```

**Conclusión:** El sistema NO mide distancia real, solo pertenencia a zona.

---

## 9. AUDITORÍA DE COSTOS OCULTOS

### Costos representados en el sistema

| Costo | Representado | Campo | Valor |
|-------|--------------|-------|-------|
| Stripe (tarjeta) | ✅ Sí | `paymentProcessingFee` | 3.6% + $3.00 |
| Stripe (efectivo) | ✅ Sí | `paymentProcessingFee` | $0 |
| Google Maps | ❌ No | N/A | NO medido |
| WhatsApp | ❌ No | N/A | NO medido |
| Baserow | ❌ No | N/A | NO medido |
| Sanity | ❌ No | N/A | NO medido |
| Vercel | ❌ No | N/A | NO medido |
| Reembolsos | 🟡 Parcial | `refundStatus` | Existe schema, NO lógica |
| Promociones | ❌ No | N/A | NO existe |
| Soporte | ❌ No | N/A | NO medido |
| Incentivos | ❌ No | N/A | NO existe |
| Bonos | ❌ No | N/A | NO existe |

### Costos NO representados

**Todos los costos operativos están ausentes del sistema financiero.**

Esto significa que cualquier cálculo de utilidad será INCOMPLETO.

---

## 10. REVISIÓN DE SANITY Y MODELO DE DATOS

### Schema de orden (`orderType.ts`)

**Campos financieros específicos de Mandados:** NO existen.

**Campos financieros genéricos:** Reutilizados de restaurantes.

**Campos específicos de Mandados:**
- `serviceKind`: "mandado"
- `mandadoMode`: "pickup" | "purchase"
- `mandadoEntregaSegura`: boolean
- `mandadoOrigin`: {label, lat, lng}
- `mandadoDestination`: {label, lat, lng}
- `mandadoDetails`: text
- `mandadoRecipientPhone`: string
- `mandadoRecipientName`: string
- `mandadoRecipientWhatsAppDeclared`: boolean
- `senderNipFallbackAccepted`: boolean
- `mandadoNipRecipient`: "sender" | "recipient"
- `nipDeliveryChannel`: "whatsapp_sender" | "whatsapp_recipient" | "none"
- `nipDeliveryPhone`: string
- `mandadoBusinessName`: string
- `mandadoOriginReference`: string
- `mandadoDestinationReference`: string
- `authorizedRecipientName`: string

**Campos financieros FALTANTES para Mandados:**
- `mandadoDistanceKm`: number
- `mandadoEstimatedDurationMinutes`: number
- `mandadoActualDurationMinutes`: number
- `mandadoWaitTimeMinutes`: number
- `mandadoCourierFee`: number
- `mandadoPlatformFee`: number
- `mandadoBaseFee`: number
- `mandadoDistanceFee`: number
- `mandadoWaitFee`: number
- `mandadoTotalFee`: number
- `mandadoCourierPayout`: number
- `mandadoPlatformRevenue`: number
- `mandadoNetMargin`: number

### Campos que NO se pueden reconstruir

Con el schema actual, NO es posible reconstruir posteriormente:
- `revenue`: ✅ Sí (grossTotal)
- `courierPayout`: ✅ Sí (driverPayout)
- `processingFee`: ✅ Sí (paymentProcessingFee)
- `platformFee`: ❌ No (siempre 0)
- `discount`: ❌ No (siempre 0)
- `refund`: 🟡 Parcial (refundStatus existe, pero NO monto)
- `netRevenue`: ❌ No (platformNetTotal es negativo)
- `grossMargin`: ❌ No (no se puede calcular sin platformFee real)

---

## 11. REVISIÓN ADMIN / FINANZAS / BASEROW

### Admin Finanzas (`lib/admin-finance.ts`)

**Función:** `getAdminFinanceSnapshot(dateKey)`

**Métricas disponibles:**
- `totals.orders`: número de órdenes
- `totals.productsSubtotal`: subtotal productos
- `totals.shippingFee`: costo envío
- `totals.platformCommission`: comisión plataforma
- `totals.platformServiceFee`: tarifa servicio
- `totals.driverPayout`: pago repartidor
- `totals.stripeFee`: fee Stripe
- `totals.grossTotal`: total bruto
- `totals.storeNetTotal`: neto tienda
- `totals.platformNetTotal`: neto plataforma
- `totals.pickupSales`: ventas pickup
- `totals.deliverySales`: ventas delivery
- `totals.stripeSales`: ventas Stripe
- `totals.cashOnDeliverySales`: ventas COD
- `totals.cancelled`: cancelados
- `totals.refunded`: reembolsados
- `totals.pendingSettlement`: pendientes liquidación

**Agrupación por:**
- Tienda (`byStore`)
- Repartidor (`byDriver`)

**Filtro:** NO filtra por `serviceKind` - incluye Mandados en totales generales.

### Baserow (`lib/baserow.ts`)

**Función:** `syncBaserowOrder(order)`

**Campos sincronizados:**
- "Número de pedido": orderNumber
- "ID de orden": _id
- "Fecha y hora": orderDate
- Cliente: customerName
- "Teléfono": phone
- "Modalidad de entrega": orderType
- "Método de pago": paymentMethod
- "Estado del pago": paymentStatus
- "Estado del pedido": orderStatus
- Subtotal: productsSubtotal
- "Costo de envío": shippingFee
- Descuento: discount
- Total: grossTotal
- "Comisión de ElMenu": platformCommission + platformServiceFee
- "Pago al restaurante": restaurantSettlement (desde snapshot)
- "Pago al repartidor": courierSettlement (desde snapshot)
- "ID de Stripe": stripeCheckoutSessionId
- Settlement snapshot metadata (si existe)

**Métricas FALTANTES en Baserow:**
- Ingresos específicos de Mandados
- Costos específicos de Mandados
- Utilidad específica de Mandados
- Margen específico de Mandados
- Ingresos por día de Mandados
- Ingresos por zona de Mandados
- Ingresos por repartidor de Mandados

**Conclusión:** Baserow NO tiene distinción entre Mandados y pedidos de restaurantes en sus reportes financieros.

---

## 12. MODELOS DE MONETIZACIÓN POSIBLES

### Modelo A: Tarifa base + costo por km

**Descripción:** Tarifa fija por zona + costo por kilómetro recorrido.

**Fórmula:**
```
precio = tarifaBaseZona + (distanciaKm * costoPorKm) + tarifaServicio
```

**Facilidad de implementación:** MEDIA
- Requiere: cálculo de distancia real (Google Maps Distance Matrix)
- Requiere: configuración de costo por km
- Requiere: modificación de `calculateMandadoQuote`

**Compatibilidad arquitectura:** MEDIA
- Usa zonas existentes
- Requiere nueva integración con Google Maps Distance Matrix
- Requiere nuevos campos en schema

**Previsibilidad cliente:** ALTA
- Cliente sabe precio exacto antes de confirmar
- Transparente

**Previsibilidad repartidor:** ALTA
- Sabe cuánto cobrará por distancia
- Fórmula clara

**Margen potencial:** MEDIO
- Puede ajustar tarifa base y costo por km
- Riesgo de distancias mal calculadas

**Riesgos:**
- Google Maps API costos
- Distancia estimada vs real
- Clientes lejos de zona pueden pagar mucho

**Escalabilidad:** ALTA
- Fácil ajustar tarifas
- Escala con distancia

### Modelo B: Tarifa fija por zona

**Descripción:** Precio fijo por zona, sin considerar distancia.

**Fórmula:**
```
precio = tarifaZona (origen o destino, el mayor)
```

**Facilidad de implementación:** ALTA
- Ya existe parcialmente
- Solo requiere ajustar tarifas por zona

**Compatibilidad arquitectura:** ALTA
- Usa zonas existentes
- NO requiere cambios mayores

**Previsibilidad cliente:** ALTA
- Precio fijo por zona
- Simple

**Previsibilidad repartidor:** MEDIA
- Puede ser injusto para distancias largas dentro de misma zona

**Margen potencial:** BAJO
- Difícil ajustar por distancia real
- Puede perder en viajes largos

**Riesgos:**
- Injusticia para repartidores en distancias largas
- Clientes cerca pagan igual que lejos

**Escalabilidad:** MEDIA
- Difícil escalar a nuevas zonas sin datos históricos

### Modelo C: Tarifa base + km + tarifa de espera

**Descripción:** Tarifa base + costo por km + tarifa por minuto de espera.

**Fórmula:**
```
precio = tarifaBase + (distanciaKm * costoPorKm) + (esperaMinutos * costoPorMinuto)
```

**Facilidad de implementación:** BAJA
- Requiere cálculo de distancia
- Requiere seguimiento de tiempo de espera
- Requiere validación de tiempos

**Compatibilidad arquitectura:** BAJA
- Requiere nuevos campos de tiempo
- Requiere lógica de seguimiento

**Previsibilidad cliente:** BAJA
- Precio puede variar por espera
- Difícil estimar antes

**Previsibilidad repartidor:** ALTA
- Compensado por tiempo
- Justo

**Margen potencial:** ALTO
- Puede cobrar por espera
- Más preciso

**Riesgos:**
- Complejidad de implementación
- Disputas sobre tiempos
- Clientes pueden sorprenderse

**Escalabilidad:** MEDIA
- Más complejo de escalar

### Modelo D: Precio dinámico según demanda

**Descripción:** Tarifa base ajustada por demanda en tiempo real.

**Fórmula:**
```
precio = tarifaBase * multiplicadorDemanda
```

**Facilidad de implementación:** MEDIA
- Requiere sistema de medición de demanda
- Requiere algoritmo de multiplicador
- `demandMultiplier` ya existe pero está fijo

**Compatibilidad arquitectura:** MEDIA
- `demandMultiplier` existe en código
- Solo requiere lógica dinámica

**Previsibilidad cliente:** BAJA
- Precio cambia según demanda
- Puede frustrar

**Previsibilidad repartidor:** MEDIA
- Puede ganar más en alta demanda
- Incentivo para trabajar

**Margen potencial:** ALTO
- Puede maximizar ingresos
- Ajuste en tiempo real

**Riesgos:**
- Clientes pueden rechazar precios altos
- Requiere monitoreo constante
- Competencia puede aprovechar

**Escalabilidad:** ALTA
- Escala automáticamente con demanda

### Modelo E: Comisión porcentual

**Descripción:** Porcentaje del valor del Mandado (si aplica) + tarifa base.

**Fórmula:**
```
precio = tarifaBase + (valorProductos * porcentaje)
```

**Facilidad de implementación:** MEDIA
- Requiere seguimiento de valor de productos
- Mandados "purchase" tienen productos, "pickup" no

**Compatibilidad arquitectura:** MEDIA
- Requiere integración con valor de productos
- No aplica para Mandados "pickup"

**Previsibilidad cliente:** MEDIA
- Depende del valor de productos
- Variable

**Previsibilidad repartidor:** BAJA
- Variable según valor
- Puede ser injusto

**Margen potencial:** ALTO
- Escala con valor
- Puede ser muy rentable

**Riesgos:**
- No aplica para Mandados "pickup"
- Clientes pueden subdividir pedidos
- Complejo de explicar

**Escalabilidad:** MEDIA
- Escala con valor de productos

### Modelo F: Modelo híbrido

**Descripción:** Combinación de tarifa base + km + comisión.

**Fórmula:**
```
precio = tarifaBase + (distanciaKm * costoPorKm) + (valorProductos * porcentaje)
```

**Facilidad de implementación:** BAJA
- Más complejo
- Requiere múltiples componentes

**Compatibilidad arquitectura:** BAJA
- Requiere muchos cambios
- Complejo

**Previsibilidad cliente:** BAJA
- Múltiples variables
- Difícil de estimar

**Previsibilidad repartidor:** MEDIA
- Más componentes de pago
- Potencialmente más justo

**Margen potencial:** MUY ALTO
- Máxima flexibilidad
- Optimización posible

**Riesgos:**
- Muy complejo
- Difícil de comunicar
- Muchas variables a ajustar

**Escalabilidad:** BAJA
- Complejo de escalar

---

## 13. MODELO RECOMENDADO

### Modelo Principal: Modelo A (Tarifa base + costo por km)

**Por qué:**
1. **Compatibilidad arquitectura:** MEDIA - reutiliza zonas existentes
2. **Facilidad de implementación:** MEDIA - solo requiere cálculo de distancia
3. **Previsibilidad:** ALTA para cliente y repartidor
4. **Margen potencial:** MEDIO - ajustable
5. **Escalabilidad:** ALTA - fácil de ajustar

**Datos necesarios:**
- Distancia real en km (Google Maps Distance Matrix)
- Tarifa base por zona (ya existe)
- Costo por km (nueva configuración)
- Tarifa de servicio (ya existe: $14)

**Componentes existentes reutilizables:**
- `lib/delivery-zones.ts` - zonas y tarifas base
- `lib/mandado.ts` - estructura de cálculo
- `lib/mandado-order.ts` - buildMandadoOrderDocument
- Schema Sanity - campos financieros genéricos
- Settlement snapshots - estructura financiera

**Tendría que implementarse:**
1. Integración con Google Maps Distance Matrix API
2. Cálculo de distancia real entre origen y destino
3. Configuración de costo por km (en Sanity o variables de entorno)
4. Modificación de `calculateMandadoQuote` para incluir costo por km
5. Nuevo campo `mandadoDistanceKm` en schema
6. Modificación de `driverPayout` para NO ser 100% del precio
7. Cálculo de `platformFee` (comisión de ElMenu)
8. Validación de distancia máxima
9. Lógica de reembolso por distancia incorrecta
10. Reportes específicos de Mandados en Baserow

**Riesgos:**
- Costos de Google Maps Distance Matrix API
- Diferencia entre distancia estimada y real
- Clientes pueden disputar distancias
- Requiere monitoreo de márgenes por distancia

**Ventajas:**
- Justo para repartidores (cobran por distancia real)
- Transparente para clientes
- Fácil de comunicar
- Escalable a nuevas zonas
- Permite ajuste fino de márgenes

### Alternativa Secundaria: Modelo B (Tarifa fija por zona)

**Por qué:**
1. **Facilidad de implementación:** ALTA - mínimo cambio
2. **Compatibilidad arquitectura:** ALTA - usa existente
3. **Previsibilidad:** ALTA - muy simple

**Solo recomendar si:**
- No se puede integrar Google Maps Distance Matrix
- Presupuesto limitado para implementación
- Zonas son pequeñas y homogéneas

**Desventajas:**
- Injusto para repartidores en distancias largas
- Difícil optimizar márgenes
- Puede perder dinero en viajes largos

---

## 14. CAMBIOS NECESARIOS PARA IMPLEMENTAR MODELO A

### Ya existe

- ✅ Sistema de zonas geográficas
- ✅ Cálculo de tarifa por zona
- ✅ Tarifa de servicio ($14)
- ✅ Schema de orden con campos financieros
- ✅ Settlement snapshots
- ✅ Integración con Stripe
- ✅ Sincronización con Baserow
- ✅ UI de selección de direcciones (Google Places)
- ✅ Flujo de pago (Stripe + efectivo)
- ✅ Asignación de repartidores
- ✅ Sistema de dispatch

### Tendría que implementarse

#### CRÍTICOS (bloqueadores)

1. **Cálculo de distancia real**
   - Integrar Google Maps Distance Matrix API
   - Calcular distancia entre origin y destination
   - Validar distancia máxima
   - Manejar errores de API
   - Fallback si Google Maps falla

2. **Configuración de costo por km**
   - Agregar campo en Sanity `deliveryPricingConfig`
   - O variable de entorno `MANDADO_COST_PER_KM`
   - Documentación de configuración

3. **Modificación de cálculo de precio**
   - Cambiar `calculateMandadoQuote` en `lib/mandado.ts`
   - Incluir costo por km en fórmula
   - Actualizar tests

4. **Cálculo de pago al repartidor**
   - Modificar `driverPayout` en `lib/mandado-order.ts`
   - NO ser 100% del precio
   - Configurar porcentaje o tarifa fija

5. **Cálculo de comisión de plataforma**
   - Agregar `platformFee` al cálculo
   - Configurar porcentaje o tarifa fija
   - Calcular `platformNetTotal` real

#### IMPORTANTES (funcionalidad)

6. **Nuevos campos en schema**
   - `mandadoDistanceKm`: number
   - `mandadoEstimatedDurationMinutes`: number
   - `mandadoCourierFee`: number
   - `mandadoPlatformFee`: number
   - `mandadoBaseFee`: number
   - `mandadoDistanceFee`: number

7. **Validación de rentabilidad**
   - Verificar que precio >= costo mínimo
   - Alertar si margen es negativo
   - Bloquear pedidos no rentables

8. **Reportes específicos Mandados**
   - Filtrar por `serviceKind == "mandado"`
   - Métricas específicas en Baserow
   - Reportes de margen por Mandado

9. **Lógica de reembolso**
   - Por distancia incorrecta
   - Por tiempo excesivo
   - Automatización parcial

#### DESEABLES (mejoras)

10. **Seguimiento de tiempo real**
    - Tiempo de espera
    - Tiempo de recorrido
    - Validación de tiempos

11. **Tarifas dinámicas**
    - Multiplicador por demanda
    - Ajuste por horario pico
    - Configuración en Sanity

12. **Promociones/descuentos**
    - Códigos promocionales
    - Descuentos por primer Mandado
    - Lógica de absorción de descuento

13. **Límites de distancia**
    - Distancia máxima por zona
    - Validación en UI
    - Alertas al cliente

14. **Costos operativos**
    - Registro de costos
    - Cálculo de margen real
    - Reportes de costos

---

## 15. RIESGO DE IMPLEMENTACIÓN

**Nivel:** MEDIO

**Factores:**
- **Complejidad técnica:** MEDIA (Google Maps Distance Matrix)
- **Cambios en schema:** MEDIO (nuevos campos)
- **Cambios en lógica:** MEDIA (modificar cálculos existentes)
- **Costos externos:** BAJO (Google Maps Distance Matrix tiene tier gratuito)
- **Riesgo de regresión:** MEDIO (modifica core de Mandados)
- **Tiempo estimado:** 2-3 semanas (desarrollo + testing + deploy)

**Mitigación:**
- Implementar en stages (dev → staging → prod)
- Tests exhaustivos de cálculos
- Monitoreo de márgenes en producción
- Rollback plan preparado

---

## 16. VEREDICTO FINAL

**¿Mandados está actualmente listo para monetizar?**

**RESPUESTA: NO**

**Por qué:**

1. **El modelo actual genera pérdidas:** Cada Mandado pagado con tarjeta genera pérdida por fees de Stripe (platformNetTotal = -stripeFee).

2. **No existe margen:** El repartidor recibe 100% del precio, ElMenu recibe 0 o menos.

3. **No se mide distancia:** El precio se basa en zonas, no en distancia real, lo que puede generar injusticias y pérdidas.

4. **Faltan componentes críticos:** No existe cálculo de pago al repartidor, comisión de plataforma, o validación de rentabilidad.

5. **La arquitectura financiera está incompleta:** Aunque existe el sistema de settlements, NO está adaptado para Mandados.

6. **No existen métricas específicas:** Baserow y admin finanzas NO distinguen Mandados de pedidos de restaurantes.

**Para estar listo, se requiere:**
- Implementar Modelo A (tarifa base + costo por km) o Modelo B (tarifa fija por zona ajustada)
- Calcular distancia real con Google Maps Distance Matrix
- Configurar pago al repartidor (< 100% del precio)
- Configurar comisión de plataforma (> 0)
- Validar rentabilidad antes de aceptar Mandados
- Implementar reportes financieros específicos de Mandados

**Estimación de tiempo:** 2-3 semanas de desarrollo para implementar Modelo A con validaciones básicas.

---

**AUDITORÍA COMPLETADA**
**Fecha:** 19 de agosto de 2026
**Auditor:** Cascade AI Assistant
**Alcance:** Inspección y análisis exclusivamente. Sin modificaciones.
