# Debug Session: whatsapp-accept-flow

Status: OPEN

## Sintoma
- `confirmacion_pedido` al cliente y `oferta_reparto` al repartidor ya salen.
- Despues de que el repartidor pulsa o envia `Acepto`, el flujo no completa de forma confiable.
- En los logs recientes no aparece evidencia de `POST /api/whatsapp/webhook` durante la aceptacion.

## Hipotesis Iniciales
1. Meta no esta entregando el callback de respuesta del boton a `POST /api/whatsapp/webhook`.
2. Meta si entrega el callback, pero el payload llega en una forma no cubierta por el parser actual y se ignora antes de loguear datos utiles.
3. El webhook entra, pero la busqueda del repartidor por telefono falla y el mensaje se descarta como numero desconocido.
4. El webhook entra y reconoce `ACEPTO`, pero falla al resolver `ultimoPedidoOfertado` o la oferta abierta antes de asignar la orden.
5. El webhook completa la asignacion, pero falla en una llamada posterior a Sanity o WhatsApp y parece que nunca avanzo.

## Evidencia Disponible
- Logs de Vercel muestran `POST /api/create-cod-order` y el inicio de `dispatchDeliveryOffer`.
- No hay evidencia de `POST /api/whatsapp/webhook` en el rango compartido por el usuario.

## Proximo Paso
- Agregar instrumentacion minima al webhook y al envio de oferta para capturar:
  - envio de template al repartidor,
  - payload entrante al webhook,
  - extraccion de comando,
  - busqueda de repartidor,
  - resolucion de orden al aceptar.

## Instrumentacion Aplicada
- `app/api/whatsapp/webhook/route.ts`
  - Entrada al webhook
  - Forma del payload
  - Comando extraido
  - Resultado de busqueda de repartidor
  - Resolucion de orden en `ACEPTO`
  - Exito o fallo al asignar

## Observacion Estatica Fuerte
- Hay una asimetria entre envio y recepcion:
  - El envio normaliza telefonos de repartidores de 10 digitos a formato internacional.
  - La recepcion busca al repartidor solo con el numero internacional recibido de Meta o el raw original.
  - Si Sanity guarda el `telefono` del repartidor en 10 digitos, el envio funciona pero la recepcion no encuentra al repartidor.

## Analisis Con Evidencia

### Evidencia nueva del usuario
- Se observa `dispatchDeliveryOffer` completo y exitoso.
- Se observa `create-cod-order` con confirmacion al cliente procesada.
- No aparece ninguna entrada de `POST /api/whatsapp/webhook`.
- Tampoco aparecen las trazas nuevas de `[whatsapp webhook][debug]`.
- El usuario reporta que antes incluso se veian mensajes entrantes en el webhook y ahora ya no.

### Estado de hipotesis
| ID | Hipotesis | Estado | Evidencia |
|----|-----------|--------|-----------|
| A | Meta no esta entregando el callback de respuesta del boton a `POST /api/whatsapp/webhook` | CONFIRMADA PARCIALMENTE | No existe ningun log del endpoint ni de la nueva instrumentacion al pulsar `Acepto` o `Rechazar`. |
| B | Meta si entrega el callback, pero el payload llega en una forma no cubierta por el parser actual | INCONCLUSA | No hay evidencia de entrada al endpoint para inspeccionar payload. |
| C | El webhook entra, pero la busqueda del repartidor por telefono falla y el mensaje se descarta como numero desconocido | INCONCLUSA | Las trazas `driver-lookup` no aparecen; por tanto, el codigo no parece estar ejecutandose. |
| D | El webhook entra y falla al resolver `ultimoPedidoOfertado` o la oferta abierta | INCONCLUSA | No hay trazas `accept-order-resolution`. |
| E | La asignacion ocurre y falla despues en Sanity o WhatsApp | RECHAZADA POR AHORA | No hay trazas de asignacion ni de entrada al webhook. |

### Conclusion provisional
- La causa dominante ya no parece ser logica interna del flujo.
- El problema mas probable esta antes de ejecutar el handler:
  - URL configurada en Meta para el webhook desactualizada,
  - app no suscrita al evento `messages`,
  - configuracion apuntando a otro dominio o deployment distinto,
  - o trafico llegando a un endpoint distinto del deployment que el usuario esta revisando.

## Actualizacion del usuario
- El usuario ya reviso Meta y actualizo el webhook a la nueva URL.

## Siguiente verificacion
- Reproducir una orden nueva y responder `Acepto` o `Rechazar`.
- Confirmar si ahora aparecen logs de:
  - `POST /api/whatsapp/webhook`
  - `[whatsapp webhook][debug] entry`
  - `[whatsapp webhook][debug] command-extracted`
  - `[whatsapp webhook][debug] driver-lookup`
