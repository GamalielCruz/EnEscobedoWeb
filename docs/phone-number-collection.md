# Recolección de Números de Teléfono

## Implementación

Se ha agregado la recolección obligatoria de números de teléfono en el proceso de checkout para mejorar la experiencia de entrega y comunicación con los clientes.

## Cambios Realizados

### 1. Stripe Checkout Session
**Archivo:** `actions/createCheckoutSession.ts`

```typescript
phone_number_collection: {
  enabled: true,
},
```

- ✅ Stripe ahora solicita el número de teléfono durante el checkout
- ✅ Campo obligatorio para completar la compra
- ✅ Validación automática del formato de teléfono por Stripe

### 2. Esquema de Sanity
**Archivo:** `sanity/schemaTypes/orderType.ts`

```typescript
defineField({
  name: "phone",
  title: "Customer Phone",
  type: "string",
  description: "Customer phone number for delivery and order updates",
}),
```

- ✅ Nuevo campo `phone` en el tipo Order
- ✅ Campo opcional (algunos pagos antiguos no tendrán teléfono)
- ✅ Descripción clara del propósito

### 3. Webhook de Stripe
**Archivo:** `app/(store)/webhook/route.ts`

```typescript
phone: customer_details?.phone || undefined,
```

- ✅ Captura el teléfono de `customer_details.phone`
- ✅ Manejo seguro con fallback a `undefined`
- ✅ Almacenamiento en Sanity

### 4. Interfaz de Usuario
**Archivo:** `app/(store)/orders/page.tsx`

- ✅ Muestra el teléfono en la página de órdenes
- ✅ Solo se muestra si existe
- ✅ Estilo consistente con el resto de la información

## Beneficios

### Para el Cliente:
- 📞 **Comunicación directa** para actualizaciones de entrega
- 🚚 **Coordinación de envío** más eficiente
- ⚠️ **Notificaciones urgentes** sobre el pedido
- 📱 **Confirmación por SMS** (futuro)

### Para el Negocio:
- 📈 **Mejor tasa de entrega** exitosa
- 🤝 **Comunicación proactiva** con clientes
- 📊 **Datos de contacto completos** para marketing
- 🔄 **Reducción de devoluciones** por entregas fallidas

## Casos de Uso

### Pagos OXXO
- **Especialmente importante** para pagos OXXO
- Permite contactar al cliente si hay problemas con el pago
- Coordinación de entrega una vez confirmado el pago

### Envíos
- Notificación cuando el paquete está en camino
- Coordinación para entregas que requieren presencia
- Resolución rápida de problemas de dirección

### Emergencias
- Contacto directo si hay problemas con el producto
- Notificación de retrasos en envío
- Confirmación de cambios en la orden

## Formato de Teléfono

Stripe maneja automáticamente:
- ✅ **Validación de formato** internacional
- ✅ **Normalización** del número
- ✅ **Detección de país** basada en el código
- ✅ **Formato consistente** en la base de datos

## Privacidad y Seguridad

- 🔒 **Almacenamiento seguro** en Sanity
- 📋 **Uso limitado** solo para propósitos de entrega
- 🚫 **No compartido** con terceros sin consentimiento
- ✅ **Cumplimiento** con políticas de privacidad

## Testing

### Desarrollo
```bash
# Usar números de prueba de Stripe
+52 55 1234 5678  # México
+1 555 123 4567   # Estados Unidos
```

### Producción
- Los clientes deben proporcionar números reales
- Validación automática por Stripe
- Almacenamiento inmediato en la orden

## Futuras Mejoras

### Notificaciones SMS
- Integración con Twilio o similar
- Confirmación de pago OXXO
- Updates de envío en tiempo real

### Validación Adicional
- Verificación de número activo
- Confirmación por SMS durante checkout
- Detección de números duplicados

### Analytics
- Tracking de tasas de entrega por región
- Análisis de patrones de comunicación
- Optimización de horarios de contacto