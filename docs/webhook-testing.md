# Testing del Webhook Corregido

## 🧪 Verificación de Correcciones

### **Errores Corregidos:**
1. ✅ `bankTransferReference` - Manejo correcto de `null` values
2. ✅ `addr` - Tipado correcto con tipos personalizados
3. ✅ `clabe` - Acceso seguro a propiedades

### **Tipos Agregados:**
```typescript
// types/stripe-extended.ts
export interface BankTransferInstructions {
  reference?: string | null;
  financial_addresses?: FinancialAddress[];
}

export interface FinancialAddress {
  type: string;
  clabe?: string;
  // ... otros campos
}
```

## 🔧 **Testing Manual**

### **1. Crear Orden con Transferencia SPEI**
```bash
# 1. Ir a la aplicación
npm run dev

# 2. Agregar productos al carrito
# 3. Seleccionar "Transferencia Bancaria SPEI"
# 4. Completar checkout
```

### **2. Verificar Webhook Logs**
```bash
# Terminal 1: Stripe CLI
stripe listen --forward-to localhost:3000/webhook

# Terminal 2: Aplicación
npm run dev

# Buscar en logs:
# - "Bank transfer details extracted"
# - "Order created in sanity"
# - Sin errores de TypeScript
```

### **3. Verificar en Stripe Dashboard**
1. **Payment Intents:** Verificar que tiene `next_action.display_bank_transfer_instructions`
2. **Checkout Sessions:** Confirmar que se completó correctamente
3. **Webhooks:** Revisar que no hay errores 4xx/5xx

### **4. Verificar en Sanity**
```groq
*[_type == "order" && paymentMethod == "bank_transfer"] {
  _id,
  orderNumber,
  bankTransferReference,
  bankTransferClabe,
  status,
  paymentMethod
}
```

## 📊 **Casos de Prueba**

### **Caso 1: Transferencia SPEI Exitosa**
```json
// Esperado en Sanity
{
  "paymentMethod": "bank_transfer",
  "bankTransferReference": "1234567890",
  "bankTransferClabe": "012345678901234567",
  "status": "pending"
}
```

### **Caso 2: Datos SPEI Faltantes**
```json
// Esperado en Sanity (fallback)
{
  "paymentMethod": "bank_transfer",
  "bankTransferReference": null,
  "bankTransferClabe": null,
  "status": "pending"
}
```

### **Caso 3: Error en Stripe API**
```bash
# Log esperado
"Could not retrieve bank transfer details: [error]"
# Orden se crea sin datos bancarios
```

## 🔍 **Debugging**

### **Logs Importantes:**
```typescript
// En webhook
console.log("Payment method detected:", paymentMethod);
console.log("Bank transfer details extracted:", {
  reference: bankTransferReference,
  clabe: bankTransferClabe ? `${bankTransferClabe.slice(0, 6)}...` : undefined
});
```

### **Verificar Tipos:**
```bash
# Compilar TypeScript
npx tsc --noEmit

# Debería pasar sin errores
```

### **API Endpoint Test:**
```bash
# Obtener datos de transferencia
curl -X GET "http://localhost:3000/api/bank-transfer/ORDER_ID" \
  -H "Authorization: Bearer CLERK_TOKEN"
```

## ✅ **Checklist de Verificación**

### **Compilación:**
- [ ] `npx tsc --noEmit` pasa sin errores
- [ ] `npm run build` completa exitosamente
- [ ] No hay warnings de TypeScript

### **Funcionalidad:**
- [ ] Webhook procesa eventos sin errores
- [ ] Órdenes se crean con datos correctos
- [ ] Referencia SPEI se captura (cuando está disponible)
- [ ] CLABE se extrae correctamente
- [ ] Fallback funciona cuando faltan datos

### **UI:**
- [ ] Componente BankTransferInfo muestra datos correctos
- [ ] Auto-refresh funciona
- [ ] Botón de actualización manual funciona
- [ ] Estados de carga se muestran

### **Integración:**
- [ ] Stripe CLI no muestra errores
- [ ] Dashboard de Stripe muestra eventos procesados
- [ ] Sanity almacena datos correctamente
- [ ] API endpoint responde correctamente

## 🚨 **Errores Comunes**

### **Error: "Cannot read property 'clabe' of undefined"**
```typescript
// ❌ Antes
clabeAddress.clabe

// ✅ Después  
clabeAddress?.clabe
```

### **Error: "Type 'null' is not assignable to 'string | undefined'"**
```typescript
// ❌ Antes
bankTransferReference = instructions?.reference;

// ✅ Después
bankTransferReference = instructions?.reference || undefined;
```

### **Error: "'addr' is of type 'unknown'"**
```typescript
// ❌ Antes
(addr: unknown) => addr.type === "clabe"

// ✅ Después
(addr) => addr && typeof addr === 'object' && addr.type === "clabe"
```

## 🔄 **Próximos Pasos**

### **Si todo funciona:**
1. Deploy a producción
2. Configurar webhook en Stripe producción
3. Monitorear logs por 24-48 horas
4. Documentar cualquier edge case

### **Si hay errores:**
1. Revisar logs específicos
2. Verificar configuración de Stripe
3. Confirmar que SPEI está habilitado
4. Contactar soporte si es necesario