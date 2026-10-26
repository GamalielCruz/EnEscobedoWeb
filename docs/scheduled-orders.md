# Pedidos programados

## Fuente de verdad

`lib/fulfillment-schedule.ts` cruza, en `America/Mexico_City`, el horario del restaurante con el horario global de reparto, excepciones, pausa operativa, preparación, traslado, márgenes, cobertura y límites propios del restaurante. Delivery usa la intersección completa; pickup ignora reparto y cobertura. La API, `/basket` y la página de tienda consumen esta misma función.

La configuración global vive en el documento singleton de Sanity `deliveryScheduleConfig` con `_id = "deliveryScheduleConfig"`. Si todavía no existe, se usan los valores iniciales 10:00–18:00, 60 minutos de anticipación, 7 días, intervalos de 30 minutos y margen de cierre de 30 minutos. Se administra en `/admin/configuracion/reparto`.

Una entrega programada se guarda con `dispatchStatus = "scheduled"`. `scheduledDispatchAt` se calcula como inicio del intervalo menos traslado estimado menos margen para conseguir repartidor. GitHub Actions llama cada cinco minutos a `/api/cron/check-repartidores`, que la cambia mediante compare-and-set a `waiting_for_driver` / `ready_for_dispatch` y llama al dispatch actual. Los umbrales `riskBeforeMinutes`, `adminAlertBeforeMinutes` y `contingencyBeforeMinutes` son editables.

No se agregó ninguna variable de entorno. Se reutilizan `CRON_SECRET`, la configuración actual de Sanity y las variables existentes de WhatsApp (`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`; `ADMIN_WHATSAPP_PHONE` sigue siendo opcional). Los envíos reales solo ocurren cuando la protección existente reconoce producción.

## Datos

`affiliateStore` agrega:

- `scheduledOrdersEnabled`
- `minimumPreparationMinutes`
- `scheduledOrderIntervalMinutes`
- `maximumScheduledDays`
- `lastDeliveryOrderMinutesBeforeClose`
- `lastPickupOrderMinutesBeforeClose`

`order` agrega:

- `fulfillmentType`, `fulfillmentTiming`, `scheduledSlot`
- `estimatedPreparationMinutes`
- `storeScheduleSnapshot`, `deliveryScheduleSnapshot`
- `scheduleStatus`, `scheduledPreparationAt`, `scheduledDispatchAt`
- `preparationStatus`, `preparationStartedAt`, `scheduledDispatchStartedAt`
- `scheduleRiskLevel`, `scheduleRiskAlertedAt`
- `scheduleCustomerChoice`, `scheduleCustomerChoiceAt`
- `customerPickupConsentAt`, `customerHelpRequested`

`whatsappTemplateDelivery` guarda el claim idempotente, estado, ID devuelto por Meta y error de cada entrega sin almacenar el contenido del mensaje.

Baserow debe tener las columnas `Horario programado`, `Fin del intervalo`, `Zona horaria` y `Estado de programación` para recibir los nuevos snapshots.

## Plantillas de Meta verificadas

Consulta de lectura realizada contra la WABA configurada el 28 de julio de 2026. Las tres plantillas estaban en estado `PENDING`; Meta debe aprobarlas antes de que un envío real funcione.

### `cliente_pedido_programado`

- Idioma: `es_MX`
- Categoría: `UTILITY`
- Encabezado estático: `Pedido programado`
- Cuerpo, en orden: cliente, número de pedido, restaurante, fecha, intervalo, modalidad, total
- Botones: ninguno; la solicitud omite por completo componentes `button`

### `cliente_pedido_programado_en_preparacion`

- Idioma: `es_MX`
- Categoría: `MARKETING`
- Cuerpo, en orden: cliente, número de pedido, restaurante, hora programada
- Botón aprobado: URL estática `Ver mi pedido` → `https://elmenu.site/orders`
- Parámetros dinámicos del botón: ninguno; Meta incorpora el botón desde la plantilla
- Se dispara únicamente al cambio real del restaurante a `preparationStatus = "in_preparation"`

### `cliente_entrega_programada_sin_repartidor`

- Idioma: `es_MX`
- Categoría: `MARKETING`
- Cuerpo, en orden: cliente, número de pedido, hora programada
- Quick replies, en orden:
  1. `Esperar repartidor` → payload `SCHEDULE WAIT|ORDER_ID`
  2. `Cambiar a recolección` → payload `SCHEDULE PICKUP|ORDER_ID`
  3. `Necesito ayuda` → payload `SCHEDULE HELP|ORDER_ID`

El webhook valida firma, teléfono, orden, modalidad, estado, ausencia de repartidor, vigencia e idempotencia. El cambio a pickup valida servicio y slot, libera la oferta, elimina envío, recalcula importes, solicita reconciliación/reembolso parcial de Stripe cuando aplica, registra consentimiento, notifica al restaurante y sincroniza Baserow.

## Prueba manual

1. En Sanity, confirme horarios reales del restaurante, coordenadas y modalidades.
2. Entre como admin a `/admin/configuracion/reparto`, guarde el horario global y pruebe una excepción y una pausa con reactivación.
3. Entre a una tienda cerrada con horario futuro y confirme que aparece `Cerrado · Programar pedido`.
4. En `/basket`, pruebe delivery con dirección dentro y fuera de cobertura; después pruebe pickup. Avance y regrese para confirmar persistencia.
5. Antes de confirmar, cambie la excepción administrativa y compruebe el error `DELIVERY_SLOT_UNAVAILABLE` sin perder el carrito.
6. Cree una orden programada con efectivo y otra con Stripe. En Stripe, confirme que la orden pendiente existe antes de mostrar el checkout y que el webhook conserva el slot.
7. Verifique en Sanity que la orden tenga snapshots, `dispatchStatus = "scheduled"` y eventos append-only.
8. Ejecute con `CRON_SECRET` la ruta `/api/cron/check-repartidores`; antes de `scheduledDispatchAt` no debe ofrecerse y después debe reutilizar el dispatch existente.
9. Desde el dashboard del restaurante, cambie la orden a `processing`; compruebe que solo entonces se intenta la plantilla de preparación.
10. Sin repartidor, avance el reloj/umbrales hasta contingencia y pruebe los tres quick replies. Repita el mismo webhook y confirme que no se procesa dos veces.
11. Revise `/admin/configuracion/reparto`, Baserow y `orderEvents`.

Pruebas automáticas: `npm run test:scheduling`. Generación de tipos: `npm run typegen`. Verificación TypeScript: `npx tsc --noEmit`.
