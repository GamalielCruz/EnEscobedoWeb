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
import { redispatchOrders } from '@/lib/delivery-dispatch'

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
  paymentMethod,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
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
  paymentMethod,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
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
  orderNumber
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
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "storeId": affiliateStore._ref,
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

async function fetchOrdersByIds(orderIds: string[]) {
  const uniqueOrderIds = [...new Set(orderIds.filter(Boolean))]
  if (uniqueOrderIds.length === 0) {
    return []
  }

  const orders = await backendClient.fetch(ORDERS_BY_IDS_QUERY, { orderIds: uniqueOrderIds })
  const orderMap = new Map(orders.map((order: Record<string, unknown>) => [String(order._id), order]))
  return uniqueOrderIds.map((orderId) => orderMap.get(orderId)).filter(Boolean)
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
          'ultimoPedidoOfertado',
          'pedidosOfertados',
          'restauranteOferta',
          'ofertaTipo',
          'ofertaEnviadaAt',
          'ofertaExpiraAt',
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
          'ultimoPedidoOfertado',
          'pedidosOfertados',
          'restauranteOferta',
          'ofertaTipo',
          'ofertaEnviadaAt',
          'ofertaExpiraAt',
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
        .set({ disponible: false, pendienteConfirmacion: false, estadoDisponibilidad: 'offline', ultimaActividad: now })
        .commit()

      void sendBotMessage(fromPhone, `Te hemos desconectado. ¡Hasta pronto!`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- ACEPTO (sin número — usa la oferta pendiente del repartidor) ---
    if (textBody === 'ACEPTO' || textBody === 'ACEPTAR') {
      console.log(`[whatsapp webhook] ACEPTO de ${repartidor.nombre}`)

      void backendClient
        .patch(repartidor._id)
        .set({ ultimaActividad: now })
        .commit()
        .catch(() => null)

      const pendingOrderIds = getPendingOfferOrderIds(repartidor)
      const pendingOrders = pendingOrderIds.length > 0
        ? await fetchOrdersByIds(pendingOrderIds)
        : []

      const fallbackOrder = pendingOrders.length === 0
        ? (repartidor.ultimoPedidoOfertadoRef
            ? await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId: repartidor.ultimoPedidoOfertadoRef })
            : await backendClient.fetch(LATEST_OPEN_OFFER_QUERY))
        : null

      const orders = pendingOrders.length > 0
        ? pendingOrders
        : fallbackOrder
          ? [fallbackOrder]
          : []

      console.info('[whatsapp webhook][debug] accept-order-resolution', {
        traceId,
        repartidorId: repartidor._id,
        pendingOrderIds,
        orderFound: orders.length > 0,
        orderIds: orders.map((order: Record<string, unknown>) => order._id),
        orderNumbers: orders.map((order: Record<string, unknown>) => order.orderNumber),
      })

      if (orders.length === 0) {
        await sendBotMessage(fromPhone, `No tienes ningun pedido pendiente de aceptar.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const unavailableOrder = orders.find(
        (order: Record<string, unknown>) =>
          order.deliveryOfertaEnviada !== true ||
          order.repartidorAsignadoRef ||
          order.status === 'delivered' ||
          order.status === 'cancelled'
      )

      if (unavailableOrder) {
        console.log('[whatsapp webhook] conflicto de timing detectado', {
          repartidorId: repartidor._id,
          unavailableOrderId: unavailableOrder._id,
          orderNumber: unavailableOrder.orderNumber,
        })
        await clearPendingOfferForDriver(repartidor._id, now, 'available').catch(() => null)
        await sendBotMessage(fromPhone, `Lo sentimos, esta oferta ya no esta disponible.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      try {
        for (const order of orders as Array<Record<string, unknown>>) {
          await backendClient
            .patch(String(order._id))
            .ifRevisionId(String(order._rev))
            .set({
              repartidorAsignado: { _type: 'reference', _ref: repartidor._id },
              repartidorAsignadoAt: now,
              status: 'shipped',
              deliveryOfertaEnviada: false,
              updatedAt: now,
            })
            .unset(['deliveryOfertaExpiresAt'])
            .commit()
        }

        await clearPendingOfferForDriver(repartidor._id, now, 'busy')
      } catch (patchError) {
        console.error('[whatsapp webhook][debug] accept-assign-failure', {
          traceId,
          repartidorId: repartidor._id,
          orderIds: orders.map((order: Record<string, unknown>) => order._id),
          patchError,
        })
        console.log('[whatsapp webhook] conflicto de timing detectado', {
          repartidorId: repartidor._id,
          orderIds: orders.map((order: Record<string, unknown>) => order._id),
        })
        return NextResponse.json({ status: 'ok' })
      }

      const orderNumbersLabel = orders.map((order: Record<string, unknown>) => `#${order.orderNumber}`).join(', ')
      void clearCompetingOffers(
        orders.map((order: Record<string, unknown>) => String(order._id)),
        repartidor._id,
        orderNumbersLabel,
        now
      ).catch((error) => console.error('[webhook ACEPTO] Error limpiando ofertas competidoras:', error))

      if (orders.length > 1) {
        const restaurantName = String(orders[0].storeName ?? 'La Tienda')
        const totalBundle = orders.reduce((sum: number, order: Record<string, unknown>) => sum + Number(order.totalPrice ?? 0), 0)
        await sendBotMessage(
          fromPhone,
          `Bundle aceptado.\n\nRestaurante: ${restaurantName}\nPedidos: ${orderNumbersLabel}\nPago total estimado: ${totalBundle.toFixed(2)} MXN\n\nCuando salgas, responde PEDIDO EN DIRECCION AL DOMICILIO.`
        ).catch(() => null)
        console.log('[whatsapp webhook] bundle aceptado', {
          repartidorId: repartidor._id,
          repartidorNombre: repartidor.nombre,
          orderIds: orders.map((order: Record<string, unknown>) => order._id),
        })
      } else {
        const order = orders[0] as Record<string, unknown>
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

        const [confirmationResult] = confirmationResults
        if (confirmationResult?.status === 'rejected') {
          console.error('[webhook ACEPTO] Error sendConfirmacionRepartidor:', confirmationResult.reason)
          await sendBotMessage(
            fromPhone,
            `Pedido #${order.orderNumber} asignado. Recoge en ${order.storeName ?? 'La Tienda'} y entrega en ${clientAddressStr}. Pago: ${paymentMethodDisplay}.`
          ).catch(() => null)
        }

        console.log(`[whatsapp webhook] Pedido ${order.orderNumber} asignado a ${repartidor.nombre}`)
      }

      return NextResponse.json({ status: 'ok' })
    }
// --- RECHAZAR ---
    if (textBody === 'RECHAZAR') {
      const pendingOrderIds = getPendingOfferOrderIds(repartidor)
      const pendingOrders = await fetchOrdersByIds(pendingOrderIds)

      await clearPendingOfferForDriver(repartidor._id, now, 'available').catch(() => null)

      if (pendingOrderIds.length > 1) {
        console.log('[whatsapp webhook] bundle rechazado', {
          repartidorId: repartidor._id,
          repartidorNombre: repartidor.nombre,
          orderIds: pendingOrderIds,
        })
      }

      if (pendingOrderIds.length > 0) {
        await redispatchOrders(pendingOrderIds, [repartidor._id]).catch((error) => {
          console.error('[webhook RECHAZAR] Error redispatch:', error)
        })
      }

      const responseMessage = pendingOrders.length > 1
        ? 'Gracias. El bundle fue ofrecido a otro repartidor.'
        : 'Gracias, el pedido fue ofrecido a otro repartidor.'

      void sendBotMessage(fromPhone, responseMessage).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- PEDIDO EN DIRECCION AL DOMICILIO ---
    if (textBody === 'PEDIDO EN DIRECCION AL DOMICILIO') {
        const shippedOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id })

        if (!shippedOrders || shippedOrders.length === 0) {
          console.log(`[whatsapp webhook] Sin pedido shipped para ${repartidor.nombre} al marcar EN_CAMINO`)
          void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        const notifications: Promise<unknown>[] = [
          sendRepartidorEnCamino(fromPhone, String(shippedOrders[0].orderNumber)),
        ]

        for (const shippedOrder of shippedOrders as Array<Record<string, unknown>>) {
          const customerPhone = normalizeWhatsAppPhone(String(shippedOrder.phone ?? ''))
          if (customerPhone && shippedOrder.customerName) {
            notifications.push(
              sendOrderOnTheWay(customerPhone, String(shippedOrder.customerName), String(shippedOrder.orderNumber))
            )
          } else {
            console.warn(
              `[webhook EN_CAMINO] Telefono cliente invalido u omitido para pedido ${shippedOrder.orderNumber}:`,
              shippedOrder.phone
            )
          }
        }

        const results = await Promise.allSettled(notifications)
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const label = index === 0 ? 'sendRepartidorEnCamino' : 'sendOrderOnTheWay'
            console.error(`[webhook EN_CAMINO] Error ${label}:`, result.reason)
          }
        })

        console.log('[whatsapp webhook] Notificaciones EN_CAMINO procesadas', {
          repartidorId: repartidor._id,
          orderNumbers: shippedOrders.map((order: Record<string, unknown>) => order.orderNumber),
        })

        return NextResponse.json({ status: 'ok' })
    }
// --- EN PUERTA ---
    if (textBody === 'EN PUERTA') {
        const shippedOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id })

        if (!shippedOrders || shippedOrders.length === 0) {
          console.log(`[whatsapp webhook] Sin pedido shipped para ${repartidor.nombre} al marcar EN_PUERTA`)
          void sendBotMessage(fromPhone, 'No tienes ningún pedido en camino actualmente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        const notifications: Promise<unknown>[] = [
          sendRepartidorEnPuerta(fromPhone, String(shippedOrders[0].orderNumber)),
        ]

        for (const shippedOrder of shippedOrders as Array<Record<string, unknown>>) {
          const customerPhone = normalizeWhatsAppPhone(String(shippedOrder.phone ?? ''))
          if (customerPhone && shippedOrder.customerName) {
            notifications.push(
              sendClienteRepartidorEnPuerta(customerPhone, String(shippedOrder.customerName), String(shippedOrder.orderNumber))
            )
          } else {
            console.warn(
              `[webhook EN_PUERTA] Telefono cliente invalido u omitido para pedido ${shippedOrder.orderNumber}:`,
              shippedOrder.phone
            )
          }
        }

        const results = await Promise.allSettled(notifications)
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const label = index === 0 ? 'sendRepartidorEnPuerta' : 'sendClienteRepartidorEnPuerta'
            console.error(`[webhook EN_PUERTA] Error ${label}:`, result.reason)
          }
        })

        console.log('[whatsapp webhook] Notificaciones EN_PUERTA procesadas', {
          repartidorId: repartidor._id,
          orderNumbers: shippedOrders.map((order: Record<string, unknown>) => order.orderNumber),
        })

        return NextResponse.json({ status: 'ok' })
    }
// --- ENTREGADO — confirmar entrega del pedido en curso ---
      if (textBody === 'ENTREGADO') {
        const shippedOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id })

        if (!shippedOrders || shippedOrders.length === 0) {
          console.log(`[whatsapp webhook] Sin pedido shipped para ${repartidor.nombre} al marcar ENTREGADO`)
          void sendBotMessage(
            fromPhone,
            'No tienes ningún pedido en camino actualmente.'
          ).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        try {
          for (const shippedOrder of shippedOrders as Array<Record<string, unknown>>) {
            await backendClient
              .patch(String(shippedOrder._id))
              .ifRevisionId(String(shippedOrder._rev))
              .set({ status: 'delivered', updatedAt: now })
              .commit()
          }

          await backendClient
            .patch(repartidor._id)
            .set({ estadoDisponibilidad: 'available', ultimaActividad: now })
            .commit()
        } catch (patchError) {
          console.log('[whatsapp webhook] conflicto de timing detectado', {
            repartidorId: repartidor._id,
            orderIds: shippedOrders.map((order: Record<string, unknown>) => order._id),
          })
          return NextResponse.json({ status: 'ok' })
        }

        const notifications: Promise<unknown>[] = []
        for (const shippedOrder of shippedOrders as Array<Record<string, unknown>>) {
          const customerPhone = normalizeWhatsAppPhone(String(shippedOrder.phone ?? ''))
          if (customerPhone && shippedOrder.customerName) {
            notifications.push(
              sendOrderDelivered(customerPhone, String(shippedOrder.customerName), String(shippedOrder.orderNumber))
            )
          } else {
            console.warn(
              `[webhook ENTREGADO] Telefono cliente invalido u omitido para pedido ${shippedOrder.orderNumber}:`,
              shippedOrder.phone
            )
          }
        }

        const results = await Promise.allSettled(notifications)
        results.forEach((result) => {
          if (result.status === 'rejected') {
            console.error('[webhook ENTREGADO] Error sendOrderDelivered:', result.reason)
          }
        })

        void sendBotMessage(
          fromPhone,
          'Pedido entregado correctamente. Gracias!'
        ).catch(() => null)

        console.log('[whatsapp webhook] Pedido(s) marcado(s) ENTREGADO', {
          repartidorId: repartidor._id,
          orderNumbers: shippedOrders.map((order: Record<string, unknown>) => order.orderNumber),
        })

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













