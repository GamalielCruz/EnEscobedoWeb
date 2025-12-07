# 🔧 Solución: Órdenes Click & Collect en Página /orders

## 🚨 Problema Identificado
**Las órdenes de Click & Collect no aparecen en la página `/orders` del usuario**

### Causa Raíz
La función `getMyOrders` solo consultaba documentos de tipo `"order"`, pero las órdenes de Click & Collect se guardan como tipo `"clickCollectOrder"`.

## ✅ Solución Implementada

### **1. Consulta Unificada en `getMyOrders`**
```typescript
// ANTES: Solo órdenes regulares
*[_type == "order" && clerkUserId == $userId]

// DESPUÉS: Órdenes regulares + Click & Collect
*[(_type == "order" || _type == "clickCollectOrder") && 
  (clerkUserId == $userId || customerInfo.clerkUserId == $userId)]
```

### **2. Mapeo de Datos Consistente**
```typescript
// Para órdenes Click & Collect, mapear campos:
_type == "clickCollectOrder" => {
  "orderDate": createdAt,
  "totalPrice": totalAmount,
  "currency": "mxn",
  "customerName": customerInfo.name,
  "email": customerInfo.email,
  "phone": customerInfo.phone,
  "clerkUserId": customerInfo.clerkUserId,
  "isClickCollect": true,
  "pickupCode": pickupCode,
  "storeInfo": storeInfo
}
```

### **3. UI Actualizada para Click & Collect**
- ✅ **Indicador visual**: Badge "🏪 Click & Collect"
- ✅ **Métodos de pago**: "🏪 Pago en Tienda", "💳 Tarjeta en Tienda"
- ✅ **Información de recogida**: Código, tienda, estado
- ✅ **Estados específicos**: Pendiente, Procesando, Listo para Recoger, Completado

### **4. Sección Especial de Click & Collect**
```tsx
{(order as any).isClickCollect && (
  <div className="mb-4 p-4 bg-green-50 rounded-lg">
    <h3>🏪 Información de Recogida en Tienda</h3>
    <p>Código de Recogida: {order.pickupCode}</p>
    <p>Tienda: {order.storeInfo.storeName}</p>
    <p>Dirección: {order.storeInfo.storeAddress}</p>
  </div>
)}
```

## 📊 Estados de Click & Collect

### **Estados Disponibles:**
- 🟡 **pending** → "⏳ Pendiente"
- 🔵 **processing** → "🔄 Procesando"  
- 🟢 **ready_for_pickup** → "✅ Listo para Recoger"
- ⚪ **completed** → "✅ Completado"
- 🔴 **cancelled** → "❌ Cancelado"

### **Información Mostrada:**
- ✅ **Código de recogida** (formato: ABC123)
- ✅ **Información de tienda** (nombre, dirección, teléfono)
- ✅ **Estado actual** con colores
- ✅ **Instrucciones** para el cliente
- ✅ **Productos** con indicador "🏪 Para recoger en tienda"

## 🧪 Cómo Verificar la Solución

### **Paso 1: Crear Orden de Prueba**
```bash
node test-simple-order.js
```

### **Paso 2: Verificar en Sanity**
- Ir a Sanity Studio
- Ver "Click & Collect Orders"
- Confirmar que la orden existe

### **Paso 3: Probar en la Aplicación**
1. **Iniciar sesión** con el usuario que creó la orden
2. **Ir a** `http://localhost:3000/orders`
3. **Verificar** que aparece la orden de Click & Collect
4. **Expandir** la orden para ver detalles completos

### **Paso 4: Verificar Datos**
```bash
node test-user-orders.js
```

## 📋 Estructura de Datos Unificada

### **Campos Comunes:**
```typescript
{
  _id: string,
  orderNumber: string,
  orderDate: string,
  totalPrice: number,
  currency: string,
  customerName: string,
  email: string,
  phone: string,
  clerkUserId: string,
  status: string,
  products: Array<{
    quantity: number,
    product: {
      _id: string,
      name: string,
      price: number
    }
  }>
}
```

### **Campos Específicos de Click & Collect:**
```typescript
{
  isClickCollect: true,
  pickupCode: string,
  storeInfo: {
    storeName: string,
    storeAddress: string,
    storePhone?: string
  },
  paymentMethod: "cash_on_pickup" | "card_on_pickup"
}
```

## 🎯 Flujo Completo

### **1. Usuario Crea Orden Click & Collect**
```
Checkout → API create-click-collect-order → Sanity (clickCollectOrder)
```

### **2. Usuario Ve Sus Órdenes**
```
/orders → getMyOrders → Consulta unificada → Muestra ambos tipos
```

### **3. Información Mostrada**
```
- Órdenes regulares: Información estándar
- Órdenes Click & Collect: + Código + Tienda + Estado específico
```

## 🔄 Compatibilidad

### **Órdenes Existentes:**
- ✅ **Órdenes regulares**: Siguen funcionando igual
- ✅ **Órdenes Click & Collect**: Ahora aparecen en la lista

### **Nuevas Órdenes:**
- ✅ **Ambos tipos** aparecen automáticamente
- ✅ **UI diferenciada** según el tipo
- ✅ **Información específica** para cada tipo

## 🎉 Resultado Final

### ✅ **Problema Solucionado**
- Las órdenes de Click & Collect **SÍ aparecen** en `/orders`
- Los usuarios **pueden ver** sus códigos de recogida
- La información de tienda **está disponible**

### ✅ **Funcionalidades Disponibles**
- ✅ **Vista unificada** de todas las órdenes
- ✅ **Información específica** de Click & Collect
- ✅ **Estados en tiempo real**
- ✅ **Códigos de recogida** visibles
- ✅ **Información de tienda** completa
- ✅ **Instrucciones claras** para el cliente

**Ahora los usuarios pueden ver todas sus órdenes (regulares y Click & Collect) en una sola página con información completa y específica para cada tipo.** 🚀