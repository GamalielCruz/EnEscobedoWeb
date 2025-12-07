# Solución de Problemas: Transferencias Bancarias SPEI

## 🚨 Error Común: "customer_balance requires customer to be set"

### **Problema**
```json
{
  "error": {
    "message": "The payment method `customer_balance` requires `customer` to be set.",
    "type": "invalid_request_error"
  }
}
```

### **Causa**
El método de pago `customer_balance` (transferencias SPEI) requiere que siempre exista un customer en Stripe, no puede funcionar con sesiones anónimas.

### **Solución Implementada** ✅

#### 1. **Creación Garantizada de Customer**
```typescript
// Antes (problemático)
let customerId: string | undefined;
if (customers.data.length > 0) {
  customerId = customers.data[0].id;
}

// Después (solucionado)
let customerId: string;
if (customers.data.length > 0) {
  customerId = customers.data[0].id;
} else {
  const newCustomer = await stripe.customers.create({
    email: metadata.customerEmail,
    name: metadata.customerName,
    metadata: { clerkUserId: metadata.clerkUserId },
  });
  customerId = newCustomer.id;
}
```

#### 2. **Configuración Simplificada**
```typescript
// Antes (problemático)
customer_balance: {
  funding_type: "bank_transfer",
  bank_transfer: {
    type: "mx_bank_transfer",
    requested_address_types: ["aba"], // No necesario para México
  },
}

// Después (solucionado)
customer_balance: {
  funding_type: "bank_transfer",
  bank_transfer: {
    type: "mx_bank_transfer",
  },
}
```

#### 3. **Detección Mejorada de Método de Pago**
```typescript
// Detecta el método realmente usado, no solo los disponibles
if (payment_intent) {
  const pi = await stripe.paymentIntents.retrieve(payment_intent);
  if (pi.payment_method) {
    const pm = await stripe.paymentMethods.retrieve(pi.payment_method);
    paymentMethod = pm.type === "customer_balance" ? "bank_transfer" : pm.type;
  }
}
```

## 🔧 **Configuración Requerida**

### **Variables de Entorno**
```env
STRIPE_SECRET_KEY=sk_test_... # o sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### **Webhook Events Necesarios**
- `checkout.session.completed`
- `checkout.session.expired`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

### **Configuración en Stripe Dashboard**

#### 1. **Habilitar SPEI en México**
- Dashboard → Settings → Payment methods
- Buscar "Bank transfers" 
- Habilitar "SPEI" para México
- Configurar límites si es necesario

#### 2. **Webhook Configuration**
- Dashboard → Developers → Webhooks
- Agregar endpoint: `https://tu-dominio.com/webhook`
- Seleccionar eventos listados arriba
- Copiar signing secret

## 🧪 **Testing**

### **Modo Test**
```bash
# Usar Stripe CLI para testing local
stripe listen --forward-to localhost:3000/webhook

# En otra terminal
npm run dev
```

### **Datos de Prueba**
- **Email:** cualquier email válido
- **Teléfono:** +52 55 1234 5678
- **Monto:** cualquier cantidad > $10 MXN

### **Flujo de Testing**
1. Agregar productos al carrito
2. Proceder al checkout
3. Seleccionar "Transferencia Bancaria"
4. Completar información
5. Verificar que se crea la sesión sin errores
6. Simular webhook events con Stripe CLI

## 🔍 **Debugging**

### **Logs Importantes**
```typescript
// En createCheckoutSession.ts
console.log("Customer ID:", customerId);
console.log("Payment method types:", session.payment_method_types);

// En webhook/route.ts
console.log("Payment method detected:", paymentMethod);
console.log("Session status:", session.payment_status);
```

### **Verificar en Stripe Dashboard**
1. **Customers:** Verificar que se crean correctamente
2. **Checkout Sessions:** Ver configuración y estado
3. **Payment Intents:** Verificar método de pago usado
4. **Webhooks:** Revisar logs de eventos

### **Errores Comunes y Soluciones**

#### Error: "Invalid currency for payment method"
```typescript
// Asegurar que currency sea "mxn"
currency: "mxn", // ✅ Correcto
currency: "MXN", // ❌ Incorrecto (mayúsculas)
```

#### Error: "Payment method not available in country"
- Verificar que SPEI esté habilitado en Stripe Dashboard
- Confirmar que `allowed_countries: ["MX"]` esté configurado

#### Error: "Customer creation failed"
```typescript
// Verificar que todos los campos requeridos estén presentes
const newCustomer = await stripe.customers.create({
  email: metadata.customerEmail, // ✅ Requerido
  name: metadata.customerName,   // ✅ Recomendado
  metadata: {
    clerkUserId: metadata.clerkUserId, // ✅ Para tracking
  },
});
```

## 📊 **Monitoreo**

### **Métricas Importantes**
- Tasa de éxito de creación de sesiones
- Tiempo de procesamiento de transferencias
- Errores de webhook
- Conversión por método de pago

### **Alertas Recomendadas**
- Errores de customer creation > 5%
- Webhooks fallidos > 10%
- Sesiones expiradas > 20%
- Transferencias no procesadas > 24h

## 🚀 **Próximos Pasos**

### **Mejoras Inmediatas**
1. ✅ Customer creation garantizada
2. ✅ Configuración simplificada
3. ✅ Detección mejorada de método de pago
4. ✅ Mejor manejo de errores

### **Mejoras Futuras**
- [ ] Retry logic para customer creation
- [ ] Cache de customers por email
- [ ] Notificaciones proactivas de estado
- [ ] Analytics de métodos de pago

### **Optimizaciones**
- [ ] Batch processing de webhooks
- [ ] Rate limiting para API calls
- [ ] Fallback methods para errores
- [ ] Performance monitoring

## 📞 **Soporte**

### **Si el problema persiste:**
1. Verificar logs de Stripe Dashboard
2. Revisar configuración de webhook
3. Confirmar que SPEI esté habilitado
4. Contactar soporte de Stripe si es necesario

### **Información para Soporte:**
- Account ID de Stripe
- Session ID problemática
- Timestamp del error
- Logs completos del webhook