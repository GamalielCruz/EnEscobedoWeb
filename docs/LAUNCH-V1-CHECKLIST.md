# Checklist de lanzamiento V1

Base operativa pendiente de revisión jurídica profesional. Correo único de contacto, soporte y ARCO: `hola@elmenu.site`.

## Bloqueadores absolutos

- [ ] Completar `LEGAL_RESPONSIBLE_NAME`, `LEGAL_RFC`, `LEGAL_PHONE` y `LEGAL_ADDRESS`.
- [ ] Revisión jurídica profesional y publicación de `/legal`.
- [ ] Confirmar `LEGAL_VERSION` y aceptación versionada.
- [ ] Configurar `DELIVERY_PIN_SECRET` y `LEGAL_AUDIT_SECRET` con al menos 32 caracteres.
- [ ] Mantener ambas variables `ELMENU_DRIVER_DELIVERY_ENABLED=false`.
- [ ] Marcar `hasOwnDelivery=true` solo en restaurantes que ejecuten su propia entrega.
- [ ] Probar total y recálculo backend en tarjeta y efectivo.
- [ ] Activar Stripe producción, verificar webhook, idempotencia y reembolso.
- [ ] Verificar Clerk, roles, órdenes, Sanity, Baserow, WhatsApp, Maps y logs.
- [ ] Probar PIN correcto, incorrecto, bloqueo, expiración, override y doble entrega.
- [ ] Probar cobro duplicado y fallos de WhatsApp, Baserow y Maps.
- [ ] Configurar dominio, HTTPS, respaldos, monitoreo, alertas y soporte con folio.
- [ ] Ejecutar typegen, TypeScript, lint, pruebas y build.

## Importantes, no necesariamente bloqueantes

- Panel ARCO e incidencias; historial legal avanzado; reembolsos automatizados; analítica; reseñas; créditos; promociones complejas.

## Fuera de V1

- Alcohol, medicamentos, restringidos, billetera, saldo transferible, reparto abierto de ElMenu, reconocimiento facial, decisiones disciplinarias automatizadas, suscripciones complejas y operación multiestado.
