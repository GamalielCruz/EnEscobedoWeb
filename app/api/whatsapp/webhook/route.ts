import { NextRequest, NextResponse } from 'next/server'
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
const MEXICO_TIME_ZONE = 'America/Mexico_City'
const SESSION_OPTIONS = {
  '1': { minutes: 60, label: '1 hora' },
  '2': { minutes: 120, label: '2 horas' },
  '3': { minutes: 240, label: '4 horas' },
  '4': { minutes: 360, label: '6 horas' },
  '5': { minutes: 480, label: '8 horas' },
} as const
const EXTENSION_OPTIONS = {
  '1': 60,
  '2': 120,
} as const
const mexicoTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: MEXICO_TIME_ZONE,
})

const REPARTIDOR_BY_PHONE_QUERY = `*[_type == "repartidor" && telefono == $telefono][0]{
  _id,
  nombre,
  telefono,
  activo,
  disponible,
  disponibleDesde,
  disponibleHasta,
  duracionDisponibilidadMinutos,
  estadoDisponibilidad,
  pendienteConfirmacion,
  esperandoSeleccionDisponibilidad,
  extensionPendiente,
  extensionPreguntadaAt,
  autoDesconectadoAt,
  motivoDesconexion,
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

const LATEST_OPEN_OFFER_QUERY = `*[
  _type == "order" &&
  deliveryOfertaEnviada == true &&
  !defined(repartidorAsignado)
] | order(deliveryOfertaExpiresAt desc, orderDate desc)[0]{
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

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function getSessionSelectionPrompt(): string {
  return `¿Cuánto tiempo estarás disponible?

1️⃣ 1 hora
2️⃣ 2 horas
3️⃣ 4 horas
4️⃣ 6 horas
5️⃣ 8 horas

Responde con el número de la opción.`
}

function getInvalidSessionSelectionPrompt(): string {
  return `No pude entender la opción.

Responde solo con un número:

1️⃣ 1 hora
2️⃣ 2 horas
3️⃣ 4 horas
4️⃣ 6 horas
5️⃣ 8 horas`
}

function getExtensionPrompt(): string {
  return `Tu sesión termina en aproximadamente 10 minutos.

¿Quieres extender tu disponibilidad?

1️⃣ Extender 1 hora
2️⃣ Extender 2 horas
3️⃣ Terminar al finalizar`
}

function getInvalidExtensionPrompt(): string {
  return `No pude entender la opción.

Responde solo con un número:

1️⃣ Extender 1 hora
2️⃣ Extender 2 horas
3️⃣ Terminar al finalizar`
}

function formatDurationLabel(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? '1 hora' : `${hours} horas`
  }

  return `${minutes} minutos`
}

function formatMexicoTime(isoDate: string): string {
  return mexicoTimeFormatter.format(new Date(isoDate))
}

function calculateSessionWindow(baseDate: Date, minutes: number) {
  const availableUntil = new Date(baseDate.getTime() + minutes * 60 * 1000)

  return {
    availableUntilIso: availableUntil.toISOString(),
    totalMinutes: minutes,
  }
}

function calculateExtendedSessionWindow(
  nowDate: Date,
  availableFrom: string | undefined,
  currentAvailableUntil: string | undefined,
  extraMinutes: number
) {
  const parsedAvailableUntil = currentAvailableUntil ? new Date(currentAvailableUntil) : nowDate
  const safeBaseDate = Number.isNaN(parsedAvailableUntil.getTime()) ? nowDate : parsedAvailableUntil
  const availableUntil = new Date(safeBaseDate.getTime() + extraMinutes * 60 * 1000)

  let totalMinutes = extraMinutes
  if (availableFrom) {
    const parsedAvailableFrom = new Date(availableFrom)
    if (!Number.isNaN(parsedAvailableFrom.getTime())) {
      totalMinutes = Math.max(
        extraMinutes,
        Math.round((availableUntil.getTime() - parsedAvailableFrom.getTime()) / (60 * 1000))
      )
    }
  }

  return {
    availableUntilIso: availableUntil.toISOString(),
    totalMinutes,
  }
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

  // #region debug-point A:webhook-entry
  const traceId = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.info('[whatsapp webhook][debug] entry', {
    traceId,
    method: req.method,
    url: req.url,
    hasEntry: Array.isArray(body?.entry),
  })
  // #endregion

  console.log('[whatsapp webhook] Mensaje recibido:', JSON.stringify(body, null, 2))

  try {
    // Extraer mensaje de texto del payload de Meta
    const entry = (body?.entry as Record<string, unknown>[])?.[0]
    const changes = (entry?.changes as Record<string, unknown>[])?.[0]
    const value = changes?.value as Record<string, unknown> | undefined
    const messages = value?.messages as Record<string, unknown>[] | undefined
    const message = messages?.[0]

    // #region debug-point B:payload-shape
    console.info('[whatsapp webhook][debug] payload-shape', {
      traceId,
      messageCount: messages?.length ?? 0,
      messageType: message?.type,
      fromPhone: message?.from,
      hasStatuses: Array.isArray(value?.statuses),
    })
    // #endregion

    if (!message) {
      return NextResponse.json({ status: 'ok' })
    }

    const fromPhone = message.from as string
    let textBody = ''

    if (message.type === 'text') {
      textBody = normalizeText((message.text as Record<string, unknown>)?.body as string ?? '')
    } else if (message.type === 'interactive') {
      const interactive = message.interactive as Record<string, unknown>
      const buttonReply = interactive?.button_reply as Record<string, unknown>
      textBody = normalizeText(buttonReply?.id as string ?? buttonReply?.title as string ?? '')
    } else if (message.type === 'button') {
      const btn = message.button as Record<string, unknown>
      textBody = normalizeText(btn?.payload as string ?? btn?.text as string ?? '')
    } else {
      // #region debug-point C:unsupported-message
      console.info('[whatsapp webhook][debug] unsupported-message', {
        traceId,
        messageType: message.type,
      })
      // #endregion
      return NextResponse.json({ status: 'ok' })
    }

    // #region debug-point D:command-extracted
    console.info('[whatsapp webhook][debug] command-extracted', {
      traceId,
      fromPhone,
      messageType: message.type,
      textBody,
    })
    // #endregion

    // Verificar si el número es un repartidor registrado
    const repartidor = await findRepartidor(fromPhone)

    // #region debug-point E:driver-lookup
    console.info('[whatsapp webhook][debug] driver-lookup', {
      traceId,
      fromPhone,
      normalizedFromPhone: normalizeWhatsAppPhone(fromPhone),
      found: !!repartidor,
      repartidorId: repartidor?._id,
      repartidorTelefono: repartidor?.telefono,
      repartidorNombre: repartidor?.nombre,
    })
    // #endregion

    // Si no es repartidor → ignorar silenciosamente
    if (!repartidor) {
      console.log(`[whatsapp webhook] Número desconocido ${fromPhone}, ignorando`)
      return NextResponse.json({ status: 'ok' })
    }

    const nowDate = new Date()
    const now = nowDate.toISOString()
    console.log(`[whatsapp webhook] Comando "${textBody}" de ${repartidor.nombre} (${fromPhone})`)

    // --- FIN ---
    if (textBody === 'FIN') {
      console.log('[webhook disponibilidad] FIN manual recibido', {
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
      })

      await backendClient
        .patch(repartidor._id)
        .set({
          disponible: false,
          estadoDisponibilidad: 'offline',
          esperandoSeleccionDisponibilidad: false,
          extensionPendiente: false,
          pendienteConfirmacion: false,
          motivoDesconexion: 'manual',
          ultimaActividad: now,
        })
        .unset([
          'confirmacionEnviadaAt',
          'disponibleHasta',
          'disponibleDesde',
          'duracionDisponibilidadMinutos',
          'extensionPreguntadaAt',
          'autoDesconectadoAt',
        ])
        .commit()

      void sendBotMessage(
        fromPhone,
        `Te desconectamos correctamente. Responde INICIO cuando quieras volver a estar disponible.`
      ).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- INICIO ---
    if (textBody === 'INICIO') {
      console.log('[webhook disponibilidad] INICIO recibido', {
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
      })

      await backendClient
        .patch(repartidor._id)
        .set({
          disponible: false,
          estadoDisponibilidad: 'offline',
          ultimaActividad: now,
          esperandoSeleccionDisponibilidad: true,
          extensionPendiente: false,
          pendienteConfirmacion: false,
        })
        .unset([
          'confirmacionEnviadaAt',
          'disponibleDesde',
          'disponibleHasta',
          'duracionDisponibilidadMinutos',
          'extensionPreguntadaAt',
          'autoDesconectadoAt',
          'motivoDesconexion',
        ])
        .commit()

      try {
        await sendBotMessage(fromPhone, getSessionSelectionPrompt())
      } catch (err) {
        console.error('[webhook INICIO] Error enviando mensaje:', err)
      }

      return NextResponse.json({ status: 'ok' })
    }

    if (repartidor.esperandoSeleccionDisponibilidad) {
      const selectedSession = SESSION_OPTIONS[textBody as keyof typeof SESSION_OPTIONS]

      if (!selectedSession) {
        console.log('[webhook disponibilidad] Selección inválida de duración', {
          repartidorId: repartidor._id,
          repartidorNombre: repartidor.nombre,
          textBody,
        })

        await backendClient
          .patch(repartidor._id)
          .set({ ultimaActividad: now })
          .commit()

        void sendBotMessage(fromPhone, getInvalidSessionSelectionPrompt()).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const sessionWindow = calculateSessionWindow(nowDate, selectedSession.minutes)
      console.log('[webhook disponibilidad] Selección de duración confirmada', {
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
        durationMinutes: selectedSession.minutes,
        availableUntil: sessionWindow.availableUntilIso,
      })

      await backendClient
        .patch(repartidor._id)
        .set({
          disponible: true,
          disponibleDesde: now,
          disponibleHasta: sessionWindow.availableUntilIso,
          duracionDisponibilidadMinutos: sessionWindow.totalMinutes,
          estadoDisponibilidad: 'available',
          ultimaActividad: now,
          esperandoSeleccionDisponibilidad: false,
          extensionPendiente: false,
          pendienteConfirmacion: false,
        })
        .unset([
          'confirmacionEnviadaAt',
          'extensionPreguntadaAt',
          'autoDesconectadoAt',
          'motivoDesconexion',
        ])
        .commit()

      void sendBotMessage(
        fromPhone,
        `Listo. Estás disponible por ${formatDurationLabel(selectedSession.minutes)}.
Tu sesión termina a las ${formatMexicoTime(sessionWindow.availableUntilIso)}.
Te avisaremos 10 minutos antes de finalizar.`
      ).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    if (repartidor.extensionPendiente) {
      if (textBody === '3') {
        console.log('[webhook disponibilidad] Extensión rechazada; termina en horario programado', {
          repartidorId: repartidor._id,
          repartidorNombre: repartidor.nombre,
          availableUntil: repartidor.disponibleHasta,
        })

        await backendClient
          .patch(repartidor._id)
          .set({
            extensionPendiente: false,
            ultimaActividad: now,
          })
          .unset(['extensionPreguntadaAt'])
          .commit()

        void sendBotMessage(
          fromPhone,
          `Perfecto. Tu sesión terminará a la hora programada.`
        ).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const extensionMinutes = EXTENSION_OPTIONS[textBody as keyof typeof EXTENSION_OPTIONS]
      if (!extensionMinutes) {
        console.log('[webhook disponibilidad] Respuesta inválida a extensión', {
          repartidorId: repartidor._id,
          repartidorNombre: repartidor.nombre,
          textBody,
        })

        await backendClient
          .patch(repartidor._id)
          .set({ ultimaActividad: now })
          .commit()

        void sendBotMessage(fromPhone, getInvalidExtensionPrompt()).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const extendedWindow = calculateExtendedSessionWindow(
        nowDate,
        repartidor.disponibleDesde,
        repartidor.disponibleHasta,
        extensionMinutes
      )
      console.log('[webhook disponibilidad] Extensión aceptada', {
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
        extensionMinutes,
        availableUntil: extendedWindow.availableUntilIso,
      })

      await backendClient
        .patch(repartidor._id)
        .set({
          disponible: true,
          disponibleHasta: extendedWindow.availableUntilIso,
          duracionDisponibilidadMinutos: extendedWindow.totalMinutes,
          estadoDisponibilidad: 'available',
          extensionPendiente: false,
          ultimaActividad: now,
        })
        .unset(['extensionPreguntadaAt'])
        .commit()

      void sendBotMessage(
        fromPhone,
        `Listo. Extendimos tu disponibilidad ${formatDurationLabel(extensionMinutes)} más.`
      ).catch(() => null)
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

      const order = repartidor.ultimoPedidoOfertadoRef
        ? await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId: repartidor.ultimoPedidoOfertadoRef })
        : await backendClient.fetch(LATEST_OPEN_OFFER_QUERY)

      // #region debug-point F:accept-order-resolution
      console.info('[whatsapp webhook][debug] accept-order-resolution', {
        traceId,
        repartidorId: repartidor._id,
        ultimoPedidoOfertadoRef: repartidor.ultimoPedidoOfertadoRef,
        orderFound: !!order,
        orderId: order?._id,
        orderNumber: order?.orderNumber,
        orderAssignedTo: order?.repartidorAsignadoRef,
        deliveryOfertaEnviada: order?.deliveryOfertaEnviada,
        deliveryOfertaExpiresAt: order?.deliveryOfertaExpiresAt,
      })
      // #endregion

      if (!order) {
        await sendBotMessage(fromPhone, `No tienes ningun pedido pendiente de aceptar.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      if (!order.deliveryOfertaEnviada) {
        await sendBotMessage(fromPhone, `Lo sentimos, este pedido ya no esta disponible.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      if (order.repartidorAsignadoRef) {
        await sendBotMessage(fromPhone, `Lo sentimos, el pedido #${order.orderNumber} ya fue tomado por otro repartidor.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const isOfferExpired = order.deliveryOfertaExpiresAt
        ? Date.now() > new Date(order.deliveryOfertaExpiresAt).getTime()
        : false

      if (isOfferExpired) {
        console.log(
          `[whatsapp webhook] Oferta expirada para ${order.orderNumber}, pero sigue libre; permitiendo ACEPTO tardio`
        )
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
            deliveryOfertaEnviada: false,
            updatedAt: now,
          })
          .unset(['deliveryOfertaExpiresAt'])
          .commit()
        // #region debug-point G:accept-assign-success
        console.info('[whatsapp webhook][debug] accept-assign-success', {
          traceId,
          orderId: order._id,
          orderNumber: order.orderNumber,
          repartidorId: repartidor._id,
        })
        // #endregion
      } catch (patchError) {
        // #region debug-point H:accept-assign-failure
        console.error('[whatsapp webhook][debug] accept-assign-failure', {
          traceId,
          orderId: order._id,
          orderNumber: order.orderNumber,
          repartidorId: repartidor._id,
          patchError,
        })
        // #endregion
        console.log(`[whatsapp webhook] Race condition evitada en ACEPTO para ${order.orderNumber}`)
        return NextResponse.json({ status: 'ok' })
      }

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

      const confirmationResults = await Promise.allSettled([
        sendConfirmacionRepartidor(
          fromPhone,
          order.orderNumber,
          order.storeName ?? 'La Tienda',
          clientAddressStr,
          paymentMethodDisplay,
          restaurantMapsUrl,
          clientMapsUrl
        ),
      ])

      const [confirmationResult] = confirmationResults
      if (confirmationResult?.status === 'rejected') {
        console.error('[webhook ACEPTO] Error sendConfirmacionRepartidor:', confirmationResult.reason)
        await sendBotMessage(
          fromPhone,
          `Pedido #${order.orderNumber} asignado. Recoge en ${order.storeName ?? 'La Tienda'} y entrega en ${clientAddressStr}. Pago: ${paymentMethodDisplay}.`
        ).catch(() => null)
      }

      // Notificar al cliente
      console.log('[webhook ACEPTO] Enviando pedido_en_camino al cliente:', order.phone)
      // Quitado sendOrderOnTheWay de aquí porque ahora se hace cuando mandan 'PEDIDO EN DIRECCIÓN AL DOMICILIO'

      // Notificar a los demás repartidores disponibles
      const otherDrivers: Array<{ _id: string; nombre: string; telefono: string }> =
        await backendClient.fetch(
          `*[_type == "repartidor" && activo == true && disponible == true && estadoDisponibilidad == "available" && _id != $assignedId]{_id, nombre, telefono}`,
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

    // --- PEDIDO EN DIRECCION AL DOMICILIO ---
    if (textBody === 'PEDIDO EN DIRECCION AL DOMICILIO') {
        const shippedOrder = await backendClient.fetch(
          `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"][0]{_id, _rev, phone, customerName, orderNumber}`,
          { repartidorId: repartidor._id }
        )

        if (!shippedOrder) {
          console.log(`[whatsapp webhook] Sin pedido shipped para ${repartidor.nombre} al marcar EN_CAMINO`)
          void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        const enCaminoNotifications: Promise<unknown>[] = [
          sendRepartidorEnCamino(fromPhone, shippedOrder.orderNumber),
        ]

        const customerPhone = normalizeWhatsAppPhone(shippedOrder.phone)

        if (customerPhone && shippedOrder.customerName) {
          enCaminoNotifications.push(
            sendOrderOnTheWay(
              customerPhone,
              shippedOrder.customerName,
              shippedOrder.orderNumber
            )
          )
        } else {
          console.warn(
            `[webhook EN_CAMINO] Telefono cliente invalido u omitido para pedido ${shippedOrder.orderNumber}:`,
            shippedOrder.phone
          )
        }

        const enCaminoResults = await Promise.allSettled(enCaminoNotifications)
        enCaminoResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const label = index === 0 ? 'sendRepartidorEnCamino' : 'sendOrderOnTheWay'
            console.error(`[webhook EN_CAMINO] Error ${label}:`, result.reason)
          }
        })

        console.log(`[whatsapp webhook] Notificaciones EN_CAMINO procesadas para pedido ${shippedOrder.orderNumber}`)

        return NextResponse.json({ status: 'ok' })
    }

    // --- EN PUERTA ---
    if (textBody === 'EN PUERTA') {
        const shippedOrder = await backendClient.fetch(
          `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"][0]{_id, _rev, phone, customerName, orderNumber}`,
          { repartidorId: repartidor._id }
        )

        if (!shippedOrder) {
          console.log(`[whatsapp webhook] Sin pedido shipped para ${repartidor.nombre} al marcar EN_PUERTA`)
          void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        const enPuertaNotifications: Promise<unknown>[] = [
          sendRepartidorEnPuerta(fromPhone, shippedOrder.orderNumber),
        ]

        const customerPhone = normalizeWhatsAppPhone(shippedOrder.phone)

        if (customerPhone && shippedOrder.customerName) {
          enPuertaNotifications.push(
            sendClienteRepartidorEnPuerta(
              customerPhone,
              shippedOrder.customerName,
              shippedOrder.orderNumber
            )
          )
        } else {
          console.warn(
            `[webhook EN_PUERTA] Telefono cliente invalido u omitido para pedido ${shippedOrder.orderNumber}:`,
            shippedOrder.phone
          )
        }

        const enPuertaResults = await Promise.allSettled(enPuertaNotifications)
        enPuertaResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const label = index === 0 ? 'sendRepartidorEnPuerta' : 'sendClienteRepartidorEnPuerta'
            console.error(`[webhook EN_PUERTA] Error ${label}:`, result.reason)
          }
        })

        console.log(`[whatsapp webhook] Notificaciones EN_PUERTA procesadas para pedido ${shippedOrder.orderNumber}`)

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
          console.log(`[whatsapp webhook] Sin pedido shipped para ${repartidor.nombre} al marcar ENTREGADO`)
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

        // Notificar al cliente
        const customerPhone = normalizeWhatsAppPhone(shippedOrder.phone)
        if (customerPhone && shippedOrder.customerName) {
          const deliveredResults = await Promise.allSettled([
            sendOrderDelivered(
              customerPhone,
              shippedOrder.customerName,
              shippedOrder.orderNumber
            ),
          ])

          const [deliveredResult] = deliveredResults
          if (deliveredResult?.status === 'rejected') {
            console.error('[webhook ENTREGADO] Error sendOrderDelivered:', deliveredResult.reason)
          }
        } else {
          console.warn(
            `[webhook ENTREGADO] Telefono cliente invalido u omitido para pedido ${shippedOrder.orderNumber}:`,
            shippedOrder.phone
          )
        }

        // Respuesta al repartidor
        void sendBotMessage(
          fromPhone,
          '✅ Pedido entregado correctamente. ¡Gracias!'
        ).catch(() => null)

        console.log(`[whatsapp webhook] Pedido ${shippedOrder.orderNumber} marcado ENTREGADO por ${repartidor.nombre}`)

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

