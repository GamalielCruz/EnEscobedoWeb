# Configuración comercial

ElMenu usa Next.js, Clerk, Sanity y Stripe. La fuente de verdad comercial es el
documento singleton de Sanity `commercial-settings`; cada `affiliateStore`
guarda su plan y sobrescrituras, y cada `order` conserva `commercialSnapshot`.

## Migración

Ejecutar primero en staging:

```powershell
npx sanity exec scripts/migrate-commercial-plans.ts --with-user-token
```

La migración crea los dos planes y marca los restaurantes existentes para
revisión sin desactivar Stripe automáticamente. No hay evidencia por
restaurante en el modelo anterior: asignar Comunidad en ese punto rompería el
comportamiento existente.

Después, revisar cada restaurante en
`/admin/configuracion/comercial` y guardar Comunidad o Premium explícitamente.

## Reglas

- La comisión usa el subtotal de productos.
- `monthlyCommissionCap: 0` significa sin tope.
- La tarifa de servicio se resuelve como normal, reducida o gratuita.
- Un descuento de envío exige indicar si lo absorbe ElMenu o el restaurante.
- Comunidad bloquea Stripe en servidor; la interfaz también desactiva la opción.
- Las frases configuradas en Sanity rotan cada 5 segundos solo cuando el beneficio Premium esta activo.
- Los cambios solo afectan pedidos futuros.

El IVA no se hizo configurable porque el flujo actual fija `tax` en cero. Las
fechas programadas de cambio de plan tampoco existen en la infraestructura
actual.
