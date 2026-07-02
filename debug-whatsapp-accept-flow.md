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
