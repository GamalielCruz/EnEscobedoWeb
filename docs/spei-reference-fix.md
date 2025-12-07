# Corrección: Referencia SPEI Correcta

## 🚨 Problema Identificado

**Issue:** La referencia mostrada para transferencias SPEI era el `orderNumber` interno (UUID) en lugar de la referencia real generada por Stripe.

**Impacto:** Los clientes no podían completar transferencias bancarias porque usaban una referencia incorrecta.

## ✅ Solución Implementada

### 1. **Campos Agregados al Esquema Order**
```typescript
defineField({
  name: "bankTransferReference",
  title: "Bank Transfer Reference", 
  type: "string",
  description: "SPEI reference number for bank transfers",
}),
defineField({
  name: "bankTransferClabe",
  title: "Bank Transfer CLABE",
  type: "string", 
  description: "CLABE number for SPEI transfers",
}),
```

### 2. **Webhook Mejorado para Capturar Datos SPEI**
```typescript
// Get bank transfer details if it's a SPEI payment
if (paymentMethod === "bank_transfer" && payment_intent) {
  const pi = await stripe.paymentIntents.retrieve(payment_intent, {
    expand: ['next_action.display_bank_transfer_instructions']
  });
  
  if (pi.next_action?.type === 'display_bank_transfer_instructions') {
    const instructions = pi.next_action.display_bank_transfer_instructions;
    bankTransferReference = instructions?.reference;
    
    const clabeAddress = instructions?.financial_addresses?.find(
      (addr: any) => addr.type === 'clabe'
    );
    bankTransferClabe = clabeAddress?.clabe;
  }
}
```

### 3. **Componente BankTransferInfo Actualizado**
- ✅ Muestra referencia SPEI real (no UUID interno)
- ✅ Incluye CLABE para transferencias interbancarias
- ✅ Auto-refresh cada 30 segundos si faltan datos
- ✅ Botón manual de actualización
- ✅ Fallback al orderNumber si no hay referencia SPEI

### 4. **API Route para Consultar Datos**
```typescript
// GET /api/bank-transfer/[orderId]
// Permite obtener/actualizar datos de transferencia
```

## 🔄 **Flujo Corregido**

### **Antes (Problemático):**
1. Cliente selecciona transferencia SPEI
2. Se muestra UUID como referencia ❌
3. Cliente intenta transferir con referencia incorrecta ❌
4. Transferencia falla ❌

### **Después (Solucionado):**
1. Cliente selecciona transferencia SPEI ✅
2. Stripe genera referencia SPEI real ✅
3. Webhook captura referencia y CLABE ✅
4. Se muestra referencia correcta al cliente ✅
5. Cliente transfiere con datos correctos ✅
6. Pago se procesa exitosamente ✅

## 📊 **Tipos de Referencias**

### **Referencia Interna (orderNumber)**
```
25c6db4a-2a19-4387-8867-617f2a5bdd26
```
- **Uso:** Tracking interno, emails, soporte
- **NO usar para:** Transferencias SPEI

### **Referencia SPEI (bankTransferReference)**
```
1234567890
```
- **Uso:** Campo "Referencia" en transferencia bancaria
- **Formato:** 7-10 dígitos numéricos
- **Generado por:** Stripe automáticamente

### **CLABE (bankTransferClabe)**
```
012345678901234567
```
- **Uso:** Transferencias interbancarias
- **Formato:** 18 dígitos (banco + sucursal + cuenta + dígito verificador)
- **Generado por:** Stripe automáticamente

## 🎯 **Componentes Actualizados**

### **BankTransferInfo.tsx**
- ✅ Muestra referencia SPEI correcta
- ✅ Incluye CLABE si está disponible
- ✅ Auto-refresh para datos faltantes
- ✅ Botón de actualización manual
- ✅ Estados de carga y error

### **Orders Page**
- ✅ Pasa orderId para permitir refresh
- ✅ Muestra datos actualizados automáticamente

### **Webhook Route**
- ✅ Captura datos SPEI al crear orden
- ✅ Expande PaymentIntent para obtener instrucciones
- ✅ Almacena referencia y CLABE en Sanity

## 🔧 **API Endpoints**

### **GET /api/bank-transfer/[orderId]**
```json
{
  "reference": "1234567890",
  "clabe": "012345678901234567", 
  "amount": 649.00,
  "currency": "mxn",
  "orderNumber": "25c6db4a-2a19-4387-8867-617f2a5bdd26"
}
```

**Funcionalidad:**
- Obtiene datos de transferencia de orden específica
- Actualiza datos faltantes desde Stripe
- Requiere autenticación (usuario debe ser dueño de la orden)

## 🧪 **Testing**

### **Verificar Referencia Correcta:**
1. Crear orden con transferencia SPEI
2. Verificar que webhook captura referencia
3. Confirmar que se muestra referencia correcta (no UUID)
4. Probar auto-refresh si faltan datos
5. Verificar que transferencia funciona con referencia real

### **Casos de Prueba:**
```bash
# 1. Orden nueva con SPEI
curl -X POST /api/checkout \
  -d '{"paymentMethod": "bank_transfer"}'

# 2. Consultar datos de transferencia  
curl -X GET /api/bank-transfer/ORDER_ID \
  -H "Authorization: Bearer TOKEN"

# 3. Verificar en Stripe Dashboard
# - PaymentIntent tiene next_action.display_bank_transfer_instructions
# - Reference y CLABE están presentes
```

## 📋 **Checklist de Verificación**

### ✅ **Datos Correctos Mostrados:**
- [ ] Referencia SPEI (7-10 dígitos) en lugar de UUID
- [ ] CLABE (18 dígitos) si está disponible
- [ ] Monto exacto en pesos mexicanos
- [ ] Fecha de vencimiento (7 días)

### ✅ **Funcionalidad:**
- [ ] Auto-refresh cada 30 segundos si faltan datos
- [ ] Botón de actualización manual funciona
- [ ] Copiar al portapapeles funciona
- [ ] Estados de carga se muestran correctamente

### ✅ **Integración:**
- [ ] Webhook captura datos SPEI correctamente
- [ ] API endpoint responde con datos correctos
- [ ] Sanity almacena referencia y CLABE
- [ ] Tipos TypeScript actualizados

## 🚀 **Beneficios de la Corrección**

### **Para Clientes:**
- ✅ **Transferencias exitosas** con referencia correcta
- ✅ **Datos completos** (referencia + CLABE)
- ✅ **Actualización automática** de información
- ✅ **Experiencia fluida** sin errores

### **Para el Negocio:**
- ✅ **Mayor conversión** en transferencias SPEI
- ✅ **Menos soporte** por referencias incorrectas
- ✅ **Tracking preciso** de pagos
- ✅ **Confianza del cliente** mejorada

## 📞 **Soporte**

### **Si los datos no aparecen:**
1. Verificar que el webhook se ejecutó correctamente
2. Revisar logs de Stripe para PaymentIntent
3. Usar botón "Actualizar" en la interfaz
4. Consultar API endpoint directamente
5. Verificar que SPEI esté habilitado en Stripe

### **Información para Debug:**
- Order ID en Sanity
- PaymentIntent ID en Stripe  
- Timestamp de creación de orden
- Logs del webhook