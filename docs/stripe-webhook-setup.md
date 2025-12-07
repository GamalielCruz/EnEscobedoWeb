# Configuración de Webhooks de Stripe

## Eventos Requeridos

Para manejar correctamente los pagos OXXO y otros métodos de pago, asegúrate de que tu webhook de Stripe esté configurado para escuchar los siguientes eventos:

### Eventos Críticos:
- `checkout.session.completed` - Cuando se completa una sesión de checkout
- `checkout.session.expired` - Cuando expira una sesión de checkout (especialmente importante para OXXO)
- `payment_intent.succeeded` - Cuando se completa exitosamente un pago
- `payment_intent.payment_failed` - Cuando falla un pago

### Configuración en Stripe Dashboard:

1. Ve a **Developers > Webhooks** en tu dashboard de Stripe
2. Selecciona tu webhook endpoint
3. En la sección "Events to send", asegúrate de tener seleccionados:
   - `checkout.session.completed`
   - `checkout.session.expired` ⚠️ **IMPORTANTE PARA OXXO**
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`

### URL del Webhook:
- **Desarrollo:** `http://localhost:3000/webhook`
- **Producción:** `https://tu-dominio.com/webhook`

### Variables de Entorno Requeridas:
```env
STRIPE_WEBHOOK_SECRET=whsec_tu_secret_aqui
STRIPE_SECRET_KEY=sk_test_o_sk_live_tu_key_aqui
```

## Flujo de Pagos OXXO

### Estados de Orden:
1. **pending** - Orden creada, esperando pago en OXXO
2. **paid** - Pago completado exitosamente
3. **expired** - Tiempo límite de pago vencido (2 días para OXXO)
4. **failed** - Pago falló por algún motivo

### Tiempos de Expiración:
- **OXXO:** 2 días desde la creación de la sesión
- **Tarjetas:** Inmediato (no aplica expiración)

## Manejo de Errores

El webhook maneja automáticamente:
- Creación de órdenes cuando se completa el pago
- Actualización de estado a "expired" cuando vence el tiempo
- Actualización de estado a "failed" cuando falla el pago
- Logging de todos los eventos para debugging

## Testing

Para probar los webhooks localmente:
```bash
stripe listen --forward-to localhost:3000/webhook
```