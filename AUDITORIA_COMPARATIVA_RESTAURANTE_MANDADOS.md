# AUDITORÍA COMPARATIVA DE MONETIZACIÓN

## Restaurante vs MANDADOS — ElMenu

**Fecha:** 19 de agosto de 2026  
**Alcance:** Exclusivamente investigación. Sin modificaciones.  
**Objetivo:** Reconstruir el modelo económico actual de restaurantes y compararlo con Mandados.

---

## 1. HALLAZGO PRINCIPAL

El modelo económico de **RESTAURANTES** funciona así:

1. **El cliente paga:** precio de productos + tarifa de envío + tarifa de servicio de ElMenu ($5 MXN)
2. **ElMenu gana:** comisión porcentual sobre productos (0% o 10%) + tarifa de servicio ($5 MXN) - fee de Stripe
3. **El repartidor recibe:** tarifa base de envío (100% por defecto)
4. **El restaurante recibe:** total del cliente - tarifa de servicio - comisión - fee de Stripe - pago al repartidor

**NO existe markup porcentual sobre el precio total.** La única tarifa adicional es la tarifa de servicio fija de $5 MXN.

---

## 2. FÓRMULA REAL DE RESTAURANTE

### Cálculo de precio al cliente

**Archivo:** `lib/order-pricing.ts` → `computeFinancials()` (líneas 332-403)

**Fórmula:**
```typescript
grossTotal = productsSubtotal + shippingFee + platformServiceFee - discount + tax
```

**Donde:**
- `productsSubtotal` = suma de (precio producto × cantidad)
- `shippingFee` = tarifa de envío (calculada por zonas)
- `platformServiceFee` = $5 MXN (hardcodeado en `lib/platform-service-fee.ts`)
- `discount` = 0 (no implementado actualmente)
- `tax` = 0 (no implementado actualmente)

**Origen de platformServiceFee:**
- Archivo: `lib/platform-service-fee.ts` línea 1
- Variable: `PLATFORM_SERVICE_FEE_MXN = 5`
- Valor: $5 MXN fijo

### Cálculo de comisión de ElMenu

**Archivo:** `lib/commercial-rules.ts` → `calculateCappedCommission()` (líneas 189-213)

**Fórmula:**
```typescript
rawCommission = productsSubtotal * (commissionPercent / 100)
chargedCommission = min(rawCommission, remainingBeforeOrder)
```

**Donde:**
- `commissionPercent` = 0% (Plan Community) o 10% (Plan Premium)
- `monthlyCommissionCap` = tope mensual (0 por defecto)
- `remainingBeforeOrder` = tope mensual - comisión acumulada

**Origen de commissionPercent:**
- Archivo: `lib/commercial-rules.ts` líneas 54-84
- Plan Community: `commissionPercent: 0`
- Plan Premium: `commissionPercent: 10`
- Configurable por restaurante en Sanity (`commercialPlanId`)

### Cálculo de pago al repartidor

**Archivo:** `lib/order-pricing.ts` → `computeFinancials()` línea 372

**Fórmula:**
```typescript
driverPayout = deliveryBaseFee * deliveryDriverRate
```

**Donde:**
- `deliveryBaseFee` = tarifa de envío calculada por zonas
- `deliveryDriverRate` = variable de entorno:
  - `STORE_DRIVER_PAYOUT_RATE` (repartidor de tienda)
  - `COMMUNITY_DRIVER_PAYOUT_RATE` (repartidor comunitario)
  - Default: `DEFAULT_DELIVERY_DRIVER_PAYOUT_RATE = 1` (línea 42)

**Origen de deliveryBaseFee:**
- Archivo: `lib/order-pricing.ts` → `computeShippingFee()` (líneas 571-584)
- Calculado por: `lib/delivery-zones.ts` → `calculateDeliveryQuote()`
- Basado en: zonas geográficas, horarios, demanda

### Cálculo de pago al restaurante

**Archivo:** `lib/order-pricing.ts` → `computeFinancials()` líneas 373-375

**Fórmula:**
```typescript
storeNetTotal = grossTotal - platformServiceFee - platformCommission - stripeFee - driverPayout + platformDeliverySubsidy
```

**Donde:**
- `platformDeliverySubsidy` = descuento de envío si ElMenu lo absorbe

### Cálculo de ingreso de ElMenu

**Archivo:** `lib/order-pricing.ts` → `computeFinancials()` línea 376

**Fórmula:**
```typescript
platformNetTotal = platformCommission + platformServiceFee - stripeFee - platformDeliverySubsidy
```

---

## 3. ¿DÓNDE SE APLICA EL PORCENTAJE?

**Archivo:** `lib/commercial-rules.ts` → `calculateCappedCommission()` (líneas 189-213)

**Función:** `calculateCappedCommission()`

**Variable:** `commissionPercent`

**Valor actual:**
- Plan Community: 0%
- Plan Premium: 10%

**Origen del valor:**
- Configuración global en `DEFAULT_COMMERCIAL_SETTINGS` (líneas 48-85)
- Configurable por restaurante en Sanity (`commercialPlanId`)
- Puede tener overrides individuales por restaurante (`commercialOverrides`)

**Momento en que se aplica:**
- Durante la cotización de la orden (`validateAndQuoteOrder`)
- Antes de crear la orden

**Sobre qué cantidad se aplica:**
- **ÚNICAMENTE sobre `productsSubtotal`** (precio de productos)
- NO sobre shippingFee
- NO sobre platformServiceFee
- NO sobre el total

**Fórmula exacta:**
```typescript
rawCommission = productsSubtotal * (commissionPercent / 100)
```

**NO existe:** markup porcentual sobre el precio total del cliente.

---

## 4. FLUJO FINANCIERO RESTAURANTE

```
Cliente
  ↓
Selecciona productos (subtotal: $300)
  ↓
Selecciona dirección (deliveryBaseFee: $30)
  ↓
Cotización:
  - productsSubtotal: $300
  - shippingFee: $30
  - platformServiceFee: $5
  - grossTotal: $335
  ↓
Paga con Stripe:
  - Cliente paga: $335
  - Stripe fee (3.6% + $3): $15.06
  - Neto Stripe: $319.94
  ↓
Liquidación:
  - platformCommission (10% de $300): $30
  - driverPayout ($30 × 1.0): $30
  - platformDeliverySubsidy: $0
  ↓
Distribución:
  - Restaurante: $319.94 - $5 - $30 - $15.06 - $30 = $239.88
  - Repartidor: $30
  - ElMenu: $30 + $5 - $15.06 = $19.94
```

**Resumen:**
- Cliente paga: $335
- Restaurante recibe: $239.88 (71.6% del total)
- Repartidor recibe: $30 (9.0% del total)
- ElMenu recibe: $19.94 (5.9% del total)
- Stripe recibe: $15.06 (4.5% del total)

---

## 5. FLUJO FINANCIERO MANDADO

```
Cliente
  ↓
Selecciona origen (zona Centro: $30)
  ↓
Selecciona destino (zona Centro: $30)
  ↓
Cotización:
  - max(origin, destination): $30
  - MANDADO_SERVICE_FEE: $14
  - draft.price: $44
  ↓
Paga con Stripe:
  - Cliente paga: $44
  - Stripe fee (3.6% + $3): $4.58
  - Neto Stripe: $39.42
  ↓
Liquidación:
  - driverPayout: $44 (100% del precio)
  - platformNetTotal: -$4.58 (pérdida)
  ↓
Distribución:
  - Repartidor: $44 (100% del total)
  - ElMenu: -$4.58 (pérdida por fee de Stripe)
```

**Resumen:**
- Cliente paga: $44
- Repartidor recibe: $44 (100% del total)
- ElMenu recibe: -$4.58 (pérdida)
- Stripe recibe: $4.58

---

## 6. COMPARACIÓN RESTAURANTE VS MANDADO

| Componente | Restaurante | Mandado | Diferencia |
|-----------|-------------|---------|------------|
| **Pricing** | Zonas + service fee | Zonas + service fee | Similar |
| **Service fee** | $5 MXN fijo | $14 MXN fijo | Mandado tiene tarifa mayor |
| **Comisión %** | 0% o 10% sobre productos | 0% | Restaurante tiene comisión |
| **Base de comisión** | productsSubtotal | N/A | Solo restaurantes |
| **Driver payout** | deliveryBaseFee × rate | 100% del precio | Restaurante usa tarifa base |
| **Driver rate** | Configurable (env var) | 1.0 (hardcodeado) | Restaurante más flexible |
| **Platform revenue** | commission + service fee - Stripe | service fee - Stripe | Restaurante tiene comisión |
| **Restaurant revenue** | grossTotal - fees - driver | N/A | Solo restaurantes |
| **Stripe fee** | 3.6% + $3 MXN | 3.6% + $3 MXN | Igual |
| **Settlement snapshot** | ✅ Sí | ✅ Sí | Ambos usan |
| **Baserow sync** | ✅ Sí | ✅ Sí | Ambos usan |
| **Admin Finanzas** | ✅ Sí | ✅ Sí (mezclado) | Ambos usan |

---

## 7. ¿QUIÉN GANA QUÉ?

### Para una orden de RESTAURANTE (Plan Premium, pago con tarjeta)

| Parte | Gana | Cantidad | Quién paga |
|-------|------|----------|------------|
| Cliente | - | -$335 | Cliente |
| Restaurante | ✅ | +$239.88 | Cliente |
| Repartidor | ✅ | +$30 | Cliente |
| ElMenu | ✅ | +$19.94 | Cliente |
| Stripe | ✅ | +$15.06 | Cliente |

**Total:** $335 = $239.88 + $30 + $19.94 + $15.06 ✅

### Para una orden de RESTAURANTE (Plan Community, pago con tarjeta)

| Parte | Gana | Cantidad | Quién paga |
|-------|------|----------|------------|
| Cliente | - | -$335 | Cliente |
| Restaurante | ✅ | +$269.88 | Cliente |
| Repartidor | ✅ | +$30 | Cliente |
| ElMenu | ✅ | -$10.06 (pérdida) | Cliente |
| Stripe | ✅ | +$15.06 | Cliente |

**Total:** $335 = $269.88 + $30 + (-$10.06) + $15.06 ✅

**Nota:** Plan Community genera pérdida para ElMenu (solo gana $5 de service fee pero paga $15.06 de Stripe).

### Para un MANDADO (pago con tarjeta)

| Parte | Gana | Cantidad | Quién paga |
|-------|------|----------|------------|
| Cliente | - | -$44 | Cliente |
| Repartidor | ✅ | +$44 | Cliente |
| ElMenu | ❌ | -$4.58 (pérdida) | Cliente |
| Stripe | ✅ | +$4.58 | Cliente |

**Total:** $44 = $44 + (-$4.58) + $4.58 ✅

### Para un MANDADO (pago en efectivo)

| Parte | Gana | Cantidad | Quién paga |
|-------|------|----------|------------|
| Cliente | - | -$44 | Cliente |
| Repartidor | ✅ | +$44 | Cliente |
| ElMenu | ❌ | $0 | Cliente |
| Stripe | ❌ | $0 | Cliente |

**Total:** $44 = $44 + $0 + $0 ✅

---

## 8. INFRAESTRUCTURA REUTILIZABLE

| Componente | Restaurante | Mandado | Reutilizable | Notas |
|-----------|-------------|---------|--------------|-------|
| **Pricing (zonas)** | ✅ Sí | ✅ Sí | ✅ SÍ | Ambos usan `calculateDeliveryQuote` |
| **Service fee** | ✅ Sí ($5) | ✅ Sí ($14) | ✅ SÍ | Ambos tienen tarifa fija |
| **Comisión %** | ✅ Sí (0-10%) | ❌ No (0%) | ✅ SÍ | Mandado podría usar misma lógica |
| **Base de comisión** | productsSubtotal | N/A | ⚠️ PARCIAL | Mandado no tiene productos |
| **Driver payout** | deliveryBaseFee × rate | 100% precio | ✅ SÍ | Mandado podría usar tarifa base |
| **Driver rate** | Configurable (env var) | 1.0 (hardcodeado) | ✅ SÍ | Mandado podría usar env var |
| **Platform revenue** | commission + service fee | service fee | ✅ SÍ | Mandado podría agregar comisión |
| **Stripe fee** | ✅ Sí | ✅ Sí | ✅ SÍ | Ambos usan mismo cálculo |
| **Settlement snapshot** | ✅ Sí | ✅ Sí | ✅ SÍ | Ambos usan misma estructura |
| **Baserow sync** | ✅ Sí | ✅ Sí | ✅ SÍ | Ambos usan misma lógica |
| **Admin Finanzas** | ✅ Sí | ✅ Sí (mezclado) | ⚠️ PARCIAL | Mandado mezclado con restaurantes |
| **Commercial settings** | ✅ Sí | ❌ No | ✅ SÍ | Mandado podría usar planes |
| **Commission cap** | ✅ Sí | ❌ No | ✅ SÍ | Mandado podría usar tope |

---

## 9. DIFERENCIAS CRÍTICAS

### 1. Comisión porcentual

**Restaurante:**
- Tiene comisión de 0% (Community) o 10% (Premium)
- Se aplica sobre `productsSubtotal`
- Genera ingreso para ElMenu

**Mandado:**
- NO tiene comisión porcentual
- NO tiene productos (es un servicio de delivery)
- NO genera ingreso por comisión

### 2. Pago al repartidor

**Restaurante:**
- `driverPayout = deliveryBaseFee × deliveryDriverRate`
- Basado en tarifa de envío calculada por zonas
- Configurable por variable de entorno
- Repartidor recibe parte de la tarifa de envío

**Mandado:**
- `driverPayout = draft.price` (100% del precio)
- Repartidor recibe el precio total que paga el cliente
- NO configurable (hardcodeado)
- Repartidor recibe todo (tarifa de envío + service fee)

### 3. Ingreso de ElMenu

**Restaurante (Premium):**
- `platformNetTotal = commission + service fee - stripe fee`
- Ingreso positivo: $30 (comisión) + $5 (service fee) - $15.06 (Stripe) = $19.94

**Restaurante (Community):**
- `platformNetTotal = 0 + $5 - stripe fee`
- Ingreso negativo: $5 - $15.06 = -$10.06 (pérdida)

**Mandado:**
- `platformNetTotal = 0 + $14 - stripe fee` (teórico)
- Ingreso negativo: $14 - $4.58 = +$9.42 (pero driverPayout = 100%)
- Real: `platformNetTotal = -stripe fee` (pérdida)

### 4. Service fee

**Restaurante:**
- $5 MXN fijo
- Se agrega al total del cliente
- ElMenu la retiene como ingreso

**Mandado:**
- $14 MXN fijo
- Se agrega al total del cliente
- Pero repartidor recibe 100% (incluyendo esta tarifa)
- ElMenu NO la retiene

### 5. Base de cálculo

**Restaurante:**
- Comisión calculada sobre `productsSubtotal`
- Pago al repartidor calculado sobre `deliveryBaseFee`
- Dos componentes separados

**Mandado:**
- Todo basado en precio total
- NO separación entre componentes
- Repartidor recibe todo

---

## 10. HALLAZGO SOBRE EL PORCENTAJE

**¿El porcentaje que incrementa el precio de los restaurantes puede ser utilizado, adaptado o reutilizado para Mandados?**

**RESPUESTA: PARCIALMENTE**

**Por qué SÍ es reutilizable:**
1. La infraestructura de planes comerciales existe (`CommercialPlan`, `CommercialSettings`)
2. La lógica de cálculo de comisión existe (`calculateCappedCommission`)
3. La configuración por restaurante existe en Sanity
4. El sistema de settlement snapshots soporta comisiones

**Por qué NO es directamente aplicable:**
1. La comisión de restaurantes se calcula sobre `productsSubtotal`
2. Mandados NO tienen productos (es un servicio de delivery)
3. Mandados necesitaría una base diferente (ej: tarifa base de envío, distancia, tiempo)

**Adaptación posible:**
- Crear un nuevo campo de comisión específico para Mandados
- Calcular comisión sobre `deliveryBaseFee` o sobre el precio total
- Reutilizar la misma infraestructura de planes comerciales
- Configurar planes específicos para Mandados (ej: "Mandado Basic", "Mandado Premium")

**Conclusión:** La infraestructura SÍ es reutilizable, pero la lógica de cálculo necesita adaptación porque Mandados no tienen productos.

---

## 11. CONCLUSIÓN

### ¿Mandados necesita un modelo de monetización completamente nuevo?

**RESPUESTA: NO NECESARIAMENTE**

**Por qué:**
1. La infraestructura financiera (settlements, Baserow, admin finanzas) ya existe
2. La lógica de cálculo de comisiones existe y es reutilizable
3. El sistema de planes comerciales existe y es configurable
4. El cálculo de tarifas por zonas ya existe

**Lo que SÍ necesita:**
1. **Adaptar la base de cálculo:** Cambiar de `productsSubtotal` a `deliveryBaseFee` o precio total
2. **Configurar driverPayout:** NO ser 100% del precio, usar tarifa base como restaurantes
3. **Agregar comisión específica:** Configurar porcentaje para Mandados
4. **Separar componentes:** Distinguir entre tarifa de envío, service fee, y comisión
5. **Crear planes específicos:** Planes comerciales para Mandados (no reutilizar planes de restaurantes)

### ¿Podemos adaptar el modelo económico que ElMenu ya utiliza con Restaurantes?

**RESPUESTA: SÍ, CON ADAPTACIONES**

**Adaptaciones necesarias:**

**1. Cambiar base de cálculo de comisión:**
```
Restaurante: commission = productsSubtotal × commissionPercent
Mandado: commission = deliveryBaseFee × commissionPercent (o precio total × commissionPercent)
```

**2. Cambiar cálculo de driverPayout:**
```
Restaurante: driverPayout = deliveryBaseFee × deliveryDriverRate
Mandado: driverPayout = deliveryBaseFee × deliveryDriverRate (en lugar de 100% del precio)
```

**3. Agregar comisión específica para Mandados:**
```
Crear: mandadoCommissionPercent en CommercialPlan
Usar: misma lógica de calculateCappedCommission
```

**4. Separar service fee del pago al repartidor:**
```
Actual: repartidor recibe service fee ($14)
Propuesto: repartidor recibe solo deliveryBaseFee, ElMenu retiene service fee + comisión
```

**5. Crear planes específicos:**
```
Plan Mandado Basic: 0% comisión, service fee $14
Plan Mandado Premium: 10% comisión sobre deliveryBaseFee, service fee $5
```

**Modelo adaptado propuesto:**
```
Cliente paga: deliveryBaseFee + serviceFee + (deliveryBaseFee × commissionPercent)
Repartidor recibe: deliveryBaseFee × deliveryDriverRate
ElMenu recibe: serviceFee + (deliveryBaseFee × commissionPercent) - stripeFee
```

**Ejemplo numérico:**
```
deliveryBaseFee: $30
serviceFee: $5
commissionPercent: 10%
driverPayoutRate: 0.8 (80%)

Cliente paga: $30 + $5 + ($30 × 0.10) = $38
Repartidor recibe: $30 × 0.8 = $24
ElMenu recibe: $5 + $3 - stripe fee = $8 - $4.38 = $3.62
```

**Ventajas de adaptar el modelo existente:**
- Reutiliza infraestructura probada
- Menor riesgo de implementación
- Configurable por restaurante/zona
- Escalable con planes comerciales
- Compatible con settlement snapshots y Baserow

**Conclusión final:** Mandados NO necesita un modelo completamente nuevo. Puede adaptar el modelo económico de restaurantes con cambios específicos en la base de cálculo y la lógica de driverPayout.

---

**AUDITORÍA COMPLETADA**
**Fecha:** 19 de agosto de 2026
**Auditor:** Cascade AI Assistant
**Alcance:** Exclusivamente investigación. Sin modificaciones.
