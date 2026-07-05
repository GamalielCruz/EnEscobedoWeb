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
import { dispatchWaitingOrdersForDriver, redispatchOrders, releaseOrdersForDriver } from '@/lib/delivery-dispatch'

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
  ofertaTipo,
  ofertaEnviadaAt,
  ofertaExpiraAt,
  "restauranteOfertaRef": restauranteOferta._ref,
  "pedidosOfertadosRefs": pedidosOfertados[]._ref,
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
  dispatchStatus,
  paymentMethod,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  "storeId": affiliateStore._ref,
  "storeAddress": affiliateStore->address.street,
  "storeName": affiliateStore->name,
  "shippingAddress": shippingAddress
}`

const ORDERS_BY_IDS_QUERY = `*[_type == "order" && _id in $orderIds]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  status,
  dispatchStatus,
  paymentMethod,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  "storeId": affiliateStore._ref,
  "storeAddress": affiliateStore->address.street,
  "storeName": affiliateStore->name,
  "shippingAddress": shippingAddress
}`

const ACTIVE_SHIPPED_ORDERS_QUERY = `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"] | order(orderDate asc){
  _id,
  _rev,
  phone,
  customerName,
  orderNumber,
  status,
  dispatchStatus,
  paymentMethod,
  "storeName": affiliateStore->name,
  "storeAddress": affiliateStore->address.street,
  "shippingAddress": shippingAddress
}`

// Busca repartidor probando telÃ©fono normalizado y luego raw
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

function normalizeDriverActionToken(text: string): string {
  return normalizeText(text).replace(/_/g, ' ')
}

function parseButtonActionPayload(rawValue: string) {
  const trimmed = String(rawValue || '').trim()
  if (!trimmed) {
    return { action: '', orderId: null as string | null }
  }

  const [rawAction, ...rawOrderIdParts] = trimmed.split('|')
  return {
    action: normalizeDriverActionToken(rawAction),
    orderId: rawOrderIdParts.join('|').trim() || null,
  }
}

function getSessionSelectionPrompt(): string {
  return `Â¿CuÃ¡nto tiempo estarÃ¡s disponible?

1ï¸âƒ£ 1 hora
2ï¸âƒ£ 2 horas
3ï¸âƒ£ 4 horas
4ï¸âƒ£ 6 horas
5ï¸âƒ£ 8 horas

Responde con el nÃºmero de la opciÃ³n.`
}

function getInvalidSessionSelectionPrompt(): string {
  return `No pude entender la opciÃ³n.

Responde solo con un nÃºmero:

1ï¸âƒ£ 1 hora
2ï¸âƒ£ 2 horas
3ï¸âƒ£ 4 horas
4ï¸âƒ£ 6 horas
5ï¸âƒ£ 8 horas`
}

function getExtensionPrompt(): string {
  return `Tu sesiÃ³n termina en aproximadamente 10 minutos.

Â¿Quieres extender tu disponibilidad?

1ï¸âƒ£ Extender 1 hora
2ï¸âƒ£ Extender 2 horas
3ï¸âƒ£ Terminar al finalizar`
}

function getInvalidExtensionPrompt(): string {
  return `No pude entender la opciÃ³n.

Responde solo con un nÃºmero:

1ï¸âƒ£ Extender 1 hora
2ï¸âƒ£ Extender 2 horas
3ï¸âƒ£ Terminar al finalizar`
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

function getPendingOfferOrderIds(repartidor: {
  pedidosOfertadosRefs?: string[]
  ultimoPedidoOfertadoRef?: string
}) {
  if (Array.isArray(repartidor.pedidosOfertadosRefs) && repartidor.pedidosOfertadosRefs.length > 0) {
    return repartidor.pedidosOfertadosRefs.filter(Boolean).slice(0, 2)
  }

  return repartidor.ultimoPedidoOfertadoRef ? [repartidor.ultimoPedidoOfertadoRef] : []
}

function buildClientAddress(order: {
  shippingAddress?: { line1?: string; street?: string; city?: string }
}) {
  return order.shippingAddress
    ? [order.shippingAddress.line1, order.shippingAddress.street, order.shippingAddress.city]
        .filter(Boolean)
        .join(', ')
    : 'Ver pedido'
}

function getDriverNextState(repartidor: { disponible?: boolean; disponibleHasta?: string }, nowDate: Date): 'available' | 'offline' {
  if (!repartidor.disponible) {
    return 'offline'
  }

  if (!repartidor.disponibleHasta) {
    return 'available'
  }

  const availableUntilMs = new Date(repartidor.disponibleHasta).getTime()
  if (!Number.isFinite(availableUntilMs)) {
    return 'available'
  }

  return availableUntilMs > nowDate.getTime() ? 'available' : 'offline'
}

function extractOrderToken(textBody: string, command: string) {
  if (textBody === command) {
    return null
  }

  if (!textBody.startsWith(command + ' ')) {
    return null
  }

  return textBody.slice(command.length).trim().replace(/^#/, '') || null
}

async function resolvePendingOfferOrders(repartidor: Record<string, unknown>, nowDate: Date, orderToken?: string | null): Promise<Array<Record<string, unknown>>> {
  const pendingOrderIds = getPendingOfferOrderIds(repartidor as { pedidosOfertadosRefs?: string[]; ultimoPedidoOfertadoRef?: string })
  const pendingOrders = await fetchOrdersByIds(pendingOrderIds)
  const nowMs = nowDate.getTime()

  const validOrders = (pendingOrders as Array<Record<string, unknown>>).filter((order) => {
    const expiresAtRaw = order.deliveryOfertaExpiresAt
    const expiresAtMs = typeof expiresAtRaw === 'string' ? new Date(expiresAtRaw).getTime() : NaN
    return (
      order.deliveryOfertaEnviada === true &&
      order.dispatchStatus === 'offered' &&
      order.offeredToRef === repartidor._id &&
      !order.repartidorAsignadoRef &&
      order.status !== 'delivered' &&
      order.status !== 'cancelled' &&
      Number.isFinite(expiresAtMs) &&
      expiresAtMs > nowMs
    )
  })

  if (orderToken) {
    return validOrders.filter((order) => String(order.orderNumber) === orderToken)
  }

  return validOrders
}

function resolveExactAssignedOrder(orders: Array<Record<string, unknown>>, orderToken?: string | null) {
  if (orderToken) {
    return orders.find((order) => String(order.orderNumber) === orderToken) ?? null
  }

  return orders.length === 1 ? orders[0] : null
}

async function resolveAssignedOrderById(orderId: string, repartidorId: string) {
  const order = await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId }) as Record<string, unknown> | null
  if (!order) {
    return null
  }

  if (String(order.repartidorAsignadoRef ?? '') !== repartidorId) {
    return null
  }

  if (String(order.status ?? '') !== 'shipped') {
    return null
  }

  return order
}

function getAmbiguousOrderPrompt(command: string, orders: Array<Record<string, unknown>>) {
  const orderList = orders.map((order) => String(order.orderNumber)).join(', ')
  const firstOrder = String(orders[0]?.orderNumber ?? 'ORD-001')

  if (command === 'EN PUERTA' || command === 'ENTREGADO') {
    return [
      'Tienes mas de un pedido activo. Responde con el folio:',
      'EN PUERTA ' + firstOrder,
      'ENTREGADO ' + firstOrder,
      'Activos: ' + orderList,
    ].join('\n')
  }

  return 'Tienes varias ordenes activas (' + orderList + '). Responde ' + command + ' <FOLIO> para indicar la orden exacta.'
}

async function fetchOrdersByIds(orderIds: string[]): Promise<Array<Record<string, unknown>>> {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))]
  if (uniqueOrderIds.length === 0) {
    return []
  }

  const orders = await backendClient.fetch(ORDERS_BY_IDS_QUERY, { orderIds: uniqueOrderIds }) as Array<Record<string, unknown>>
  const orderMap = new Map(orders.map((order: Record<string, unknown>) => [String(order._id), order]))
  return uniqueOrderIds.map((orderId) => orderMap.get(orderId)).filter(Boolean) as Array<Record<string, unknown>>
}

async function clearPendingOfferForDriver(repartidorId: string, now: string, nextState: 'available' | 'busy' | 'offline') {
  await backendClient
    .patch(repartidorId)
    .set({
      estadoDisponibilidad: nextState,
      ultimaActividad: now,
    })
    .unset([
      'ultimoPedidoOfertado',
      'pedidosOfertados',
      'restauranteOferta',
      'ofertaTipo',
      'ofertaEnviadaAt',
      'ofertaExpiraAt',
    ])
    .commit()
}

async function clearCompetingOffers(orderIds: string[], acceptedDriverId: string, orderNumberLabel: string, now: string) {
  const competingDrivers: Array<{ _id: string; nombre: string; telefono: string }> = await backendClient.fetch(
    `*[_type == "repartidor" && _id != $acceptedDriverId && (ultimoPedidoOfertado._ref in $orderIds || count(pedidosOfertados[_ref in $orderIds]) > 0)]{
      _id,
      nombre,
      telefono
    }`,
    { acceptedDriverId, orderIds }
  )

  await Promise.allSettled(
    competingDrivers.map(async (driver) => {
      await clearPendingOfferForDriver(driver._id, now, 'available')
      await sendBotMessage(driver.telefono, `El pedido ${orderNumberLabel} ya fue tomado. Gracias por estar disponible!`)
    })
  )
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

// Meta envÃ­a los mensajes entrantes aquÃ­
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
    let buttonPayloadRaw: string | null = null
    let buttonTitleRaw: string | null = null
    let buttonOrderId: string | null = null

    if (message.type === 'text') {
      textBody = normalizeText((message.text as Record<string, unknown>)?.body as string ?? '')
    } else if (message.type === 'interactive') {
      const interactive = message.interactive as Record<string, unknown>
      const buttonReply = interactive?.button_reply as Record<string, unknown>
      buttonPayloadRaw = String(buttonReply?.id as string ?? '').trim() || null
      buttonTitleRaw = String(buttonReply?.title as string ?? '').trim() || null

      const parsedButton = parseButtonActionPayload(buttonPayloadRaw ?? buttonTitleRaw ?? '')
      textBody = parsedButton.action
      buttonOrderId = parsedButton.orderId

      console.info('[whatsapp webhook] payload recibido del boton', {
        traceId,
        messageType: message.type,
        buttonPayloadRaw,
        buttonTitleRaw,
      })
    } else if (message.type === 'button') {
      const btn = message.button as Record<string, unknown>
      buttonPayloadRaw = String(btn?.payload as string ?? '').trim() || null
      buttonTitleRaw = String(btn?.text as string ?? '').trim() || null

      const parsedButton = parseButtonActionPayload(buttonPayloadRaw ?? buttonTitleRaw ?? '')
      textBody = parsedButton.action
      buttonOrderId = parsedButton.orderId

      console.info('[whatsapp webhook] payload recibido del boton', {
        traceId,
        messageType: message.type,
        buttonPayloadRaw,
        buttonTitleRaw,
      })
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
      buttonOrderId,
    })
    console.info('[whatsapp webhook] action detectada', {
      traceId,
      action: textBody,
      orderId: buttonOrderId,
    })
    // #endregion

    // Verificar si el nÃºmero es un repartidor registrado
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
    console.info('[whatsapp webhook] repartidor detectado', {
      traceId,
      repartidorId: repartidor?._id,
      repartidorTelefono: repartidor?.telefono,
      repartidorNombre: repartidor?.nombre,
    })

    // Si no es repartidor â†’ ignorar silenciosamente
    if (!repartidor) {
      console.log(`[whatsapp webhook] NÃºmero desconocido ${fromPhone}, ignorando`)
      return NextResponse.json({ status: 'ok' })
    }

    const nowDate = new Date()
    const now = nowDate.toISOString()
    console.log(`[whatsapp webhook] Comando "${textBody}" de ${repartidor.nombre} (${fromPhone})`)
    // --- FIN ---
    if (textBody === 'FIN') {
      const pendingOrderIds = getPendingOfferOrderIds(repartidor)
      console.log('[webhook disponibilidad] FIN manual recibido', {
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
        pendingOrderIds,
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
          'ultimoPedidoOfertado',
          'pedidosOfertados',
          'restauranteOferta',
          'ofertaTipo',
          'ofertaEnviadaAt',
          'ofertaExpiraAt',
        ])
        .commit()

      const releasedOrderIds = await releaseOrdersForDriver(pendingOrderIds, repartidor._id, 'driver_fin')
      if (releasedOrderIds.length > 0) {
        void redispatchOrders(releasedOrderIds, [repartidor._id]).catch((error) =>
          console.error('[webhook FIN] Error redispatch:', error)
        )
      }

      void sendBotMessage(
        fromPhone,
        'Te desconectamos correctamente. Responde INICIO cuando quieras volver a estar disponible.'
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
          'ultimoPedidoOfertado',
          'pedidosOfertados',
          'restauranteOferta',
          'ofertaTipo',
          'ofertaEnviadaAt',
          'ofertaExpiraAt',
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
        console.log('[webhook disponibilidad] SelecciÃ³n invÃ¡lida de duraciÃ³n', {
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
      console.log('[webhook disponibilidad] SelecciÃ³n de duraciÃ³n confirmada', {
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
          'ultimoPedidoOfertado',
          'pedidosOfertados',
          'restauranteOferta',
          'ofertaTipo',
          'ofertaEnviadaAt',
          'ofertaExpiraAt',
        ])
        .commit()

      void dispatchWaitingOrdersForDriver(repartidor._id).catch((error) => {
        console.error('[webhook disponibilidad] Error reintentando ordenes en espera:', error)
      })

      void sendBotMessage(
        fromPhone,
        `Listo. EstÃ¡s disponible por ${formatDurationLabel(selectedSession.minutes)}.
Tu sesiÃ³n termina a las ${formatMexicoTime(sessionWindow.availableUntilIso)}.
Te avisaremos 10 minutos antes de finalizar.`
      ).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    if (repartidor.extensionPendiente) {
      if (textBody === '3') {
        console.log('[webhook disponibilidad] ExtensiÃ³n rechazada; termina en horario programado', {
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
          `Perfecto. Tu sesiÃ³n terminarÃ¡ a la hora programada.`
        ).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const extensionMinutes = EXTENSION_OPTIONS[textBody as keyof typeof EXTENSION_OPTIONS]
      if (!extensionMinutes) {
        console.log('[webhook disponibilidad] Respuesta invÃ¡lida a extensiÃ³n', {
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
      console.log('[webhook disponibilidad] ExtensiÃ³n aceptada', {
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
        `Listo. Extendimos tu disponibilidad ${formatDurationLabel(extensionMinutes)} mÃ¡s.`
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
        .set({ disponible: false, pendienteConfirmacion: false, estadoDisponibilidad: 'offline', ultimaActividad: now })
        .commit()

      void sendBotMessage(fromPhone, `Te hemos desconectado. Â¡Hasta pronto!`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- ACEPTO ---
    if (textBody === 'ACEPTO' || textBody === 'ACEPTAR' || textBody.startsWith('ACEPTO ') || textBody.startsWith('ACEPTAR ')) {
      const orderToken = extractOrderToken(textBody, textBody.startsWith('ACEPTAR') ? 'ACEPTAR' : 'ACEPTO')
      const offerOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, nowDate, orderToken)

      void backendClient.patch(repartidor._id).set({ ultimaActividad: now }).commit().catch(() => null)

      if (offerOrders.length === 0) {
        await clearPendingOfferForDriver(repartidor._id, now, getDriverNextState(repartidor, nowDate)).catch(() => null)
        await sendBotMessage(fromPhone, 'No tienes ninguna oferta vigente para aceptar.').catch(() => null)
        console.warn('[whatsapp webhook] intento de aceptar sin oferta valida', {
          repartidorId: repartidor._id,
          orderToken,
        })
        return NextResponse.json({ status: 'ok' })
      }

      try {
        for (const order of offerOrders as Array<Record<string, unknown>>) {
          await backendClient
            .patch(String(order._id))
            .ifRevisionId(String(order._rev))
            .set({
              repartidorAsignado: { _type: 'reference', _ref: repartidor._id },
              repartidorAsignadoAt: now,
              status: 'shipped',
              dispatchStatus: 'accepted',
              deliveryOfertaEnviada: false,
              updatedAt: now,
            })
            .unset(['deliveryOfertaExpiresAt', 'offeredTo'])
            .commit()

          console.log('[whatsapp webhook] oferta aceptada con orderId', {
            repartidorId: repartidor._id,
            orderId: order._id,
            orderNumber: order.orderNumber,
          })
        }

        await clearPendingOfferForDriver(repartidor._id, now, 'busy')
      } catch (patchError) {
        console.error('[whatsapp webhook] error asignando oferta', {
          repartidorId: repartidor._id,
          orderIds: offerOrders.map((order: Record<string, unknown>) => order._id),
          patchError,
        })
        return NextResponse.json({ status: 'ok' })
      }

      const orderNumbersLabel = offerOrders.map((order: Record<string, unknown>) => `#${order.orderNumber}`).join(', ')
      void clearCompetingOffers(
        offerOrders.map((order: Record<string, unknown>) => String(order._id)),
        repartidor._id,
        orderNumbersLabel,
        now
      ).catch((error) => console.error('[webhook ACEPTO] Error limpiando ofertas competidoras:', error))

      if (offerOrders.length > 1) {
        const restaurantName = String(offerOrders[0].storeName ?? 'La Tienda')
        const totalBundle = offerOrders.reduce((sum: number, order: Record<string, unknown>) => sum + Number(order.totalPrice ?? 0), 0)
        await sendBotMessage(
          fromPhone,
          `Bundle aceptado.\n\nRestaurante: ${restaurantName}\nPedidos: ${orderNumbersLabel}\nPago total estimado: ${totalBundle.toFixed(2)} MXN\n\nPara evitar errores, usa el folio al actualizar cada pedido:\nPEDIDO EN DIRECCION AL DOMICILIO <FOLIO>\nEN PUERTA <FOLIO>\nENTREGADO <FOLIO>`
        ).catch(() => null)
      } else {
        const order = offerOrders[0] as Record<string, unknown>
        const storeAddress = String(order.storeAddress ?? order.storeName ?? 'la tienda')
        const paymentMethodDisplay =
          order.paymentMethod === 'cash_on_delivery' || order.paymentMethod === 'cash_on_pickup'
            ? 'COBRAR EN EFECTIVO'
            : 'YA PAGADO'

        const restaurantMapsUrl = order.storeAddress
          ? `https://maps.google.com/maps?q=${encodeURIComponent(String(order.storeAddress))}`
          : `https://maps.google.com/maps?q=${encodeURIComponent(storeAddress)}`

        const clientAddressStr = buildClientAddress(order as { shippingAddress?: { line1?: string; street?: string; city?: string } })
        const clientMapsUrl = (order.shippingAddress as Record<string, string> | undefined)?.line1
          ? `https://maps.google.com/maps?q=${encodeURIComponent(String((order.shippingAddress as Record<string, string>).line1))}`
          : `https://maps.google.com/maps?q=${encodeURIComponent(clientAddressStr)}`

        const confirmationResults = await Promise.allSettled([
          sendConfirmacionRepartidor(
            fromPhone,
            String(order.orderNumber),
            String(order.storeName ?? 'La Tienda'),
            clientAddressStr,
            paymentMethodDisplay,
            restaurantMapsUrl,
            clientMapsUrl
          ),
        ])

        if (confirmationResults[0]?.status === 'rejected') {
          await sendBotMessage(
            fromPhone,
            `Pedido #${order.orderNumber} asignado. Recoge en ${order.storeName ?? 'La Tienda'} y entrega en ${clientAddressStr}. Pago: ${paymentMethodDisplay}.`
          ).catch(() => null)
        }
      }

      return NextResponse.json({ status: 'ok' })
    }
// --- RECHAZAR ---
    if (textBody === 'RECHAZAR' || textBody.startsWith('RECHAZAR ')) {
      const orderToken = extractOrderToken(textBody, 'RECHAZAR')
      const offerOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, nowDate, orderToken)
      const nextState = getDriverNextState(repartidor, nowDate)

      await clearPendingOfferForDriver(repartidor._id, now, nextState).catch(() => null)

      if (offerOrders.length > 0) {
        const releasedOrderIds = await releaseOrdersForDriver(
          offerOrders.map((order: Record<string, unknown>) => String(order._id)),
          repartidor._id,
          'driver_rejected_offer'
        )

        if (releasedOrderIds.length > 0) {
          await redispatchOrders(releasedOrderIds, [repartidor._id]).catch((error) => {
            console.error('[webhook RECHAZAR] Error redispatch:', error)
          })
        }

        console.log('[whatsapp webhook] oferta rechazada con orderIds', {
          repartidorId: repartidor._id,
          orderIds: releasedOrderIds,
        })
      }

      const responseMessage = offerOrders.length > 1
        ? 'Gracias. El bundle fue ofrecido a otro repartidor.'
        : 'Gracias, el pedido fue ofrecido a otro repartidor.'

      void sendBotMessage(fromPhone, responseMessage).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- PEDIDO EN DIRECCION AL DOMICILIO ---
    if (textBody === 'PEDIDO EN DIRECCION AL DOMICILIO' || textBody.startsWith('PEDIDO EN DIRECCION AL DOMICILIO ')) {
        const orderToken = extractOrderToken(textBody, 'PEDIDO EN DIRECCION AL DOMICILIO')
        const shippedOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id })
        const targetOrder = resolveExactAssignedOrder(shippedOrders as Array<Record<string, unknown>>, orderToken)

        if (!targetOrder) {
          if (!shippedOrders || shippedOrders.length === 0) {
            void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          } else {
            void sendBotMessage(fromPhone, getAmbiguousOrderPrompt('PEDIDO EN DIRECCION AL DOMICILIO', shippedOrders as Array<Record<string, unknown>>)).catch(() => null)
          }
          console.warn('[whatsapp webhook] intento de actualizar orden sin asignacion valida', {
            repartidorId: repartidor._id,
            accion: 'en_camino',
            orderToken,
          })
          return NextResponse.json({ status: 'ok' })
        }

        const notifications: Promise<unknown>[] = [
          sendRepartidorEnCamino(fromPhone, String((targetOrder as Record<string, unknown>).orderNumber), String((targetOrder as Record<string, unknown>)._id)),
        ]

        const customerPhone = normalizeWhatsAppPhone(String((targetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (targetOrder as Record<string, unknown>).customerName) {
          notifications.push(
            sendOrderOnTheWay(customerPhone, String((targetOrder as Record<string, unknown>).customerName), String((targetOrder as Record<string, unknown>).orderNumber))
          )
        }

        await Promise.allSettled(notifications)
        console.log('[whatsapp webhook] cliente notificado con orderId', {
          accion: 'en_camino',
          repartidorId: repartidor._id,
          orderId: (targetOrder as Record<string, unknown>)._id,
          orderNumber: (targetOrder as Record<string, unknown>).orderNumber,
        })

        return NextResponse.json({ status: 'ok' })
    }
// --- EN PUERTA ---
    if (textBody === 'EN PUERTA' || textBody.startsWith('EN PUERTA ')) {
        const orderToken = buttonOrderId ?? extractOrderToken(textBody, 'EN PUERTA')
        const targetOrder = buttonOrderId
          ? await resolveAssignedOrderById(buttonOrderId, repartidor._id)
          : null
        const shippedOrders = targetOrder
          ? [targetOrder]
          : await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id })
        const resolvedTargetOrder = targetOrder ?? resolveExactAssignedOrder(shippedOrders as Array<Record<string, unknown>>, orderToken)

        if (!resolvedTargetOrder) {
          if (!shippedOrders || shippedOrders.length === 0) {
            void sendBotMessage(fromPhone, 'No tienes ningun pedido en camino actualmente.').catch(() => null)
          } else {
            void sendBotMessage(fromPhone, getAmbiguousOrderPrompt('EN PUERTA', shippedOrders as Array<Record<string, unknown>>)).catch(() => null)
          }
          console.warn('[whatsapp webhook] accion rechazada por ambiguedad', {
            traceId,
            repartidorId: repartidor._id,
            accion: 'en_puerta',
            orderId: buttonOrderId,
            orderToken,
          })
          return NextResponse.json({ status: 'ok' })
        }

        await backendClient
          .patch(String((resolvedTargetOrder as Record<string, unknown>)._id))
          .ifRevisionId(String((resolvedTargetOrder as Record<string, unknown>)._rev))
          .set({ dispatchStatus: 'at_door', updatedAt: now })
          .commit()

        const notifications: Promise<unknown>[] = [
          sendRepartidorEnPuerta(fromPhone, String((resolvedTargetOrder as Record<string, unknown>).orderNumber), String((resolvedTargetOrder as Record<string, unknown>)._id)),
        ]

        const customerPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (resolvedTargetOrder as Record<string, unknown>).customerName) {
          notifications.push(
            sendClienteRepartidorEnPuerta(customerPhone, String((resolvedTargetOrder as Record<string, unknown>).customerName), String((resolvedTargetOrder as Record<string, unknown>).orderNumber))
          )
        }

        await Promise.allSettled(notifications)
        console.log('[whatsapp webhook] orden actualizada', { accion: 'en_puerta', orderId: (resolvedTargetOrder as Record<string, unknown>)._id, repartidorId: repartidor._id })
        console.log('[whatsapp webhook] en puerta con orderId', {
          repartidorId: repartidor._id,
          orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
          orderNumber: (resolvedTargetOrder as Record<string, unknown>).orderNumber,
        })

        return NextResponse.json({ status: 'ok' })
    }
// --- ENTREGADO ---
      if (textBody === 'ENTREGADO' || textBody.startsWith('ENTREGADO ')) {
        const orderToken = buttonOrderId ?? extractOrderToken(textBody, 'ENTREGADO')
        const targetOrder = buttonOrderId
          ? await resolveAssignedOrderById(buttonOrderId, repartidor._id)
          : null
        const shippedOrders = targetOrder
          ? [targetOrder]
          : await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id })
        const resolvedTargetOrder = targetOrder ?? resolveExactAssignedOrder(shippedOrders as Array<Record<string, unknown>>, orderToken)

        if (!resolvedTargetOrder) {
          if (!shippedOrders || shippedOrders.length === 0) {
            void sendBotMessage(fromPhone, 'No tienes ningun pedido en camino actualmente.').catch(() => null)
          } else {
            void sendBotMessage(fromPhone, getAmbiguousOrderPrompt('ENTREGADO', shippedOrders as Array<Record<string, unknown>>)).catch(() => null)
          }
          console.warn('[whatsapp webhook] accion rechazada por ambiguedad', {
            traceId,
            repartidorId: repartidor._id,
            accion: 'entregado',
            orderId: buttonOrderId,
            orderToken,
          })
          return NextResponse.json({ status: 'ok' })
        }

        try {
          await backendClient
            .patch(String((resolvedTargetOrder as Record<string, unknown>)._id))
            .ifRevisionId(String((resolvedTargetOrder as Record<string, unknown>)._rev))
            .set({ status: 'delivered', dispatchStatus: 'completed', deliveredAt: now, updatedAt: now })
            .commit()

          const remainingOrders = (await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>)
            .filter((order) => String(order._id) !== String((resolvedTargetOrder as Record<string, unknown>)._id))
          const nextState = remainingOrders.length > 0 ? 'busy' : getDriverNextState(repartidor, nowDate)

          await backendClient
            .patch(repartidor._id)
            .set({ estadoDisponibilidad: nextState, ultimaActividad: now })
            .commit()

          console.log('[whatsapp webhook] orden actualizada', { accion: 'entregado', orderId: (resolvedTargetOrder as Record<string, unknown>)._id, repartidorId: repartidor._id })
          console.log('[whatsapp webhook] entregado con orderId', {
            repartidorId: repartidor._id,
            orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
            orderNumber: (resolvedTargetOrder as Record<string, unknown>).orderNumber,
          })
          console.log('[whatsapp webhook] repartidor liberado', {
            repartidorId: repartidor._id,
            estadoDisponibilidad: nextState,
          })
        } catch (patchError) {
          console.error('[whatsapp webhook] error al marcar entregado', {
            repartidorId: repartidor._id,
            orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
            patchError,
          })
          return NextResponse.json({ status: 'ok' })
        }

        const customerPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (resolvedTargetOrder as Record<string, unknown>).customerName) {
          await sendOrderDelivered(customerPhone, String((resolvedTargetOrder as Record<string, unknown>).customerName), String((resolvedTargetOrder as Record<string, unknown>).orderNumber)).catch(() => null)
          console.log('[whatsapp webhook] cliente notificado con orderId', {
            accion: 'entregado',
            repartidorId: repartidor._id,
            orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
          })
        }

        void sendBotMessage(fromPhone, 'Pedido entregado correctamente. Gracias!').catch(() => null)

        return NextResponse.json({ status: 'ok' })
      }
// --- Cualquier otro mensaje de un repartidor registrado ---
      void sendBotMessage(
        fromPhone,
        `Comandos disponibles: INICIO, FIN, ACEPTO, RECHAZAR, PEDIDO EN DIRECCIÃ“N AL DOMICILIO, EN PUERTA, ENTREGADO.`
      ).catch(() => null)

  } catch (error) {
    console.error('[whatsapp webhook] Error:', error)
  }

  return NextResponse.json({ status: 'ok' })
}


















