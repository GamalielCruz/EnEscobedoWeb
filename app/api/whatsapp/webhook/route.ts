import { after, NextRequest, NextResponse } from 'next/server'
import { backendClient } from '@/sanity/lib/backendClient'
import {
  sendBotMessage,
  sendOrderOnTheWay,
  sendOrderDelivered,
  normalizeWhatsAppPhone,
  sendDriverConfirmation,
  sendRepartidorEnCamino,
  sendRepartidorEnPuerta,
  sendClienteRepartidorEnPuerta,
  sendOrderCancelled,
  sendPickupReadyForCustomer,
  sendWhatsAppMessage,
} from '@/lib/whatsapp'
import {
  sendMandadoClienteRecogido,
  sendMandadoDestinatarioEnCamino,
  sendMandadoOrdenPorCompletar,
} from '@/lib/mandado-whatsapp'
import { dispatchWaitingOrdersForDriver, redispatchOrders, releaseOrdersForDriver } from '@/lib/delivery-dispatch'
import { notifyRestaurantDriverEnRoute } from '@/lib/restaurant-notifications'
import { appendOrderEvent } from '@/lib/order-events'
import { resolveSettlementStatusOnDelivery } from '@/lib/order-state'
import { buildAddressMapsUrl } from '@/lib/order-maps'
import { buildStoreMapsUrl } from '@/lib/order-pricing'
import { syncBaserowOrderById } from '@/lib/baserow'
import { isDeliveryPinValid, revealDeliveryPin } from '@/lib/delivery-pin'
import { parseDeliveryPinCommand } from '@/lib/delivery-pin-command'
import { verifyWhatsAppSignature } from '@/lib/whatsapp-webhook'
import { getDeliveryScheduleConfig } from '@/lib/delivery-schedule-config'
import { getStoreAvailability, validateFulfillmentSelection } from '@/lib/fulfillment-schedule'
import { calculatePickupConversionFinancials } from '@/lib/scheduled-order-contingency'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN
const ADMIN_PHONE = process.env.ADMIN_WHATSAPP_PHONE
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
const DELIVERY_PIN_MAX_ATTEMPTS = 5
const DELIVERY_PIN_LOCK_MS = 15 * 60 * 1000
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

const REPARTIDOR_BY_ID_QUERY = `*[_type == "repartidor" && _id == $repartidorId][0]{
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
  orderStatus,
  fulfillmentTiming,
  paymentMethod,
  paymentProvider,
  paymentStatus,
  settlementStatus,
  cashCollectedBy,
  deliveryPinHash,
  deliveryPinCiphertext,
  deliveryPinExpiresAt,
  deliveryPinAttemptCount,
  deliveryPinLockedUntil,
  deliveryVerificationMethod,
  deliveryVerificationStatus,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  serviceKind,
  mandadoOrigin,
  mandadoDestination,
  mandadoRecipientPhone,
  "storeId": affiliateStore._ref,
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label),
  "storeCoordinates": coalesce(affiliateStore->coordinates, {"latitude": mandadoOrigin.lat, "longitude": mandadoOrigin.lng}),
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "shippingAddress": shippingAddress
}`

const ACTIVE_OFFER_ORDERS_BY_DRIVER_QUERY = `*[
  _type == "order" &&
  deliveryOfertaEnviada == true &&
  dispatchStatus == "offered" &&
  offeredTo._ref == $repartidorId &&
  !defined(repartidorAsignado) &&
  status != "delivered" &&
  status != "cancelled" &&
  defined(deliveryOfertaExpiresAt) &&
  deliveryOfertaExpiresAt > $now
] | order(orderDate asc)[0...2]{
  _id,
  _rev,
  orderNumber,
  customerName,
  phone,
  status,
  dispatchStatus,
  fulfillmentTiming,
  paymentMethod,
  paymentProvider,
  paymentStatus,
  settlementStatus,
  cashCollectedBy,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  serviceKind,
  mandadoOrigin,
  mandadoDestination,
  mandadoRecipientPhone,
  "storeId": affiliateStore._ref,
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label),
  "storeCoordinates": coalesce(affiliateStore->coordinates, {"latitude": mandadoOrigin.lat, "longitude": mandadoOrigin.lng}),
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "shippingAddress": shippingAddress,
  deliveryNotes
}`

const PICKUP_ORDER_BY_ID_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  _rev,
  orderNumber,
  orderType,
  customerName,
  phone,
  orderStatus,
  paymentMethod,
  paymentProvider,
  paymentStatus,
  dispatchStatus,
  settlementStatus,
  "storePhone": coalesce(pickupStore->contact.phone, affiliateStore->contact.phone),
  "storeName": coalesce(pickupStore->name, affiliateStore->name),
  "storeAddress": coalesce(pickupStore->address.street, affiliateStore->address.street),
  "storeCoordinates": coalesce(pickupStore->coordinates, affiliateStore->coordinates)
}`
const ACTIVE_SHIPPED_ORDERS_QUERY = `*[_type == "order" && repartidorAsignado._ref == $repartidorId && status == "shipped"] | order(orderDate asc){
  _id,
  _rev,
  phone,
  customerName,
  orderNumber,
  status,
  dispatchStatus,
  orderStatus,
  paymentMethod,
  paymentProvider,
  paymentStatus,
  settlementStatus,
  cashCollectedBy,
  deliveryPinHash,
  deliveryPinCiphertext,
  deliveryPinExpiresAt,
  deliveryPinAttemptCount,
  deliveryPinLockedUntil,
  deliveryVerificationMethod,
  deliveryVerificationStatus,
  serviceKind,
  mandadoOrigin,
  mandadoDestination,
  mandadoRecipientPhone,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label),
  "shippingAddress": shippingAddress,
  deliveryNotes
}`

// Busca repartidor probando telefono normalizado y luego raw
async function findRepartidor(fromPhone: string) {
  const normalizedPhone = normalizeWhatsAppPhone(fromPhone)

  if (normalizedPhone) {
    const rep = await backendClient.fetch(REPARTIDOR_BY_PHONE_QUERY, { telefono: normalizedPhone })
    if (rep) return rep
  }

  return backendClient.fetch(REPARTIDOR_BY_PHONE_QUERY, { telefono: fromPhone })
}

async function findRepartidorById(repartidorId: string) {
  return backendClient.fetch(REPARTIDOR_BY_ID_QUERY, { repartidorId })
}

function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function isValidCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
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
  return `Cuanto tiempo estaras disponible?

1. 1 hora
2. 2 horas
3. 4 horas
4. 6 horas
5. 8 horas

Responde con el numero de la opcion.`
}

function getInvalidSessionSelectionPrompt(): string {
  return `No pude entender la opcion.

Responde solo con un numero:

1. 1 hora
2. 2 horas
3. 4 horas
4. 6 horas
5. 8 horas`
}

function getExtensionPrompt(): string {
  return `Tu sesion termina en aproximadamente 10 minutos.

Quieres extender tu disponibilidad?

1. Extender 1 hora
2. Extender 2 horas
3. Terminar al finalizar`
}

function getInvalidExtensionPrompt(): string {
  return `No pude entender la opcion.

Responde solo con un numero:

1. Extender 1 hora
2. Extender 2 horas
3. Terminar al finalizar`
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
  shippingAddress?: { line1?: string; street?: string; city?: string; latitude?: number; longitude?: number }
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
  const validOrders = await backendClient.fetch(
    ACTIVE_OFFER_ORDERS_BY_DRIVER_QUERY,
    { repartidorId: String(repartidor._id), now: nowDate.toISOString() }
  ) as Array<Record<string, unknown>>

  if (orderToken) {
    const matchingOrder = validOrders.find((order) => String(order.orderNumber) === orderToken)
    if (!matchingOrder) {
      return []
    }

    return String(repartidor.ofertaTipo ?? '') === 'bundle' ? validOrders : [matchingOrder]
  }

  return validOrders
}

function resolveExactAssignedOrder(orders: Array<Record<string, unknown>>, orderToken?: string | null) {
  if (orderToken) {
    return orders.find((order) => String(order.orderNumber).toUpperCase() === orderToken.toUpperCase()) ?? null
  }

  return orders.length === 1 ? orders[0] : null
}

function shouldAcceptBundleOffer(repartidor: Record<string, unknown>, offerOrders: Array<Record<string, unknown>>) {
  return offerOrders.length > 1 && String(repartidor.ofertaTipo ?? '') === 'bundle'
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
      'Tienes mas de un pedido activo. Responde con el folio exacto:',
      'EN PUERTA ' + firstOrder,
      'ENTREGADO ' + firstOrder,
      'Activos: ' + orderList,
    ].join('\n')
  }

  return 'Tienes varias ordenes activas (' + orderList + '). Responde ' + command + ' <FOLIO> para indicar la orden exacta.'
}

function buildOfferStatusMessage(offerOrders: Array<Record<string, unknown>>) {
  if (offerOrders.length === 0) {
    return 'No tienes ofertas vigentes en este momento.'
  }

  if (offerOrders.length === 1) {
    const order = offerOrders[0]
    return `Tienes 1 oferta vigente.\nFolio: #${order.orderNumber}\nRestaurante: ${order.storeName ?? 'La Tienda'}\nResponde ACEPTO para tomarla o RECHAZAR para liberarla.`
  }

  const offersLabel = offerOrders.map((order) => `#${order.orderNumber} (${order.storeName ?? 'La Tienda'})`).join(', ')
  return `Tienes ${offerOrders.length} ofertas vigentes.\n${offersLabel}\nResponde ACEPTO <FOLIO> para elegir una.`
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

function resolveDeliveredSettlement(order: Record<string, unknown>) {
  return resolveSettlementStatusOnDelivery({
    paymentProvider: String(order.paymentProvider ?? ''),
    paymentMethod: String(order.paymentMethod ?? ''),
    paymentStatus: String(order.paymentStatus ?? ''),
    cashCollectedBy: String(order.cashCollectedBy ?? ''),
    settlementStatus: String(order.settlementStatus ?? ''),
    orderStatus: 'delivered',
  })
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
async function handlePickupRestaurantAction(action: string, orderId: string | null, fromPhone: string, now: string) {
  if (!orderId || (action !== 'ORDEN LISTA PICKUP' && action !== 'CANCELAR PICKUP')) {
    return false
  }

  const order = await backendClient.fetch(PICKUP_ORDER_BY_ID_QUERY, { orderId }) as Record<string, unknown> | null
  if (!order || order.orderType !== 'pickup') {
    console.warn('[whatsapp webhook] accion pickup rechazada: orden invalida', { action, orderId })
    return true
  }

  const from = normalizeWhatsAppPhone(fromPhone)
  const storePhone = normalizeWhatsAppPhone(String(order.storePhone ?? ''))
  if (storePhone && from && storePhone !== from) {
    console.warn('[whatsapp webhook] accion pickup rechazada: telefono no corresponde a tienda', { action, orderId })
    return true
  }

  const customerPhone = normalizeWhatsAppPhone(String(order.phone ?? ''))
  const customerName = String(order.customerName ?? 'Cliente')
  const orderNumber = String(order.orderNumber ?? '')
  const storeName = String(order.storeName ?? 'Restaurante')
  const storeMapsUrl = buildStoreMapsUrl({
    name: storeName,
    address: { street: String(order.storeAddress ?? "") },
    coordinates: order.storeCoordinates as { latitude?: string | number; longitude?: string | number } | undefined,
  })

  if (action === 'ORDEN LISTA PICKUP') {
    await backendClient
      .patch(String(order._id))
      .ifRevisionId(String(order._rev))
      .set({
        status: 'ready_for_pickup',
        orderStatus: 'ready_for_pickup',
        pickupStatus: 'ready_for_pickup',
        dispatchStatus: 'not_required',
        readyAt: now,
        updatedAt: now,
      })
      .commit()

    after(() => syncBaserowOrderById(String(order._id)))
    await appendOrderEvent(String(order._id), { type: 'ready_for_pickup', source: 'whatsapp/webhook', actor: 'store' })
    if (customerPhone) {
      await sendPickupReadyForCustomer(customerPhone, orderNumber, storeName, storeMapsUrl).catch(() => null)
    }
    return true
  }

  const isStripeOrder = order.paymentProvider === 'stripe'
  await backendClient
    .patch(String(order._id))
    .ifRevisionId(String(order._rev))
    .set({
      status: 'cancelled',
      orderStatus: 'cancelled',
      pickupStatus: 'expired',
      dispatchStatus: 'not_required',
      paymentStatus: isStripeOrder ? 'requires_refund' : order.paymentStatus,
      requiresStripeReconciliation: isStripeOrder,
      stripeFee: isStripeOrder ? order.stripeFee : 0,
      cancelledAt: now,
      updatedAt: now,
    })
    .commit()

  after(() => syncBaserowOrderById(String(order._id)))
  await appendOrderEvent(String(order._id), { type: 'cancelled', source: 'whatsapp/webhook', actor: 'store', reason: 'store_cancelled_pickup' })
  if (isStripeOrder) {
    await appendOrderEvent(String(order._id), { type: 'refund_required', source: 'whatsapp/webhook', actor: 'store', reason: 'stripe_pickup_cancelled' })
  }
  if (customerPhone) {
    await sendOrderCancelled(customerPhone, customerName, orderNumber).catch(() => null)
  }
  return true
}

async function handleScheduledCustomerAction(
  action: string,
  orderId: string | null,
  fromPhone: string,
  now: string
) {
  if (!orderId || !['SCHEDULE WAIT', 'SCHEDULE PICKUP', 'SCHEDULE HELP'].includes(action)) {
    return false
  }

  let order = await backendClient.fetch(
    `*[_type == "order" && _id == $orderId][0]{
      _id,
      _rev,
      orderNumber,
      customerName,
      phone,
      orderType,
      orderStatus,
      status,
      paymentStatus,
      paymentProvider,
      paymentMethod,
      fulfillmentTiming,
      scheduledSlot,
      scheduleCustomerChoice,
      repartidorAsignado,
      "offeredToRef": offeredTo._ref,
      productsSubtotal,
      shippingFee,
      platformServiceFee,
      discount,
      tax,
      platformCommission,
      stripeFee,
      grossTotal,
      totalPrice,
      "store": affiliateStore->{
        _id,
        name,
        contact,
        isActive,
        isOpen,
        manualOperationalStatus,
        operatingHours,
        serviceTypes,
        deliveryTimeMin,
        scheduledOrdersEnabled,
        minimumPreparationMinutes,
        scheduledOrderIntervalMinutes,
        maximumScheduledDays,
        lastDeliveryOrderMinutesBeforeClose,
        lastPickupOrderMinutesBeforeClose
      },
      orderEvents
    }`,
    { orderId }
  ) as Record<string, any> | null

  if (
    !order ||
    normalizeWhatsAppPhone(fromPhone) !== normalizeWhatsAppPhone(order.phone) ||
    order.fulfillmentTiming !== 'scheduled' ||
    order.orderType !== 'delivery' ||
    order.repartidorAsignado ||
    ['cancelled', 'delivered', 'completed'].includes(String(order.orderStatus || order.status))
  ) {
    console.warn('[whatsapp webhook] accion programada rechazada', { action, orderId })
    return true
  }

  const idempotencyKey = `${orderId}:${action}`
  const choice = action === 'SCHEDULE WAIT'
    ? 'wait_for_driver'
    : action === 'SCHEDULE PICKUP'
      ? 'pickup'
      : 'help'
  if (order.scheduleCustomerChoice === choice) return true
  const alreadyHandled = (order.orderEvents ?? []).some((event: Record<string, unknown>) => {
    if (!event.payloadJson) return false
    try {
      return JSON.parse(String(event.payloadJson)).idempotencyKey === idempotencyKey
    } catch {
      return false
    }
  })
  if (alreadyHandled) return true

  if (action === 'SCHEDULE WAIT') {
    await backendClient.patch(orderId).ifRevisionId(order._rev).set({
      scheduleCustomerChoice: 'wait_for_driver',
      scheduleCustomerChoiceAt: now,
      updatedAt: now,
    }).commit()
    await appendOrderEvent(orderId, {
      type: 'manual_admin_action',
      source: 'whatsapp/webhook',
      actor: 'customer',
      reason: 'customer_waits_for_driver',
      payload: { idempotencyKey },
    })
    await redispatchOrders([orderId])
    return true
  }

  if (action === 'SCHEDULE HELP') {
    await backendClient.patch(orderId).ifRevisionId(order._rev).set({
      scheduleCustomerChoice: 'help',
      scheduleCustomerChoiceAt: now,
      customerHelpRequested: true,
      scheduleRiskLevel: 'contingency',
      updatedAt: now,
    }).commit()
    await appendOrderEvent(orderId, {
      type: 'manual_admin_action',
      source: 'whatsapp/webhook',
      actor: 'customer',
      reason: 'customer_requested_help',
      payload: { idempotencyKey },
    })
    return true
  }

  if (order.store?.serviceTypes?.pickup !== true) return true
  const config = await getDeliveryScheduleConfig()
  const pickupAvailability = getStoreAvailability({
    store: order.store,
    config,
    fulfillmentType: 'pickup',
    now: new Date(now),
  })
  validateFulfillmentSelection(pickupAvailability, {
    timing: 'scheduled',
    scheduledSlot: {
      startAt: order.scheduledSlot.startAt,
      endAt: order.scheduledSlot.endAt,
    },
  })

  if (order.offeredToRef) {
    await releaseOrdersForDriver([orderId], String(order.offeredToRef), 'customer_changed_to_pickup')
    const refreshed = await backendClient.fetch<{ _rev: string }>(
      `*[_type == "order" && _id == $orderId][0]{ _rev }`,
      { orderId }
    )
    order._rev = refreshed._rev
  }

  const shippingFee = Number(order.shippingFee ?? 0)
  const needsPartialRefund = order.paymentProvider === 'stripe' && shippingFee > 0
  const financials = calculatePickupConversionFinancials({
    productsSubtotal: Number(order.productsSubtotal ?? 0),
    discount: Number(order.discount ?? 0),
    tax: Number(order.tax ?? 0),
    platformCommission: Number(order.platformCommission ?? 0),
    platformServiceFee: Number(order.platformServiceFee ?? 0),
    stripeFee: Number(order.stripeFee ?? 0),
    shippingFee,
    paidWithStripe: order.paymentProvider === 'stripe',
  })

  await backendClient.patch(orderId).ifRevisionId(String(order._rev)).set({
    orderType: 'pickup',
    fulfillmentType: 'pickup',
    fulfillmentProvider: 'pickup',
    fulfillmentProviderSnapshot: { provider: 'pickup', restaurantName: order.store?.name || 'Restaurante' },
    dispatchStatus: 'not_required',
    driverType: 'none',
    driverPayout: financials.driverPayout,
    shippingFee: financials.shippingFee,
    shippingCost: 0,
    totalPrice: financials.grossTotal,
    grossTotal: financials.grossTotal,
    stripeNetAmount: financials.stripeNetAmount,
    storeNetTotal: financials.storeNetTotal,
    platformNetTotal: financials.platformNetTotal,
    cashCollectedBy: order.paymentProvider === 'stripe' ? 'none' : 'store',
    scheduleCustomerChoice: 'pickup',
    scheduleCustomerChoiceAt: now,
    customerPickupConsentAt: now,
    requiresStripeReconciliation: needsPartialRefund,
    refundStatus: needsPartialRefund ? 'requested' : 'not_requested',
    ...(needsPartialRefund
      ? {
          refundAmount: financials.refundAmount,
          refundReason: 'Cambio de entrega programada a recoleccion',
        }
      : {}),
    updatedAt: now,
  }).unset([
    'offeredTo',
    'deliveryOfertaExpiresAt',
    'deliveryOfertaEnviada',
    'repartidorAsignado',
    'repartidorAsignadoAt',
  ]).commit()

  await appendOrderEvent(orderId, {
    type: 'scheduled_order_changed_to_pickup',
    source: 'whatsapp/webhook',
    actor: 'customer',
    payload: { idempotencyKey, previousShippingFee: shippingFee, grossTotal: financials.grossTotal },
  })
  after(() => syncBaserowOrderById(orderId))
  if (order.store?.contact?.phone) {
    await sendWhatsAppMessage(
      String(order.store.contact.phone),
      `El pedido #${order.orderNumber} cambio a recoleccion con consentimiento del cliente.`
    ).catch(() => null)
  }
  return true
}
// Acciones del cliente desde plantillas de Mandados (boton Ayuda de orden_repartidor
// y los botones de contingencia de cliente_entrega_programada_sin_repartidor).
async function handleMandadoCustomerAction(
  action: string,
  orderId: string | null,
  fromPhone: string,
  now: string
) {
  // El action llega normalizado (los guiones bajos se convierten en espacios),
  // por eso se aceptan ambas formas: MANDADO AYUDA / MANDADO_AYUDA.
  const isHelpAction = action === 'MANDADO AYUDA' || action === 'MANDADO_AYUDA'
  const isContingencyAction = ['SCHEDULE WAIT', 'SCHEDULE PICKUP', 'SCHEDULE HELP'].includes(action)
  if (!orderId || (!isHelpAction && !isContingencyAction)) {
    return false
  }

  const order = await backendClient.fetch(
    `*[_type == "order" && _id == $orderId][0]{
      _id,
      _rev,
      orderNumber,
      customerName,
      phone,
      serviceKind,
      status,
      orderStatus,
      repartidorAsignado,
      scheduleCustomerChoice,
      orderEvents
    }`,
    { orderId }
  ) as Record<string, any> | null

  // MANDADO AYUDA se envía en EN PUERTA (cuando ya hay repartidor asignado),
  // por lo que el guard de repartidorAsignado aplica solo a las acciones de contingencia.
  if (
    !order ||
    String(order.serviceKind ?? '') !== 'mandado' ||
    normalizeWhatsAppPhone(fromPhone) !== normalizeWhatsAppPhone(order.phone) ||
    (isContingencyAction && order.repartidorAsignado) ||
    ['cancelled', 'delivered', 'completed'].includes(String(order.orderStatus || order.status))
  ) {
    console.warn('[whatsapp webhook] accion mandado rechazada', { action, orderId })
    return true
  }

  const idempotencyKey = `${orderId}:${action}`
  const alreadyHandled = (order.orderEvents ?? []).some((event: Record<string, unknown>) => {
    if (!event.payloadJson) return false
    try {
      return JSON.parse(String(event.payloadJson)).idempotencyKey === idempotencyKey
    } catch {
      return false
    }
  })
  if (alreadyHandled) return true

  if (action === 'SCHEDULE WAIT') {
    await backendClient.patch(orderId).ifRevisionId(order._rev).set({
      scheduleCustomerChoice: 'wait_for_driver',
      scheduleCustomerChoiceAt: now,
      updatedAt: now,
    }).commit()
    await appendOrderEvent(orderId, {
      type: 'manual_admin_action',
      source: 'whatsapp/webhook',
      actor: 'customer',
      reason: 'customer_waits_for_driver_mandado',
      payload: { idempotencyKey },
    })
    await redispatchOrders([orderId])
    return true
  }

  if (isHelpAction || action === 'SCHEDULE HELP') {
    await backendClient.patch(orderId).ifRevisionId(order._rev).set({
      scheduleCustomerChoice: 'help',
      scheduleCustomerChoiceAt: now,
      customerHelpRequested: true,
      updatedAt: now,
    }).commit()
    await appendOrderEvent(orderId, {
      type: 'manual_admin_action',
      source: 'whatsapp/webhook',
      actor: 'customer',
      reason: 'customer_requested_help_mandado',
      payload: { idempotencyKey },
    })
    if (ADMIN_PHONE) {
      await sendBotMessage(
        ADMIN_PHONE,
        `El cliente pidio ayuda para el mandado #${String(order.orderNumber ?? '')}. Revisa la orden ${orderId}.`
      ).catch(() => null)
    }
    return true
  }

  if (action === 'SCHEDULE PICKUP') {
    await backendClient.patch(orderId).ifRevisionId(order._rev).set({
      scheduleCustomerChoice: 'pickup',
      scheduleCustomerChoiceAt: now,
      updatedAt: now,
    }).commit()
    await appendOrderEvent(orderId, {
      type: 'manual_admin_action',
      source: 'whatsapp/webhook',
      actor: 'customer',
      reason: 'customer_changed_mandado_to_pickup',
      payload: { idempotencyKey },
    })
    if (ADMIN_PHONE) {
      await sendBotMessage(
        ADMIN_PHONE,
        `El cliente cambio su mandado #${String(order.orderNumber ?? '')} a recoleccion. Gestiona manualmente.`
      ).catch(() => null)
    }
    return true
  }

  return false
}

// Meta llama este GET para verificar el webhook
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (VERIFY_TOKEN && mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[whatsapp webhook] Verificado correctamente')
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

// Meta envia los mensajes entrantes aqui
export async function POST(req: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  }

  const rawBody = await req.text()
  if (!verifyWhatsAppSignature(rawBody, req.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ status: 'unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(rawBody)
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

    if (await handleMandadoCustomerAction(textBody, buttonOrderId, fromPhone, new Date().toISOString())) {
      return NextResponse.json({ status: 'ok' })
    }
    if (await handleScheduledCustomerAction(textBody, buttonOrderId, fromPhone, new Date().toISOString())) {
      return NextResponse.json({ status: 'ok' })
    }
    if (await handlePickupRestaurantAction(textBody, buttonOrderId, fromPhone, new Date().toISOString())) {
      return NextResponse.json({ status: 'ok' })
    }
    // Verificar si el numero es un repartidor registrado
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

    // Si no es repartidor, ignorar silenciosamente
    if (!repartidor) {
      console.log(`[whatsapp webhook] Numero desconocido ${fromPhone}, ignorando`)
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
        await redispatchOrders(releasedOrderIds, [repartidor._id]).catch((error) =>
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
      const pendingOrderIds = getPendingOfferOrderIds(repartidor)
      console.log('[webhook disponibilidad] INICIO recibido', {
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
        pendingOrderIds,
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

      const releasedOrderIds = await releaseOrdersForDriver(pendingOrderIds, repartidor._id, 'driver_restart')
      if (releasedOrderIds.length > 0) {
        await redispatchOrders(releasedOrderIds, [repartidor._id]).catch((error) =>
          console.error('[webhook INICIO] Error redispatch:', error)
        )
      }

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
        console.log('[webhook disponibilidad] Seleccion invalida de duracion', {
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
      console.log('[webhook disponibilidad] Seleccion de duracion confirmada', {
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

      await dispatchWaitingOrdersForDriver(repartidor._id).catch((error) => {
        console.error('[webhook disponibilidad] Error reintentando ordenes en espera:', error)
      })

      void sendBotMessage(
        fromPhone,
        `Listo. Estas disponible por ${formatDurationLabel(selectedSession.minutes)}.
Tu sesion termina a las ${formatMexicoTime(sessionWindow.availableUntilIso)}.
Te avisaremos 10 minutos antes de finalizar.`
      ).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    if (repartidor.extensionPendiente) {
      if (textBody === '3') {
        console.log('[webhook disponibilidad] Extension rechazada; termina en horario programado', {
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
          `Perfecto. Tu sesion terminara a la hora programada.`
        ).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }

      const extensionMinutes = EXTENSION_OPTIONS[textBody as keyof typeof EXTENSION_OPTIONS]
      if (!extensionMinutes) {
        console.log('[webhook disponibilidad] Respuesta invalida a extension', {
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
      console.log('[webhook disponibilidad] Extension aceptada', {
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
        `Listo. Extendimos tu disponibilidad ${formatDurationLabel(extensionMinutes)} mas.`
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
        `Perfecto, sigues activo. Te avisaremos cuando haya un pedido.`
      ).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- NO (respuesta al recordatorio) ---
    if (textBody === 'NO') {
      await backendClient
        .patch(repartidor._id)
        .set({ disponible: false, pendienteConfirmacion: false, estadoDisponibilidad: 'offline', ultimaActividad: now })
        .commit()

      void sendBotMessage(fromPhone, `Te hemos desconectado. Hasta pronto.`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- OFERTAS / ORDENES ---
    if (textBody === 'OFERTAS' || textBody === 'OFERTES' || textBody === 'ORDENES') {
      let offerOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, nowDate)

      if (offerOrders.length === 0) {
        await dispatchWaitingOrdersForDriver(repartidor._id)
        offerOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, nowDate)
      }

      void backendClient.patch(repartidor._id).set({ ultimaActividad: now }).commit().catch(() => null)

      if (offerOrders.length === 0) {
        const shippedOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>
        if (shippedOrders.length > 0) {
          const activeOrders = shippedOrders.map((order) => `#${order.orderNumber}`).join(', ')
          await sendBotMessage(fromPhone, `No tienes ofertas nuevas. Pedidos activos: ${activeOrders}.`).catch(() => null)
        } else if (getDriverNextState(repartidor, nowDate) === 'offline') {
          await sendBotMessage(fromPhone, 'No tienes ofertas vigentes. Envia INICIO para ponerte disponible.').catch(() => null)
        } else {
          await sendBotMessage(fromPhone, 'No tienes ofertas vigentes en este momento.').catch(() => null)
        }

        return NextResponse.json({ status: 'ok' })
      }

      await sendBotMessage(fromPhone, buildOfferStatusMessage(offerOrders)).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- ACEPTO ---
    if (textBody === 'ACEPTO' || textBody === 'ACEPTAR' || textBody.startsWith('ACEPTO ') || textBody.startsWith('ACEPTAR ')) {
      const orderToken = extractOrderToken(textBody, textBody.startsWith('ACEPTAR') ? 'ACEPTAR' : 'ACEPTO')
      const offerOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, nowDate, orderToken)

      void backendClient.patch(repartidor._id).set({ ultimaActividad: now }).commit().catch(() => null)

      if (offerOrders.length === 0) {
        const nextState = getDriverNextState(repartidor, nowDate)
        const pendingOrderIds = getPendingOfferOrderIds(repartidor)
        await clearPendingOfferForDriver(repartidor._id, now, nextState).catch(() => null)
        const releasedOrderIds = await releaseOrdersForDriver(pendingOrderIds, repartidor._id, 'offer_expired_on_accept')
        const resent = nextState === 'available' && releasedOrderIds.length > 0
          ? await dispatchWaitingOrdersForDriver(repartidor._id)
          : false
        await sendBotMessage(
          fromPhone,
          resent
            ? 'La oferta anterior venció. Te enviamos una nueva; acéptala dentro de los próximos 10 minutos.'
            : 'No tienes ninguna oferta vigente para aceptar.'
        ).catch(() => null)
        console.warn('[whatsapp webhook] intento de aceptar sin oferta valida', {
          repartidorId: repartidor._id,
          orderToken,
          releasedOrderIds,
          resent,
        })
        return NextResponse.json({ status: 'ok' })
      }

      const acceptingBundle = shouldAcceptBundleOffer(repartidor as Record<string, unknown>, offerOrders)
      if (!acceptingBundle && offerOrders.length > 1) {
        const availableOrders = offerOrders.map((order) => `#${order.orderNumber}`).join(', ')
        await sendBotMessage(fromPhone, `Tienes mas de una oferta vigente. Responde ACEPTO <FOLIO> para indicar cual tomar.\nOfertas: ${availableOrders}`).catch(() => null)
        console.warn('[whatsapp webhook] aceptacion ambigua de ofertas', {
          repartidorId: repartidor._id,
          orderToken,
          orderIds: offerOrders.map((order) => order._id),
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
              orderStatus: 'shipped',
              dispatchStatus: 'accepted',
              ...(order.fulfillmentTiming === 'scheduled' ? { scheduleStatus: 'dispatching' } : {}),
              deliveryOfertaEnviada: false,
              updatedAt: now,
            })
            .unset(['deliveryOfertaExpiresAt', 'offeredTo'])
            .commit()

          after(() => syncBaserowOrderById(String(order._id)))
          await appendOrderEvent(String(order._id), { type: 'offer_accepted', source: 'whatsapp/webhook', actor: repartidor._id })
          await appendOrderEvent(String(order._id), { type: 'driver_assigned', source: 'whatsapp/webhook', actor: repartidor._id, payload: { driverId: repartidor._id } })
          if (order.fulfillmentTiming === 'scheduled') {
            await appendOrderEvent(String(order._id), { type: 'scheduled_order_driver_assigned', source: 'whatsapp/webhook', actor: repartidor._id, payload: { driverId: repartidor._id } })
          }

          void notifyRestaurantDriverEnRoute(
            String(order._id),
            String(repartidor.nombre),
            String(order.orderNumber)
          ).catch(() => null)

          console.log('[whatsapp webhook] oferta aceptada con orderId', {
            repartidorId: repartidor._id,
            orderId: order._id,
            orderNumber: order.orderNumber,
          })
        }

        await clearPendingOfferForDriver(repartidor._id, now, 'busy')
      } catch (patchError) {
        const remainingOfferOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, new Date(), orderToken).catch(() => [])
        if (remainingOfferOrders.length === 0) {
          await clearPendingOfferForDriver(repartidor._id, now, getDriverNextState(repartidor, nowDate)).catch(() => null)
          await sendBotMessage(fromPhone, 'La oferta ya no esta disponible o ya fue tomada.').catch(() => null)
        }
        console.error('[whatsapp webhook] error asignando oferta', {
          repartidorId: repartidor._id,
          orderIds: offerOrders.map((order: Record<string, unknown>) => order._id),
          remainingOfferOrderIds: Array.isArray(remainingOfferOrders) ? remainingOfferOrders.map((order: Record<string, unknown>) => order._id) : [],
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

        const storeCoordinates = order.storeCoordinates as
          | { latitude?: unknown; longitude?: unknown }
          | undefined
        const restaurantLatitude = storeCoordinates?.latitude
        const restaurantLongitude = storeCoordinates?.longitude

        const restaurantMapsUrl =
          isValidCoordinate(restaurantLatitude) && isValidCoordinate(restaurantLongitude)
            ? `https://www.google.com/maps?q=${restaurantLatitude},${restaurantLongitude}`
            : `https://maps.google.com/maps?q=${encodeURIComponent(storeAddress)}`

        if (!(isValidCoordinate(restaurantLatitude) && isValidCoordinate(restaurantLongitude))) {
          console.warn('[whatsapp webhook] usando fallback de direccion para maps del restaurante', {
            orderId: order._id,
            orderNumber: order.orderNumber,
            storeName: order.storeName,
            storeAddress,
            storeCoordinates: order.storeCoordinates ?? null,
          })
        }

        const shippingAddress = order.shippingAddress as { line1?: string; latitude?: number; longitude?: number } | undefined
        const clientAddressStr = buildClientAddress(order as { shippingAddress?: { line1?: string; street?: string; city?: string } })
        const clientMapsUrl = buildAddressMapsUrl(shippingAddress, clientAddressStr)
        const deliveryNotes = String(order.deliveryNotes ?? '').trim()

        const confirmationResults = await Promise.allSettled([
          sendDriverConfirmation(
            fromPhone,
            String(order.orderNumber),
            String(order.storeName ?? 'La Tienda'),
            clientAddressStr,
            paymentMethodDisplay,
            restaurantMapsUrl,
            clientMapsUrl
          ),
          deliveryNotes
            ? sendBotMessage(fromPhone, `Instrucciones de entrega para #${String(order.orderNumber)}:\n${deliveryNotes}`)
            : Promise.resolve(),
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
            void sendBotMessage(fromPhone, 'No tienes ningun pedido en camino actualmente.').catch(() => null)
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

        const isMandadoOrder = String((targetOrder as Record<string, unknown>).serviceKind ?? '') === 'mandado'
        const notifications: Promise<unknown>[] = [
          sendRepartidorEnCamino(fromPhone, String((targetOrder as Record<string, unknown>).orderNumber), String((targetOrder as Record<string, unknown>)._id)),
        ]

        const customerPhone = normalizeWhatsAppPhone(String((targetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (targetOrder as Record<string, unknown>).customerName) {
          if (isMandadoOrder) {
            const mandado = targetOrder as Record<string, unknown>
            const destination =
              (mandado.mandadoDestination as { label?: string } | undefined)?.label
              ?? (String((mandado.shippingAddress as { line1?: string } | undefined)?.line1 ?? '') || 'la dirección indicada')
            notifications.push(sendMandadoClienteRecogido({
              _id: String(mandado._id),
              phone: customerPhone,
              customerName: String(mandado.customerName),
              orderNumber: String(mandado.orderNumber ?? ''),
              deliveryAddress: destination,
            }))

            // Si el cliente proporcionó teléfono del destinatario, avisarle también
            const recipientPhone = normalizeWhatsAppPhone(String(mandado.mandadoRecipientPhone ?? '').replace(/\D/g, ''))
            if (recipientPhone) {
              notifications.push(sendMandadoDestinatarioEnCamino({
                _id: String(mandado._id),
                recipientPhone,
                customerName: String(mandado.customerName ?? 'Un remitente'),
                orderNumber: String(mandado.orderNumber ?? ''),
              }))
            }
          } else {
            notifications.push(
              sendOrderOnTheWay(customerPhone, String((targetOrder as Record<string, unknown>).customerName), String((targetOrder as Record<string, unknown>).orderNumber))
            )
          }
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

        after(() => syncBaserowOrderById(String((resolvedTargetOrder as Record<string, unknown>)._id)))
        await appendOrderEvent(String((resolvedTargetOrder as Record<string, unknown>)._id), { type: 'at_door', source: 'whatsapp/webhook', actor: repartidor._id })

        const notifications: Promise<unknown>[] = [
          sendRepartidorEnPuerta(fromPhone, String((resolvedTargetOrder as Record<string, unknown>).orderNumber), String((resolvedTargetOrder as Record<string, unknown>)._id)),
        ]

        const customerPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (resolvedTargetOrder as Record<string, unknown>).customerName) {
          let deliveryPin: string | undefined
          try {
            const ciphertext = String((resolvedTargetOrder as Record<string, unknown>).deliveryPinCiphertext ?? '')
            if (ciphertext && (resolvedTargetOrder as Record<string, unknown>).deliveryVerificationStatus === 'pending') {
              deliveryPin = revealDeliveryPin(ciphertext)
            }
          } catch (error) {
            console.error('[webhook EN PUERTA] No se pudo revelar el NIP del pedido', {
              orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
              error,
            })
          }

          notifications.push(sendClienteRepartidorEnPuerta(
            customerPhone,
            String((resolvedTargetOrder as Record<string, unknown>).customerName),
            String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
            deliveryPin
          ))

          // En mandados, además confirmamos el estado de la orden con botón de Ayuda
          if (String((resolvedTargetOrder as Record<string, unknown>).serviceKind ?? '') === 'mandado') {
            notifications.push(sendMandadoOrdenPorCompletar({
              _id: String((resolvedTargetOrder as Record<string, unknown>)._id),
              phone: customerPhone,
              orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber ?? ''),
            }))
          }
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

        if ((resolvedTargetOrder as Record<string, unknown>).dispatchStatus !== 'at_door') {
          await sendBotMessage(fromPhone, 'Primero presiona En Puerta para notificar al cliente.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        await sendBotMessage(
          fromPhone,
          `Solicita al cliente el NIP de 6 digitos del pedido #${String((resolvedTargetOrder as Record<string, unknown>).orderNumber)} y respondelo aqui.`
        ).catch(() => null)

        return NextResponse.json({ status: 'ok' })
      }

      const deliveryPinCommand = parseDeliveryPinCommand(textBody)
      if (deliveryPinCommand) {
        const shippedOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>
        const atDoorOrders = shippedOrders.filter((order) => order.dispatchStatus === 'at_door')
        const targetOrder = resolveExactAssignedOrder(atDoorOrders, deliveryPinCommand.orderToken)

        if (!targetOrder) {
          const message = atDoorOrders.length > 1
            ? `Tienes mas de una entrega pendiente. Responde NIP <FOLIO> <6 DIGITOS>. Activos: ${atDoorOrders.map((order) => `#${String(order.orderNumber)}`).join(', ')}`
            : 'No tienes un pedido en puerta pendiente de NIP.'
          await sendBotMessage(fromPhone, message).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        if (targetOrder.deliveryPinLockedUntil && new Date(String(targetOrder.deliveryPinLockedUntil)) > nowDate) {
          await sendBotMessage(fromPhone, 'El NIP esta bloqueado temporalmente. Intenta de nuevo en 15 minutos.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        if (targetOrder.deliveryPinExpiresAt && new Date(String(targetOrder.deliveryPinExpiresAt)) < nowDate) {
          await sendBotMessage(fromPhone, 'El NIP expiro. Contacta a soporte para completar la entrega.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        if (
          targetOrder.deliveryVerificationMethod !== 'pin' ||
          !isDeliveryPinValid(String(targetOrder.orderNumber), deliveryPinCommand.pin, String(targetOrder.deliveryPinHash ?? ''))
        ) {
          const attempts = Number(targetOrder.deliveryPinAttemptCount ?? 0) + 1
          const lockedUntil = attempts >= DELIVERY_PIN_MAX_ATTEMPTS
            ? new Date(nowDate.getTime() + DELIVERY_PIN_LOCK_MS).toISOString()
            : undefined
          await backendClient.patch(String(targetOrder._id)).ifRevisionId(String(targetOrder._rev)).set({
            deliveryPinAttemptCount: attempts,
            deliveryVerificationStatus: lockedUntil ? 'locked' : 'pending',
            deliveryPinLockedUntil: lockedUntil,
            updatedAt: now,
          }).commit()
          await appendOrderEvent(String(targetOrder._id), {
            type: 'delivery_pin_failed',
            source: 'whatsapp/webhook',
            actor: repartidor._id,
            payload: { attempt: attempts, locked: Boolean(lockedUntil) },
          })
          const attemptsRemaining = Math.max(0, DELIVERY_PIN_MAX_ATTEMPTS - attempts)
          await sendBotMessage(
            fromPhone,
            lockedUntil ? 'NIP incorrecto. Se bloqueo por 15 minutos.' : `NIP incorrecto. Te quedan ${attemptsRemaining} intentos.`
          ).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        const verifiedAt = now
        await backendClient.patch(String(targetOrder._id)).ifRevisionId(String(targetOrder._rev)).set({
          status: 'delivered',
          orderStatus: 'delivered',
          dispatchStatus: 'completed',
          deliveredAt: verifiedAt,
          settlementStatus: resolveDeliveredSettlement(targetOrder),
          deliveryPinVerifiedAt: verifiedAt,
          deliveryPinVerifiedBy: repartidor._id,
          deliveryVerificationStatus: 'verified',
          ...(targetOrder.fulfillmentTiming === 'scheduled' ? { scheduleStatus: 'completed' } : {}),
          updatedAt: verifiedAt,
        }).commit()

        after(() => syncBaserowOrderById(String(targetOrder._id)))
        await appendOrderEvent(String(targetOrder._id), { type: 'delivery_pin_verified', source: 'whatsapp/webhook', actor: repartidor._id })
        await appendOrderEvent(String(targetOrder._id), { type: 'delivered', source: 'whatsapp/webhook', actor: repartidor._id })

        const remainingOrders = (await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>)
          .filter((order) => String(order._id) !== String(targetOrder._id))
        const nextState = remainingOrders.length > 0 ? 'busy' : getDriverNextState(repartidor, nowDate)
        await backendClient.patch(repartidor._id).set({
          disponible: nextState !== 'offline',
          estadoDisponibilidad: nextState,
          ultimaActividad: now,
        }).commit()
        if (nextState === 'available') {
          await dispatchWaitingOrdersForDriver(repartidor._id).catch((error) => console.error('[webhook NIP] Error redisparando pedidos:', error))
        }

        const customerPhone = normalizeWhatsAppPhone(String(targetOrder.phone ?? ''))
        if (customerPhone && targetOrder.customerName) {
          await sendOrderDelivered(customerPhone, String(targetOrder.customerName), String(targetOrder.orderNumber)).catch(() => null)
        }
        await sendBotMessage(
          fromPhone,
          nextState === 'offline'
            ? 'NIP correcto. Pedido entregado correctamente. Tu sesion de disponibilidad ya termino; responde INICIO para volver a conectarte.'
            : 'NIP correcto. Pedido entregado correctamente. Gracias!'
        ).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }
// --- Cualquier otro mensaje de un repartidor registrado ---
      void sendBotMessage(
        fromPhone,
        `Comandos disponibles: INICIO, FIN, OFERTAS, ORDENES, ACEPTO, RECHAZAR, PEDIDO EN DIRECCION AL DOMICILIO, EN PUERTA, ENTREGADO.`
      ).catch(() => null)

  } catch (error) {
    console.error('[whatsapp webhook] Error:', error)
  }

  return NextResponse.json({ status: 'ok' })
}






















