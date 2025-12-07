# Transferencias Bancarias SPEI

## Implementación

Se ha agregado soporte para transferencias bancarias SPEI como método de pago adicional, proporcionando más opciones de pago para los clientes mexicanos.

## Cambios Realizados

### 1. Stripe Checkout Session

**Archivo:** `actions/createCheckoutSession.ts`

```typescript
payment_method_types: ["card", "oxxo", "customer_balance"],
payment_method_options: {
  oxxo: {
    expires_after_days: 2,
  },
  customer_balance: {
    funding_type: "bank_transfer",
    bank_transfer: {
      type: "mx_bank_transfer",
      requested_address_types: ["aba"],
    },
  },
},
```

- ✅ Agregado `customer_balance` para transferencias SPEI
- ✅ Configuración específica para México (`mx_bank_transfer`)
- ✅ Solicitud de datos bancarios necesarios

### 2. Esquema de Sanity

**Archivo:** `sanity/schemaTypes/orderType.ts`

```typescript
defineField({
  name: "paymentMethod",
  title: "Payment Method",
  type: "string",
  options: {
    list: [
      { title: "Tarjeta de Crédito/Débito", value: "card" },
      { title: "OXXO", value: "oxxo" },
      { title: "Transferencia Bancaria SPEI", value: "bank_transfer" },
    ],
  },
}),
```

- ✅ Nuevo campo `paymentMethod` para identificar el método usado
- ✅ Lista predefinida de métodos de pago
- ✅ Valores consistentes con Stripe

### 3. Webhook de Stripe

**Archivo:** `app/(store)/webhook/route.ts`

```typescript
// Determine payment method from the session
let paymentMethod = "card"; // default
if (session.payment_method_types?.includes("oxxo")) {
  paymentMethod = "oxxo";
} else if (session.payment_method_types?.includes("customer_balance")) {
  paymentMethod = "bank_transfer";
}
```

- ✅ Detección automática del método de pago usado
- ✅ Almacenamiento en la orden para referencia futura
- ✅ Lógica de fallback a tarjeta por defecto

### 4. Componente de UI

**Archivo:** `components/BankTransferInfo.tsx`

- ✅ Información específica para transferencias SPEI
- ✅ Referencia de pago copiable
- ✅ Monto exacto a transferir
- ✅ Instrucciones claras para el cliente

### 5. Página de Órdenes

**Archivo:** `app/(store)/orders/page.tsx`

- ✅ Componente específico según método de pago
- ✅ Indicador visual del método usado
- ✅ Información contextual apropiada

## Métodos de Pago Disponibles

### 💳 Tarjetas de Crédito/Débito

- **Procesamiento:** Inmediato
- **Confirmación:** Instantánea
- **Ideal para:** Compras urgentes

### 🏪 OXXO

- **Procesamiento:** Hasta 24 horas
- **Vencimiento:** 2 días
- **Ideal para:** Clientes sin tarjeta bancaria

### 🏦 Transferencia Bancaria SPEI

- **Procesamiento:** Hasta 24 horas
- **Vencimiento:** 7 días
- **Ideal para:** Montos altos, clientes que prefieren transferencias

## Flujo de Transferencia Bancaria

### 1. Cliente Selecciona Transferencia

- Procede al checkout
- Selecciona "Transferencia Bancaria SPEI"
- Completa información de contacto

### 2. Stripe Genera Datos Bancarios

- Crea cuenta virtual temporal
- Genera CLABE interbancaria
- Asigna referencia única

### 3. Cliente Recibe Instrucciones

- Email con datos bancarios completos
- CLABE interbancaria
- Referencia de pago
- Monto exacto a transferir

### 4. Cliente Realiza Transferencia

- Desde su banco (app, web, sucursal)
- Usa la CLABE proporcionada
- Incluye la referencia exacta
- Transfiere el monto exacto

### 5. Confirmación Automática

- Stripe detecta la transferencia
- Webhook actualiza el estado
- Cliente recibe confirmación
- Proceso de envío inicia

## Ventajas para el Cliente

### 💰 **Económico**

- Sin comisiones adicionales por el método
- Tarifas bancarias estándar de su banco
- Ideal para montos altos

### 🔒 **Seguro**

- No requiere compartir datos de tarjeta
- Transferencia directa banco a banco
- Confirmación automática

### 🏦 **Familiar**

- Método conocido por usuarios mexicanos
- Disponible 24/7 desde apps bancarias
- Compatible con todos los bancos

### ⏰ **Flexible**

- 7 días para realizar el pago
- Puede hacerse desde cualquier banco
- Sin restricciones de horario

## Ventajas para el Negocio

### 📈 **Mayor Conversión**

- Más opciones de pago = más ventas
- Atrae clientes que prefieren transferencias
- Reduce abandono de carrito

### 💸 **Menores Comisiones**

- Comisiones más bajas que tarjetas
- Especialmente beneficioso para montos altos
- Mejor margen de ganancia

### 🔄 **Menos Contracargos**

- Transferencias son irreversibles
- Menor riesgo de disputas
- Pagos más seguros

### 📊 **Mejor Flujo de Caja**

- Pagos confirmados son definitivos
- Menor riesgo de fraude
- Proceso más predecible

## Configuración Requerida

### Variables de Entorno

```env
# Ya configuradas, no requiere cambios adicionales
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Webhook Events

Asegúrate de que tu webhook escuche:

- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

## Testing

### Modo Test

```bash
# Stripe CLI para testing local
stripe listen --forward-to localhost:3000/webhook
```

### Números de Prueba

- Usa datos de prueba de Stripe
- Simula transferencias exitosas y fallidas
- Verifica flujo completo

## Consideraciones Importantes

### ⏰ **Tiempos de Procesamiento**

- SPEI: Hasta 24 horas en días hábiles
- Fines de semana pueden tomar más tiempo
- Comunicar claramente al cliente

### 💰 **Montos Exactos**

- Cliente debe transferir el monto exacto
- Diferencias pueden causar problemas
- Incluir centavos en las instrucciones

### 📞 **Comunicación**

- Número de teléfono es crucial
- Contacto directo para resolver dudas
- Seguimiento proactivo del pago

### 🔄 **Expiración**

- 7 días para completar transferencia
- Orden se marca como expirada automáticamente
- Cliente puede crear nueva orden si necesario

## Próximas Mejoras

### 📧 **Notificaciones Mejoradas**

- Templates de email específicos
- Recordatorios antes del vencimiento
- Confirmaciones más detalladas

### 📱 **Integración SMS**

- Notificaciones por mensaje
- Recordatorios de pago
- Confirmaciones instantáneas

### 📊 **Analytics**

- Tracking de métodos de pago preferidos
- Análisis de conversión por método
- Optimización basada en datos
