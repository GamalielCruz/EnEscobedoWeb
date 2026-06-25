import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { backendClient } from '@/sanity/lib/backendClient'
import {
  sendBotMessage,
  sendOrderOnTheWay,
  sendOrderDelivered,
  normalizeWhatsAppPhone,
  sendConfirmacionRepartidor,
  sendRepartidorEnCamino,
  sendRepartidorEnPuerta,
  sendClienteRepartidorEnPuerta,
} from '@/lib/whatsapp'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'garoga_verify_token'

const REPARTIDOR_BY_PHONE_QUERY = `*[_type == "repartidor" && telefono == $telefono][0]{
  _id, nombre, telefono, activo, disponible, pendienteConfirmacion,
  "ultimoPedidoOfertadoRef": ultimoPedidoOfertado._ref,
  "repartidorAsignadoRef": *[_type == "order" && repartidorAsignado._ref == ^._id && status == "shipped"][0]._id
}`

const ORDER_BY_ID_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  status,
  paymentMethod,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "storeAddress": affiliateStore->address.street,
  "storeName": affiliateStore->name,
  "shippingAddress": shippingAddress
}`

// Busca repartidor probando teléfono normalizado y luego raw
async function findRepartidor(fromPhone: string) {
  const normalizedPhone = normalizeWhatsAppPhone(fromPhone)

  if (normalizedPhone) {
    const rep = await backendClient.fetch(REPARTIDOR_BY_PHONE_QUERY, { telefono: normalizedPhone })
    if (rep) return rep
  }

  return backendClient.fetch(REPARTIDOR_BY_PHONE_QUERY, { telefono: fromPhone })
}

// Meta llama este GET para verificar el webhook
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[whatsapp webhook] Verificado correctamente')
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// Meta envía los mensajes entrantes aquí
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ status: 'ok' })
  }

  console.log('[whatsapp webhook] Mensaje recibido:', JSON.stringify(body, null, 2))

  try {
    // Extraer mensaje de texto del payload de Meta
    const entry = (body?.entry as Record<string, unknown>[])?.[0]
    const changes = (entry?.changes as Record<string, unknown>[])?.[0]
    const value = changes?.value as Record<string, unknown> | undefined
    const messages = value?.messages as Record<string, unknown>[] | undefined
    const message = messages?.[0]

    if (!message) {
      return NextResponse.json({ status: 'ok' })
    }

    const fromPhone = message.from as string
    let textBody = ''

    if (message.type === 'text') {
      textBody = ((message.text as Record<string, unknown>)?.body as string ?? '').trim().toUpperCase()
    } else if (message.type === 'interactive') {
      const interactive = message.interactive as Record<string, unknown>
      const buttonReply = interactive?.button_reply as Record<string, unknown>
      textBody = (buttonReply?.id as string ?? buttonReply?.title as string ?? '').trim().toUpperCase()
    } else if (message.type === 'button') {
      const btn = message.button as Record<string, unknown>
      textBody = (btn?.payload as string ?? btn?.text as string ?? '').trim().toUpperCase()
    } else {
      return NextResponse.json({ status: 'ok' })
    }

    // Verificar si el número es un repartidor registrado
    const repartidor = await findRepartidor(fromPhone)

    // Si no es repartidor → ignorar silenciosamente
    if (!repartidor) {
      console.log(`[whatsapp webhook] Número desconocido ${fromPhone}, ignorando`)
      return NextResponse.json({ status: 'ok' })
    }

    const now = new Date().toISOString()
    console.log(`[whatsapp webhook] Comando "${textBody}" de ${repartidor.nombre} (${fromPhone})`)

    // --- INICIO ---
    if (textBody === 'INICIO') {
      await backendClient
        .patch(repartidor._id)
        .set({
          disponible: true,
          disponibleDesde: now,
          ultimaActividad: now,
          pendienteConfirmacion: false,
        })
        .commit()

      try {
        await sendBotMessage(
          fromPhone,
          `Bienvenido ${repartidor.nombre}, ahora estás disponible para recibir pedidos. Manda FIN cuando termines tu turno.`
        )
      } catch (err) {
        console.error('[webhook INICIO] Error enviando mensaje:', err)
      }

      return NextResponse.json({ status: 'ok' })
    }

    // --- FIN ---
    if (textBody === 'FIN') {
      await backendClient
        .patch(repartidor._id)
        .set({ disponible: false, ultimaActividad: now, pendienteConfirmacion: false })
        .commit()

      void sendBotMessage(fromPhone, `Has terminado tu turno. ¡Hasta pronto!`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- SI (respuesta al recordatorio) ---
    if (textBody === 'SI') {
      await backendClient
        .patch(repartidor._id)
        .set({ pendienteConfirmacion: false, ultimaActividad: now })
        .commit()

      void sendBotMessage(
        fromPhone,
        `Perfecto, sigues activo. Te avisamos cuando haya un pedido.`
      ).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- NO (respuesta al recordatorio) ---
    if (textBody === 'NO') {
      await backendClient
        .patch(repartidor._id)
        .set({ disponible: false, pendienteConfirmacion: false, ultimaActividad: now })
        .commit()

      void sendBotMessage(fromPhone, `Te hemos desconectado. ¡Hasta pronto!`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- ACEPTO (sin número — usa ultimoPedidoOfertado del repartidor) ---
    if (textBody === 'ACEPTO' || textBody === 'ACEPTAR') {
      console.log(`[whatsapp webhook] ACEPTO de ${repartidor.nombre}`)

      // Actualizar ultimaActividad
      void backendClient
        .patch(repartidor._id)
        .set({ ultimaActividad: now })
        .commit()
        .catch(() => null)

      if (!repartidor.ultimoPedidoOfertadoRef) {
        void sendBotMessage(fromPhone, `No tienes ningún pedido pendiente de aceptar.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const order = await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId: repartidor.ultimoPedidoOfertadoRef })

      if (!order) {
        void sendBotMessage(fromPhone, `No tienes ningún pedido pendiente de aceptar.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      if (!order.deliveryOfertaEnviada) {
        void sendBotMessage(fromPhone, `Lo sentimos, este pedido ya no está disponible.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      if (order.repartidorAsignadoRef) {
        void sendBotMessage(fromPhone, `Lo sentimos, el pedido #${order.orderNumber} ya fue tomado por otro repartidor.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      if (order.deliveryOfertaExpiresAt) {
        const expires = new Date(order.deliveryOfertaExpiresAt).getTime()
        if (Date.now() > expires) {
          void sendBotMessage(fromPhone, `Lo sentimos, la oferta del pedido #${order.orderNumber} ya expiró.`).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }
      }

      // Asignar repartidor a la orden usando condicional de revisión para evitar race conditions
      try {
        await backendClient
          .patch(order._id)
          .ifRevisionId(order._rev)
          .set({
            repartidorAsignado: { _type: 'reference', _ref: repartidor._id },
            repartidorAsignadoAt: now,
            status: 'shipped',
            updatedAt: now,
          })
          .commit()
      } catch (patchError) {
        console.log(`[whatsapp webhook] Race condition evitada en ACEPTO para ${order.orderNumber}`)
        return NextResponse.json({ status: 'ok' })
      }

      revalidatePath('/orders')

      // Limpiar ultimoPedidoOfertado del repartidor
      void backendClient
        .patch(repartidor._id)
        .unset(['ultimoPedidoOfertado'])
        .commit()
        .catch(() => null)

      // Notificar al repartidor asignado
      const storeAddress = order.storeAddress ?? order.storeName ?? 'la tienda'

      const paymentMethodDisplay =
        order.paymentMethod === "cash_on_delivery" || order.paymentMethod === "cash_on_pickup"
          ? "COBRAR EN EFECTIVO"
          : "YA PAGADO";

      const restaurantMapsUrl = order.storeAddress
        ? `https://maps.google.com/maps?q=${encodeURIComponent(order.storeAddress)}`
        : `https://maps.google.com/maps?q=${encodeURIComponent(storeAddress)}`;

      const clientAddressStr = order.shippingAddress
        ? [order.shippingAddress.line1, order.shippingAddress.street, order.shippingAddress.city].filter(Boolean).join(", ")
        : "Ver pedido";

      const clientMapsUrl = order.shippingAddress?.line1
        ? `https://maps.google.com/maps?q=${encodeURIComponent(order.shippingAddress.line1)}`
        : `https://maps.google.com/maps?q=${encodeURIComponent(clientAddressStr)}`;

      void sendConfirmacionRepartidor(
        fromPhone,
        order.orderNumber,
        order.storeName ?? 'La Tienda',
        clientAddressStr,
        paymentMethodDisplay,
        restaurantMapsUrl,
        clientMapsUrl
      ).catch((err) =>
        console.error('[webhook ACEPTO] Error sendConfirmacionRepartidor:', err)
      )

      // Notificar al cliente
      // Quitado sendOrderOnTheWay de aquí porque ahora se hace cuando mandan 'PEDIDO EN DIRECCIÓN AL DOMICILIO'

      // Notificar a los demás repartidores disponibles
      const otherDrivers: Array<{ _id: string; nombre: string; telefono: string }> =
        await backendClient.fetch(
          `*[_type == "repartidor" && activo == true && disponible == true && _id != $assignedId]{_id, nombre, telefono}`,
          { assignedId: repartidor._id }
        )

      void Promise.allSettled(
        otherDrivers.map((d) =>
          sendBotMessage(d.telefono, `El pedido #${order.orderNumber} ya fue tomado. ¡Gracias por estar disponible!`)
        )
      ).catch(() => null)

      console.log(`[whatsapp webhook] Pedido ${order.orderNumber} asignado a ${repartidor.nombre}`)
      return NextResponse.json({ status: 'ok' })
    }

    // --- RECHAZAR ---
    if (textBody === 'RECHAZAR') {
      await backendClient
        .patch(repartidor._id)
        .unset(['ultimoPedidoOfertado'])
        .set({ ultimaActividad: now })
        .commit()

      void sendBotMessage(fromPhone, `Gracias, el pedido fue ofrecido a otro repartidor.`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- PEDIDO EN DIRECCIÓN AL DOMICILIO ---
    if (textBody === 'PEDIDO EN DIRECCIÓN AL DOMICILIO') {
        const shippedOrder = await backendClient.fetch(
          `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"][0]{_id, _rev, phone, customerName, orderNumber}`,
          { repartidorId: repartidor._id }
        )

        if (!shippedOrder) {
          void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        void sendRepartidorEnCamino(fromPhone, shippedOrder.orderNumber).catch((err) =>
          console.error('[webhook EN_CAMINO] Error sendRepartidorEnCamino:', err)
        );

        if (shippedOrder.phone && shippedOrder.customerName) {
          void sendOrderOnTheWay(
            shippedOrder.phone,
            shippedOrder.customerName,
            shippedOrder.orderNumber
          ).catch((err) =>
            console.error('[webhook EN_CAMINO] Error sendOrderOnTheWay:', err)
          );
        }

        return NextResponse.json({ status: 'ok' })
    }

    // --- EN PUERTA ---
    if (textBody === 'EN PUERTA') {
        const shippedOrder = await backendClient.fetch(
          `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"][0]{_id, _rev, phone, customerName, orderNumber}`,
          { repartidorId: repartidor._id }
        )

        if (!shippedOrder) {
          void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        void sendRepartidorEnPuerta(fromPhone, shippedOrder.orderNumber).catch((err) =>
          console.error('[webhook EN_PUERTA] Error sendRepartidorEnPuerta:', err)
        );

        if (shippedOrder.phone && shippedOrder.customerName) {
          void sendClienteRepartidorEnPuerta(
            shippedOrder.phone,
            shippedOrder.customerName,
            shippedOrder.orderNumber
          ).catch((err) =>
            console.error('[webhook EN_PUERTA] Error sendClienteRepartidorEnPuerta:', err)
          );
        }

        return NextResponse.json({ status: 'ok' })
    }

    // --- ENTREGADO — confirmar entrega del pedido en curso ---
      if (textBody === 'ENTREGADO') {
        // Buscar pedido asignado al repartidor con status "shipped"
        const shippedOrder = await backendClient.fetch(
          `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"][0]{_id, _rev, phone, customerName, orderNumber}`,
          { repartidorId: repartidor._id }
        )

        if (!shippedOrder) {
          void sendBotMessage(
            fromPhone,
            'No tienes ningún pedido en camino actualmente.'
          ).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        // Actualizar estado a delivered de forma segura
        try {
          await backendClient
            .patch(shippedOrder._id)
            .ifRevisionId(shippedOrder._rev)
            .set({ status: 'delivered', updatedAt: now })
            .commit()
        } catch (patchError) {
          console.log(`[whatsapp webhook] Race condition evitada en ENTREGADO para ${shippedOrder.orderNumber}`)
          return NextResponse.json({ status: 'ok' })
        }

        revalidatePath('/orders')

        // Notificar al cliente
        void sendOrderDelivered(
          shippedOrder.phone,
          shippedOrder.customerName,
          shippedOrder.orderNumber
        ).catch((err) =>
          console.error('[webhook ENTREGADO] Error sendOrderDelivered:', err)
        )

        // Respuesta al repartidor
        void sendBotMessage(
          fromPhone,
          '✅ Pedido entregado correctamente. ¡Gracias!'
        ).catch(() => null)

        return NextResponse.json({ status: 'ok' })
      }

      // --- Cualquier otro mensaje de un repartidor registrado ---
      void sendBotMessage(
        fromPhone,
        `Comandos disponibles: INICIO, FIN, ACEPTO, RECHAZAR, PEDIDO EN DIRECCIÓN AL DOMICILIO, EN PUERTA, ENTREGADO.`
      ).catch(() => null)

  } catch (error) {
    console.error('[whatsapp webhook] Error:', error)
  }

  return NextResponse.json({ status: 'ok' })
}
