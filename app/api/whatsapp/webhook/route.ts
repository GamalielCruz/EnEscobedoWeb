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
  sendWhatsAppTemplate,
  sendWhatsAppInteractiveMessage,
} from '@/lib/whatsapp'
import {
  sendMandadoClienteRecogido,
  sendMandadoDestinatarioEnPuerta,
  sendMandadoDestinoEnPuerta,
  sendMandadoOrdenPorCompletar,
} from '@/lib/mandado-whatsapp'
import { dispatchWaitingOrdersForDriver, redispatchOrders, releaseOrdersForDriver } from '@/lib/delivery-dispatch'
import { assignOrderToDriver } from '@/lib/dispatch/dispatch-core'
import { classifyAssignmentOutcome } from '@/lib/dispatch/dispatch-validation'
import { notifyRestaurantDriverEnRoute } from '@/lib/restaurant-notifications'
import { appendOrderEvent } from '@/lib/order-events'
import { resolveSettlementStatusOnDelivery } from '@/lib/order-state'
import { buildDriverConfirmationData, buildMandadoDriverInstructions } from '@/lib/order-maps'
import {
  mandadoDriverState,
  buildMandadoAssignmentInteractive,
  buildMandadoPickupArrivalInteractive,
  buildMandadoEnRouteInteractive,
  buildMandadoDestinationArrivalInteractive,
} from '@/lib/mandado-driver-flow'
import { matchDriverCommand } from '@/lib/driver-commands'
import { buildStoreMapsUrl } from '@/lib/order-pricing'
import { syncBaserowOrderById } from '@/lib/baserow'
import { isDeliveryPinValid, orderRequiresDeliveryPin, revealDeliveryPin } from '@/lib/delivery-pin'
import { planMandadoArrival } from '@/lib/mandado-arrival'
import { parseDeliveryPinCommand } from '@/lib/delivery-pin-command'
import {
  deriveNipIncidentType,
  effectiveNipStatus,
  getDeliveryPinBlockReason,
  isNipCarrierTemplate,
  mapMetaMessageStatus,
  resolveNextClaimStatus,
  resolveNipStatusFromClaimStatus,
  type ClaimStatus,
} from '@/lib/nip-delivery'
import { updateOrderNipDeliveryStatus } from '@/lib/nip-delivery-store'
import { verifyWhatsAppSignature } from '@/lib/whatsapp-webhook'
import { getDeliveryScheduleConfig } from '@/lib/delivery-schedule-config'
import { WHATSAPP_TEMPLATES } from '@/lib/whatsapp/templates'
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
  soporteConversacionAbierta,
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
  soporteConversacionAbierta,
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
  nipIncidentAt,
  nipIncidentType,
  totalPrice,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref,
  serviceKind,
  mandadoEntregaSegura,
  mandadoOrigin,
  mandadoDestination,
  mandadoPickupAtDoor,
  mandadoEnRuta,
  mandadoRecipientPhone,
  mandadoContactStatus,
  mandadoContactPhone,
  mandadoNipRecipient,
  nipDeliveryChannel,
  mandadoRecipientWhatsAppDeclared,
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
  mandadoEntregaSegura,
  mandadoOrigin,
  mandadoDestination,
  mandadoPickupAtDoor,
  mandadoEnRuta,
  mandadoRecipientPhone,
  mandadoNipRecipient,
  nipDeliveryChannel,
  "storeId": affiliateStore._ref,
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label),
  "storeCoordinates": coalesce(affiliateStore->coordinates, {"latitude": mandadoOrigin.lat, "longitude": mandadoOrigin.lng}),
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeLat": coalesce(affiliateStore->coordinates.latitude, mandadoOrigin.lat),
  "storeLng": coalesce(affiliateStore->coordinates.longitude, mandadoOrigin.lng),
  "destLat": coalesce(shippingAddress.latitude, mandadoDestination.lat),
  "destLng": coalesce(shippingAddress.longitude, mandadoDestination.lng),
  "destLabel": coalesce(shippingAddress.line1, mandadoDestination.label),
  "mandadoOriginLabel": mandadoOrigin.label,
  "mandadoDestinationLabel": mandadoDestination.label,
  mandadoDetails,
  mandadoOriginReference,
  mandadoDestinationReference,
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
  nipDeliveryStatus,
  nipIncidentAt,
  nipIncidentType,
  serviceKind,
  mandadoEntregaSegura,
  mandadoOrigin,
  mandadoDestination,
  mandadoPickupAtDoor,
  mandadoEnRuta,
  mandadoRecipientPhone,
  mandadoContactStatus,
  mandadoContactPhone,
  mandadoNipRecipient,
  nipDeliveryChannel,
  mandadoRecipientWhatsAppDeclared,
  "storeName": coalesce(affiliateStore->name, select(serviceKind == "mandado" => "Punto de inicio")),
  "storeAddress": coalesce(affiliateStore->address.street, mandadoOrigin.label),
  "shippingAddress": shippingAddress,
  deliveryNotes
}`

// Consulta ligera del estado REAL de un pedido para reconciliar una
// aceptación fallida/conflictiva (idempotencia): se decide por Sanity, no por
// la revisión obsoleta de este intento.
const RECONCILE_ORDER_QUERY = `*[_type == "order" && _id == $orderId][0]{
  _id,
  orderNumber,
  orderStatus,
  dispatchStatus,
  deliveryOfertaExpiresAt,
  "driverId": repartidorAsignado._ref,
  "offeredToRef": offeredTo._ref
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

// Dedupe de incidencias: no registrar el mismo evento de NIP bloqueado más de
// una vez cada 15 minutos por pedido (evita spam en la bandeja del Dispatch Center).
const NIP_INCIDENT_DEDUPE_MS = 15 * 60 * 1000

// Persiste el canal EFECTIVO y el teléfono destino del NIP (endurecimiento B):
// qué se intentó entregar y a qué número, en el momento REAL del envío (EN
// PUERTA). `none` = no existe canal entregable (anomalía: sin teléfono).
async function persistNipDeliveryTarget(
  order: Record<string, unknown>,
  target: { deliveryChannel: 'whatsapp_sender' | 'whatsapp_recipient' | 'none'; deliveryPhone?: string },
  nowDate: Date
) {
  try {
    await backendClient
      .patch(String(order._id))
      .ifRevisionId(String(order._rev))
      .set({
        nipDeliveryChannel: target.deliveryChannel,
        nipDeliveryPhone: target.deliveryPhone,
        updatedAt: nowDate.toISOString(),
      })
      .commit()
  } catch (error) {
    console.error('[webhook EN PUERTA] error persistiendo canal del NIP', {
      orderId: order._id,
      error,
    })
  }
}

async function recordDeliveryPinIncident(
  order: Record<string, unknown>,
  repartidor: Record<string, unknown>,
  blockReason: 'expired' | 'not_delivered',
  nowDate: Date
) {
  // Tipos separados de incidencia (endurecimiento): `not_delivered`, `expired`
  // y `no_whatsapp` (canal remitente porque el destinatario declaró no usar
  // WhatsApp). El dedupe considera el tipo: el mismo tipo dentro de 15 min no
  // se re-registra, pero un cambio de tipo (p. ej. no_delivered → expired) sí.
  const incidentType = deriveNipIncidentType(order, blockReason)
  const lastIncident = String(order.nipIncidentAt ?? '')
  const lastType = String(order.nipIncidentType ?? '')
  if (
    lastIncident &&
    lastType === incidentType &&
    nowDate.getTime() - new Date(lastIncident).getTime() < NIP_INCIDENT_DEDUPE_MS
  ) {
    return
  }
  try {
    await backendClient
      .patch(String(order._id))
      .ifRevisionId(String(order._rev))
      .set({
        nipIncidentAt: nowDate.toISOString(),
        nipIncidentType: incidentType,
        updatedAt: nowDate.toISOString(),
      })
      .commit()
    await appendOrderEvent(String(order._id), {
      type: 'delivery_pin_incident',
      source: 'whatsapp/webhook',
      actor: String(repartidor._id ?? ''),
      reason: blockReason,
      payload: {
        incidentType,
        nipDeliveryStatus: String(order.nipDeliveryStatus ?? ''),
        deliveryVerificationStatus: String(order.deliveryVerificationStatus ?? ''),
      },
    }).catch(() => null)
    console.warn('[whatsapp webhook] incidencia de NIP registrada', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      blockReason,
      incidentType,
    })
  } catch (error) {
    console.error('[whatsapp webhook] error registrando incidencia de NIP', error)
  }
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

/**
 * Completa una entrega en puerta (paso final ENTREGADO / NIP válido).
 * Compartido por el flujo con NIP (validado) y el flujo sin NIP (Entrega
 * segura desactivada), donde `verifiedByDriver` solo se marca si hubo NIP.
 */
async function completeDeliveredOrder(
  targetOrder: Record<string, unknown>,
  repartidor: { _id: string; disponible?: boolean; disponibleHasta?: string },
  nowDate: Date,
  now: string,
  opts: { verifiedByDriver?: boolean } = {}
) {
  const verifiedAt = now
  await backendClient.patch(String(targetOrder._id)).ifRevisionId(String(targetOrder._rev)).set({
    status: 'delivered',
    orderStatus: 'delivered',
    dispatchStatus: 'completed',
    ...(String(targetOrder.mandadoContactStatus ?? '') === 'active' ? { mandadoContactStatus: 'closed' } : {}),
    deliveredAt: verifiedAt,
    settlementStatus: resolveDeliveredSettlement(targetOrder),
    ...(opts.verifiedByDriver
      ? {
          deliveryPinVerifiedAt: verifiedAt,
          deliveryPinVerifiedBy: repartidor._id,
          deliveryVerificationStatus: 'verified',
        }
      : {}),
    ...(targetOrder.fulfillmentTiming === 'scheduled' ? { scheduleStatus: 'completed' } : {}),
    updatedAt: verifiedAt,
  }).commit()

  after(() => syncBaserowOrderById(String(targetOrder._id)))
  if (opts.verifiedByDriver) {
    await appendOrderEvent(String(targetOrder._id), { type: 'delivery_pin_verified', source: 'whatsapp/webhook', actor: repartidor._id })
  }
  await appendOrderEvent(String(targetOrder._id), { type: 'delivered', source: 'whatsapp/webhook', actor: repartidor._id })

  const remainingOrders = ((await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>))
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
  return { nextState }
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
  const isContactAction = action === 'RELAY APPROVE' || action === 'RELAY DECLINE'
  const isContingencyAction = ['SCHEDULE WAIT', 'SCHEDULE PICKUP', 'SCHEDULE HELP'].includes(action)
  if (!orderId || (!isHelpAction && !isContingencyAction && !isContactAction)) {
    return false
  }

  const order = await backendClient.fetch(
    `*[_type == "order" && _id == $orderId][0]{
      _id,
      _rev,
      orderNumber,
      customerName,
      phone,
      mandadoRecipientPhone,
      mandadoContactStatus,
      mandadoContactPhone,
      "contactDriverPhone": mandadoContactDriver->telefono,
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

  if (isContactAction) {
    const contactPhone = normalizeWhatsAppPhone(String(order.mandadoContactPhone ?? ''))
    if (normalizeWhatsAppPhone(fromPhone) !== contactPhone || String(order.mandadoContactStatus ?? '') !== 'pending') return true
    const approved = action === 'RELAY APPROVE'
    await backendClient.patch(orderId).ifRevisionId(order._rev).set({
      mandadoContactStatus: approved ? 'active' : 'declined',
      updatedAt: now,
    }).commit()
    const driverPhone = normalizeWhatsAppPhone(String(order.contactDriverPhone ?? ''))
    if (driverPhone) {
      await sendBotMessage(driverPhone, approved
        ? `El cliente autorizó el contacto protegido para el mandado #${String(order.orderNumber)}. Escribe: MENSAJE ${String(order.orderNumber)} <tu mensaje>`
        : `El cliente prefirió soporte para el mandado #${String(order.orderNumber)}.`).catch(() => null)
    }
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

// ── PASO 2: recepción de estados de mensajes de Meta (sent/delivered/read/failed) ──
// Procesa `value.statuses` del webhook. Un HTTP 200 del endpoint de envío NO
// implica entrega: el estado real llega aquí por `metaMessageId` y se aplica al
// claim idempotente (whatsappTemplateDelivery) y, cuando la plantilla transporta
// el NIP, a `nipDeliveryStatus` de la orden.
async function handleWhatsAppStatuses(statuses: Array<Record<string, unknown>>, traceId: string) {
  for (const entry of statuses) {
    const metaMessageId = String(entry.id ?? '')
    const metaStatus = String(entry.status ?? '')
    if (!metaMessageId || !metaStatus) continue

    const incoming = mapMetaMessageStatus(metaStatus)
    if (!incoming) {
      // Estados desconocidos no deben romper el webhook: se ignoran y se loguean.
      console.info('[whatsapp webhook][statuses] estado desconocido ignorado', { traceId, metaMessageId, metaStatus })
      continue
    }

    const claim = (await backendClient.fetch(
      `*[_type == "whatsappTemplateDelivery" && metaMessageId == $metaMessageId][0]{
        _id, _rev, status, templateName, "orderRef": order._ref
      }`,
      { metaMessageId }
    )) as { _id: string; _rev: string; status?: string; templateName?: string; orderRef?: string } | null

    if (!claim) {
      console.info('[whatsapp webhook][statuses] mensaje sin claim registrado, ignorado', { traceId, metaMessageId, metaStatus })
      continue
    }

    const applied = await applyClaimStatus(claim, incoming, traceId)
    if (!applied) continue

    // Auditoría: un solo evento por transición real (los estados repetidos de Meta
    // no llegan aquí porque applyClaimStatus es idempotente).
    if (claim.orderRef) {
      if (incoming === 'delivered' || incoming === 'read') {
        await appendOrderEvent(claim.orderRef, {
          type: 'whatsapp_template_delivered',
          source: 'whatsapp/webhook',
          payload: { templateName: claim.templateName, metaMessageId, metaStatus },
        }).catch(() => null)
      } else if (incoming === 'failed') {
        await appendOrderEvent(claim.orderRef, {
          type: 'whatsapp_template_failed',
          source: 'whatsapp/webhook',
          payload: {
            templateName: claim.templateName,
            metaMessageId,
            metaStatus,
            errorMessage: String((entry.errors as Array<Record<string, unknown>>)?.[0]?.message ?? ''),
          },
        }).catch(() => null)
      }
    }

    // NIP: si la plantilla transporta el código, reflejar la entrega en la orden
    // (gate del PASO 1: solo delivered abre la validación en la puerta).
    if (claim.orderRef && isNipCarrierTemplate(claim.templateName)) {
      const nipIncoming = resolveNipStatusFromClaimStatus(incoming)
      if (nipIncoming) {
        await updateOrderNipDeliveryStatus(claim.orderRef, nipIncoming).catch(() => null)
      }
    }
  }
}

// Aplica la transición al claim con idempotencia y reintento ante concurrencia
// (dos `statuses` simultáneos de Meta). Devuelve true solo si hubo transición real
// de este llamador (evita duplicar eventos de auditoría).
async function applyClaimStatus(
  claim: { _id: string; _rev: string; status?: string },
  incoming: ClaimStatus,
  traceId: string
): Promise<boolean> {
  const next = resolveNextClaimStatus(claim.status as ClaimStatus | undefined, incoming)
  if (!next || next === claim.status) return false // idempotente / degradación / desconocido

  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status: next, updatedAt: now }
  if (next === 'delivered') patch.deliveredAt = now
  if (next === 'read') patch.readAt = now
  if (next === 'failed') patch.failedAt = now

  try {
    await backendClient.patch(claim._id).ifRevisionId(claim._rev).set(patch).commit()
    return true
  } catch (error) {
    // Concurrencia: releer con revisión fresca y re-evaluar (forward-only).
    const fresh = (await backendClient.fetch(
      `*[_type == "whatsappTemplateDelivery" && _id == $claimId][0]{ _id, _rev, status }`,
      { claimId: claim._id }
    )) as { _id: string; _rev: string; status?: string } | null
    if (!fresh) return false
    const freshNext = resolveNextClaimStatus(fresh.status as ClaimStatus | undefined, incoming)
    if (!freshNext || freshNext === fresh.status) return false
    try {
      await backendClient.patch(fresh._id).ifRevisionId(fresh._rev).set(patch).commit()
      return true
    } catch {
      // Perdimos la carrera: otro llamador ya aplicó la transición.
      console.info('[whatsapp webhook][statuses] transición aplicada por otro llamador', { traceId, claimId: claim._id, incoming })
      return false
    }
  }
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

    // ── PASO 2: estados de mensajes de Meta (delivered/read/failed) ──
    // Se procesan SIEMPRE que vengan (también junto a un mensaje); son independientes
    // del mensaje entrante y llegan con la misma firma verificada arriba.
    const statuses = Array.isArray(value?.statuses) ? (value.statuses as Array<Record<string, unknown>>) : []
    if (statuses.length > 0) {
      await handleWhatsAppStatuses(statuses, traceId).catch((error) =>
        console.error('[whatsapp webhook][statuses] error procesando estados', { traceId, error })
      )
    }

    if (!message) {
      return NextResponse.json({ status: 'ok' })
    }

    const fromPhone = message.from as string
    let textBody = ''
    let buttonPayloadRaw: string | null = null
    let buttonTitleRaw: string | null = null
    let buttonOrderId: string | null = null
    // Texto ORIGINAL del mensaje (sin normalizar) para la bandeja de soporte.
    let rawIncomingText: string | null = null

    if (message.type === 'text') {
      const rawBody = (message.text as Record<string, unknown>)?.body as string ?? ''
      rawIncomingText = String(rawBody)
      textBody = normalizeText(rawBody)
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
    // Mensajes del cliente dentro de un contacto protegido activo: se retransmiten
    // al repartidor desde el número de El Menú, sin exponer teléfonos.
    const customerRelay = await backendClient.fetch(`*[_type == "order" && mandadoContactStatus == "active" && mandadoContactPhone == $phone][0]{ orderNumber, "driverPhone": mandadoContactDriver->telefono }`, {
      phone: normalizeWhatsAppPhone(fromPhone),
    }) as { orderNumber?: string; driverPhone?: string } | null
    if (customerRelay && rawIncomingText?.trim()) {
      const driverPhone = normalizeWhatsAppPhone(customerRelay.driverPhone)
      if (driverPhone) {
        await sendBotMessage(driverPhone, `Cliente (#${customerRelay.orderNumber}): ${rawIncomingText.trim().slice(0, 1200)}`).catch(() => null)
      }
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
    if (textBody === 'FIN SOPORTE') {
      await backendClient.patch(repartidor._id).set({ soporteConversacionAbierta: false }).commit()
      await sendBotMessage(fromPhone, 'Conversación de soporte cerrada. Si necesitas ayuda de nuevo, escribe AYUDA.').catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }
    const contactRequest = /^CONTACTAR CLIENTE(?:\s+(.+))?$/.exec(textBody)
    const relayMessage = /^MENSAJE\s+([^\s]+)\s+(.+)$/.exec(String(rawIncomingText ?? ''))
    if (contactRequest || relayMessage) {
      const activeOrders = await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>
      if (contactRequest) {
        const order = resolveExactAssignedOrder(activeOrders, contactRequest[1])
        const pickupReached = order?.mandadoPickupAtDoor === true
        const targetPhone = normalizeWhatsAppPhone(String(pickupReached ? order?.mandadoRecipientPhone ?? '' : order?.phone ?? ''))
        if (!order || String(order.serviceKind ?? '') !== 'mandado' || !targetPhone) {
          await sendBotMessage(fromPhone, 'No encontré un mandado activo con contacto disponible. Usa: CONTACTAR CLIENTE <folio>.').catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }
        await backendClient.patch(String(order._id)).ifRevisionId(String(order._rev)).set({
          mandadoContactStatus: 'pending', mandadoContactPhone: targetPhone,
          mandadoContactDriver: { _type: 'reference', _ref: repartidor._id }, updatedAt: now,
        }).commit()
        await sendWhatsAppTemplate(targetPhone, WHATSAPP_TEMPLATES.mandadoSolicitudContacto, [`#${String(order.orderNumber)}`], 'es_MX', [
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `RELAY APPROVE|${String(order._id)}` }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'payload', payload: `RELAY DECLINE|${String(order._id)}` }] },
        ]).catch(() => null)
        await sendBotMessage(fromPhone, `Solicitamos autorización al cliente para el mandado #${String(order.orderNumber)}. Te avisaremos su respuesta.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }
      const order = resolveExactAssignedOrder(activeOrders, relayMessage?.[1])
      if (!order || String(order.mandadoContactStatus ?? '') !== 'active') {
        await sendBotMessage(fromPhone, 'No hay un contacto protegido activo para ese folio.').catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }
      const targetPhone = normalizeWhatsAppPhone(String(order.mandadoContactPhone ?? ''))
      if (targetPhone) await sendBotMessage(targetPhone, `Repartidor (#${String(order.orderNumber)}): ${relayMessage?.[2].trim().slice(0, 1200)}`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }
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
      const traceId = crypto.randomUUID().slice(0, 8)
      const orderToken = extractOrderToken(textBody, textBody.startsWith('ACEPTAR') ? 'ACEPTAR' : 'ACEPTO')
      console.log('[webhook ACEPTO] OFFER_ACCEPT_RECEIVED', {
        traceId,
        repartidorId: repartidor._id,
        repartidorNombre: repartidor.nombre,
        orderToken,
      })
      const offerOrders = await resolvePendingOfferOrders(repartidor as Record<string, unknown>, nowDate, orderToken)
      console.log('[webhook ACEPTO] OFFER_ACCEPT_VALIDATED', {
        traceId,
        repartidorId: repartidor._id,
        orderIds: offerOrders.map((order: Record<string, unknown>) => String(order._id)),
      })

      // NOTA: ya no se lanza un patch fire-and-forget de ultimaActividad aquí.
      // Ese patch asíncrono cambiaba la revisión del repartidor justo entre el
      // fetch y el commit de assignOrderToDriver, causando el 409 real en
      // producción (documentRevisionIDDoesNotMatchError sobre el repartidor).
      // assignOrderToDriver actualiza ultimaActividad dentro de su transacción.
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

      // Cada pedido se asigna a través del servicio único del Dispatch Center
      // (lib/dispatch/dispatch-core.ts). El servicio resuelve internamente los
      // conflictos de revisión (409) releendo el estado real de Sanity y
      // reintentando con revisiones frescas; un fallo devuelto aquí ya está
      // clasificado (validation | conflict | already_assigned_other) y nunca
      // significa "reintenta con la misma revisión".
      const assignedOutcomes: Array<{
        order: Record<string, unknown>
        ok: boolean
        idempotent?: boolean
        code?: string
      }> = []
      try {
      for (const order of offerOrders as Array<Record<string, unknown>>) {
        const assigned = await assignOrderToDriver({
          orderId: String(order._id),
          driverId: repartidor._id,
          mode: 'auto',
          actorName: String(repartidor.nombre ?? ''),
          notifyDriver: false,
          skipEvents: true,
        })

        if (!assigned.ok) {
          console.warn('[webhook ACEPTO] ASSIGNMENT_FAILED', {
            traceId,
            orderId: String(order._id),
            repartidorId: repartidor._id,
            code: assigned.code,
            error: assigned.error,
          })
          assignedOutcomes.push({ order, ok: false, code: assigned.code })
          continue
        }

        if (assigned.idempotent) {
          // Doble "Acepto" / reintento concurrente: el pedido ya quedó asignado
          // a este repartidor. Éxito idempotente: NO se re-ejecutan eventos ni
          // notificaciones (el ganador ya los emitió) para no duplicar.
          console.log('[webhook ACEPTO] ASSIGNMENT_IDEMPOTENT', {
            traceId,
            orderId: String(order._id),
            repartidorId: repartidor._id,
          })
          assignedOutcomes.push({ order, ok: true, idempotent: true })
          continue
        }

        assignedOutcomes.push({ order, ok: true })
        after(() => syncBaserowOrderById(String(order._id)))
        await appendOrderEvent(String(order._id), { type: 'offer_accepted', source: 'whatsapp/webhook', actor: repartidor._id })
        await appendOrderEvent(String(order._id), { type: 'driver_assigned', source: 'whatsapp/webhook', actor: repartidor._id, payload: { driverId: repartidor._id } })
        if (order.fulfillmentTiming === 'scheduled') {
          await appendOrderEvent(String(order._id), { type: 'scheduled_order_driver_assigned', source: 'whatsapp/webhook', actor: repartidor._id, payload: { driverId: repartidor._id } })
        }

        // Los mandados no tienen restaurante afiliado: notificar aquí solo
        // produce el log "[notify-restaurant] Restaurante sin WhatsApp
        // configurado" con storeId null (verificado en producción). Los
        // restaurantes conservan su notificación actual.
        if (String(order.serviceKind ?? '') !== 'mandado') {
          void notifyRestaurantDriverEnRoute(
            String(order._id),
            String(repartidor.nombre),
            String(order.orderNumber)
          ).catch(() => null)
        }

        console.log('[whatsapp webhook] oferta aceptada con orderId', {
          repartidorId: repartidor._id,
          orderId: order._id,
          orderNumber: order.orderNumber,
        })
      }
      } catch (loopError) {
        // Error inesperado (p. ej. fallo de red a Sanity en el fetch): se
        // registra y se continúa con la reconciliación por estado real para no
        // dejar el pedido incoherente ni responder 500 a Meta (que reintentaría).
        console.error('[webhook ACEPTO] error inesperado al asignar', {
          traceId,
          repartidorId: repartidor._id,
          orderIds: offerOrders.map((order: Record<string, unknown>) => String(order._id)),
          loopError,
        })
      }

      // ── Reconciliación de fallos por el estado REAL de Sanity ─────────
      // Nunca se libera un pedido que en realidad quedó asignado (a este u
      // otro repartidor): se relee el documento y se decide según la verdad
      // actual, no según la opinión de este intento.
      const failures = assignedOutcomes.filter((outcome) => !outcome.ok)
      const successes = assignedOutcomes.filter((outcome) => outcome.ok)
      const releasedOrderIds: string[] = []

      for (const failure of failures) {
        const freshOrder = await backendClient.fetch(RECONCILE_ORDER_QUERY, { orderId: String(failure.order._id) }) as Record<string, unknown> | null
        const outcome = classifyAssignmentOutcome(freshOrder as Parameters<typeof classifyAssignmentOutcome>[0], repartidor._id, nowDate.getTime())
        console.warn('[webhook ACEPTO] ASSIGNMENT_RECONCILE', {
          traceId,
          orderId: String(failure.order._id),
          orderNumber: failure.order.orderNumber,
          kind: outcome.kind,
          code: failure.code,
        })
        switch (outcome.kind) {
          case 'assigned_to_me': {
            // Un intento concurrente ganó y ya asignó a este repartidor:
            // éxito idempotente sin re-notificar (el ganador ya notificó).
            break
          }
          case 'assigned_to_other': {
            if (successes.length === 0) {
              await clearPendingOfferForDriver(repartidor._id, now, getDriverNextState(repartidor, nowDate)).catch(() => null)
            }
            void sendBotMessage(fromPhone, `El pedido #${failure.order.orderNumber} ya fue tomado por otro repartidor.`).catch(() => null)
            break
          }
          case 'still_offered': {
            if (failure.code === 'validation') {
              // Falla de validación real (p. ej. capacidad máxima en un
              // bundle): se libera para que el pedido vuelva a la cola.
              releasedOrderIds.push(String(failure.order._id))
            } else {
              // Conflicto persistente de revisión: la oferta sigue vigente.
              // NO se libera ni se toca al repartidor; puede reintentar.
              void sendBotMessage(fromPhone, 'Hubo un error al confirmar tu aceptación. Inténtalo de nuevo en unos segundos.').catch(() => null)
            }
            break
          }
          case 'offer_released':
          case 'order_missing': {
            if (successes.length === 0) {
              await clearPendingOfferForDriver(repartidor._id, now, getDriverNextState(repartidor, nowDate)).catch(() => null)
            }
            void sendBotMessage(fromPhone, `La oferta del pedido #${failure.order.orderNumber} ya no está vigente.`).catch(() => null)
            break
          }
        }
      }

      if (releasedOrderIds.length > 0) {
        const released = await releaseOrdersForDriver(releasedOrderIds, repartidor._id, 'assign_failed_after_validation').catch(() => [])
        if (released.length > 0) {
          console.log('[webhook ACEPTO] OFFER_RELEASED', {
            traceId,
            orderIds: released,
            repartidorId: repartidor._id,
          })
          await redispatchOrders(released, [repartidor._id]).catch(() => null)
        }
        if (successes.length === 0) {
          await clearPendingOfferForDriver(repartidor._id, now, getDriverNextState(repartidor, nowDate)).catch(() => null)
        }
        void sendBotMessage(
          fromPhone,
          'No se pudo completar la asignacion por una restriccion de capacidad. Las ofertas se liberaron y se buscara otro repartidor.'
        ).catch(() => null)
      }

      // Solo las asignaciones NUEVAS reciben mensajería de confirmación. Las
      // aceptaciones idempotentes (doble "Acepto" donde otro intento ganó) ya
      // fueron notificadas por el ganador: NO se vuelven a enviar plantillas
      // ni se vuelve a avisar a repartidores competidores (evita duplicados).
      const newAssignments = successes.filter((outcome) => !outcome.idempotent)
      if (newAssignments.length === 0) {
        return NextResponse.json({ status: 'ok' })
      }
      const successOrders = newAssignments.map((outcome) => outcome.order)

      const orderNumbersLabel = successOrders.map((order: Record<string, unknown>) => `#${order.orderNumber}`).join(', ')
      void clearCompetingOffers(
        successOrders.map((order: Record<string, unknown>) => String(order._id)),
        repartidor._id,
        orderNumbersLabel,
        now
      ).catch((error) => console.error('[webhook ACEPTO] Error limpiando ofertas competidoras:', error))

      if (successOrders.length > 1) {
        const restaurantName = String(successOrders[0].storeName ?? 'La Tienda')
        const totalBundle = successOrders.reduce((sum: number, order: Record<string, unknown>) => sum + Number(order.totalPrice ?? 0), 0)
        await sendBotMessage(
          fromPhone,
          `Bundle aceptado.\n\nRestaurante: ${restaurantName}\nPedidos: ${orderNumbersLabel}\nPago total estimado: ${totalBundle.toFixed(2)} MXN\n\nPara evitar errores, usa el folio al actualizar cada pedido:\nPEDIDO EN DIRECCION AL DOMICILIO <FOLIO>\nEN PUERTA <FOLIO>\nENTREGADO <FOLIO>`
        ).catch(() => null)
      } else {
        const order = successOrders[0] as Record<string, unknown>
        const paymentMethodDisplay =
          order.paymentMethod === 'cash_on_delivery' || order.paymentMethod === 'cash_on_pickup'
            ? 'COBRAR EN EFECTIVO'
            : 'YA PAGADO'

        const isMandadoOrder = String(order.serviceKind ?? '') === 'mandado'
        const deliveryNotes = String(order.deliveryNotes ?? '').trim()
        // Datos de la plantilla confirmacion_repartidor (texto + botones de
        // Maps) calculados en lib/order-maps.ts (puro y testeable). Para
        // mandados usa el origen/destino reales capturados por el cliente; para
        // restaurantes, la tienda afiliada y el shippingAddress. La plantilla
        // es el mensaje CANÓNICO de asignación (recolección, destino, cobro y
        // Maps). Los mandados reciben ADEMÁS un texto libre con la solicitud e
        // indicaciones (buildMandadoDriverInstructions): complementa, no
        // duplica, la información de la plantilla.
        const confirmation = buildDriverConfirmationData(
          order as Parameters<typeof buildDriverConfirmationData>[0]
        )

        if (isMandadoOrder) {
          // ÚNICA comunicación al repartidor tras aceptar un mandado: mensaje
          // interactivo con toda la información (solicitud, indicaciones,
          // cobro y link de Maps) + botón "Llegué a recolección". La plantilla
          // confirmacion_repartidor NO se usa en mandados (duplicaba
          // recolección, destino y cobro). Fallback a texto plano si el
          // interactivo falla: nunca se pierde la información.
          const assignmentMessage = buildMandadoAssignmentInteractive(
            order as Parameters<typeof buildMandadoAssignmentInteractive>[0],
            confirmation
          )
          const assignmentSent = await sendWhatsAppInteractiveMessage(
            fromPhone,
            assignmentMessage.body,
            assignmentMessage.buttons
          ).catch(() => null)
          if (!assignmentSent) {
            await sendBotMessage(
              fromPhone,
              buildMandadoDriverInstructions(order as Parameters<typeof buildMandadoDriverInstructions>[0])
            ).catch(() => null)
          }
        } else {
          const confirmationResults = await Promise.allSettled([
            sendDriverConfirmation(
              fromPhone,
              String(order.orderNumber),
              confirmation.restaurantName,
              confirmation.deliveryAddress,
              paymentMethodDisplay,
              confirmation.restaurantMapsUrl,
              confirmation.clientMapsUrl
            ),
            // Restaurantes: instrucciones de entrega adicionales.
            deliveryNotes
              ? sendBotMessage(fromPhone, `Instrucciones de entrega para #${String(order.orderNumber)}:\n${deliveryNotes}`)
              : Promise.resolve(),
          ])

          if (confirmationResults[0]?.status === 'rejected') {
            await sendBotMessage(
              fromPhone,
              `Pedido #${order.orderNumber} asignado. Recoge en ${confirmation.restaurantName} y entrega en ${confirmation.deliveryAddress}. Pago: ${paymentMethodDisplay}.`
            ).catch(() => null)
          }
        }
      }

      return NextResponse.json({ status: 'ok' })
    }
// --- RECHAZAR ---
    if (textBody === 'RECHAZAR' || textBody.startsWith('RECHAZAR ')) {
      const traceId = crypto.randomUUID().slice(0, 8)
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

        console.log('[webhook RECHAZAR] OFFER_REJECTED', {
          traceId,
          repartidorId: repartidor._id,
          orderIds: releasedOrderIds,
          orderNumbers: offerOrders.map((order: Record<string, unknown>) => String(order.orderNumber)),
        })
      }

      const responseMessage = offerOrders.length > 1
        ? 'Gracias. El bundle fue ofrecido a otro repartidor.'
        : 'Gracias, el pedido fue ofrecido a otro repartidor.'

      void sendBotMessage(fromPhone, responseMessage).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // --- PEDIDO EN DIRECCION AL DOMICILIO ---
    // El matcheo tolera variantes escritas a mano ("a domicilio", espacios
    // dobles, puntuación final) para que un comando operativo válido NUNCA
    // caiga en la conversación de soporte (incidencia real de producción).
    const pedidoEnCaminoToken = matchDriverCommand(textBody, 'PEDIDO EN DIRECCION AL DOMICILIO')
    if (pedidoEnCaminoToken !== null) {
        const traceId = crypto.randomUUID().slice(0, 8)
        // El botón "Ya recogí el mandado" viaja con payload PEDIDO EN DIRECCION
        // AL DOMICILIO|<orderId>: honrar buttonOrderId igual que EN PUERTA/ENTREGADO
        // para que botón y comando resuelvan la misma orden.
        const orderToken = buttonOrderId ?? (pedidoEnCaminoToken || null)
        console.log('PEDIDO_EN_CAMINO_START', {
          traceId,
          repartidorId: repartidor._id,
          orderToken,
          buttonOrderId,
          fromPhone,
        })
        const targetOrder = buttonOrderId
          ? await resolveAssignedOrderById(buttonOrderId, repartidor._id)
          : null
        const shippedOrders = targetOrder
          ? [targetOrder]
          : await backendClient.fetch(ACTIVE_SHIPPED_ORDERS_QUERY, { repartidorId: repartidor._id }) as Array<Record<string, unknown>>
        console.log('PEDIDO_EN_CAMINO_SHIPPED_ORDERS', {
          traceId,
          cantidad: shippedOrders.length,
          orderIds: shippedOrders.map((o) => String(o._id)),
          orderNumbers: shippedOrders.map((o) => String(o.orderNumber)),
          serviceKind: shippedOrders.map((o) => String(o.serviceKind ?? '')),
          status: shippedOrders.map((o) => String(o.status ?? '')),
          dispatchStatus: shippedOrders.map((o) => String(o.dispatchStatus ?? '')),
          mandadoPickupAtDoor: shippedOrders.map((o) => String(o.mandadoPickupAtDoor ?? '')),
          mandadoEnRuta: shippedOrders.map((o) => String(o.mandadoEnRuta ?? '')),
        })
        const resolvedTargetOrder = targetOrder ?? resolveExactAssignedOrder(shippedOrders as Array<Record<string, unknown>>, orderToken)

        if (!resolvedTargetOrder) {
          console.warn('PEDIDO_EN_CAMINO_NO_TARGET', {
            traceId,
            repartidorId: repartidor._id,
            orderToken,
            cantidadPedidos: shippedOrders.length,
          })
          if (!shippedOrders || shippedOrders.length === 0) {
            void sendBotMessage(fromPhone, 'No tienes ningun pedido en camino actualmente.').catch(() => null)
          } else {
            void sendBotMessage(fromPhone, getAmbiguousOrderPrompt('PEDIDO EN DIRECCION AL DOMICILIO', shippedOrders)).catch(() => null)
          }
          console.warn('[whatsapp webhook] intento de actualizar orden sin asignacion valida', {
            repartidorId: repartidor._id,
            accion: 'en_camino',
            orderToken,
          })
          return NextResponse.json({ status: 'ok' })
        }

        console.log('PEDIDO_EN_CAMINO_TARGET_RESOLVED', {
          traceId,
          targetOrderId: String(resolvedTargetOrder._id),
          targetOrderNumber: String(resolvedTargetOrder.orderNumber),
          targetServiceKind: String(resolvedTargetOrder.serviceKind ?? ''),
          targetStatus: String(resolvedTargetOrder.status ?? ''),
          targetDispatchStatus: String(resolvedTargetOrder.dispatchStatus ?? ''),
          targetMandadoPickupAtDoor: String(resolvedTargetOrder.mandadoPickupAtDoor ?? ''),
          targetMandadoEnRuta: String(resolvedTargetOrder.mandadoEnRuta ?? ''),
        })

        const isMandadoOrder = String((resolvedTargetOrder as Record<string, unknown>).serviceKind ?? '') === 'mandado'
        if (isMandadoOrder) {
          // Máquina de estados del repartidor (lib/mandado-driver-flow.ts):
          // "Ya recogí" / PEDIDO EN DIRECCION AL DOMICILIO es la transición
          // EN_ROUTE, SOLO válida después de registrar la llegada a recolección.
          const driverState = mandadoDriverState(resolvedTargetOrder as Record<string, unknown>)

          if (driverState === 'assigned') {
            // Aún no llegó al punto de recolección: mismo aviso que antes.
            void sendBotMessage(
              fromPhone,
              'Primero llega al punto de recolección y presiona En Puerta. Cuando recibas el paquete, presiona Pedido en dirección al domicilio.'
            ).catch(() => null)
            return NextResponse.json({ status: 'ok' })
          }

          if (driverState === 'destination_arrival' || driverState === 'delivered' || driverState === null) {
            // Duplicado o estado inválido: idempotente, NO se reenvía WhatsApp ni
            // se repiten efectos secundarios.
            console.log('PEDIDO_EN_CAMINO_IDEMPOTENT', {
              traceId,
              orderId: String(resolvedTargetOrder._id),
              driverState,
            })
            return NextResponse.json({ status: 'ok' })
          }

          // driverState === 'pickup_arrival' (post-deploy) o 'en_route' (legacy
          // con mandadoEnRuta undefined). Si el flag ya es true, es duplicado.
          const alreadyEnRuta = (resolvedTargetOrder as Record<string, unknown>).mandadoEnRuta === true
          if (alreadyEnRuta) {
            console.log('PEDIDO_EN_CAMINO_IDEMPOTENT', {
              traceId,
              orderId: String(resolvedTargetOrder._id),
              driverState,
            })
            return NextResponse.json({ status: 'ok' })
          }

          // Transición EN_ROUTE: persiste mandadoEnRuta=true (nunca sin
          // mandadoPickupAtDoor=true, garantizado por la derivación de estado).
          try {
            await backendClient
              .patch(String((resolvedTargetOrder as Record<string, unknown>)._id))
              .ifRevisionId(String((resolvedTargetOrder as Record<string, unknown>)._rev))
              .set({ mandadoEnRuta: true, updatedAt: now })
              .commit()
          } catch (patchError) {
            // Carrera (409) u otro fallo: releer. Si ya está en ruta, la
            // transición la ganó otro intento → idempotente, sin reenvío.
            const fresh = await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId: String((resolvedTargetOrder as Record<string, unknown>)._id) }).catch(() => null)
            if (fresh && fresh.mandadoEnRuta === true) {
              console.log('PEDIDO_EN_CAMINO_IDEMPOTENT', {
                traceId,
                orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
                reason: 'race_win_by_other_request',
              })
              return NextResponse.json({ status: 'ok' })
            }
            console.error('[webhook PEDIDO EN CAMINO] error transicionando EN_ROUTE', {
              traceId,
              orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
              patchError,
            })
            return NextResponse.json({ status: 'ok' })
          }

          after(() => syncBaserowOrderById(String((resolvedTargetOrder as Record<string, unknown>)._id)))
          await appendOrderEvent(String((resolvedTargetOrder as Record<string, unknown>)._id), {
            type: 'en_route',
            source: 'whatsapp/webhook',
            actor: repartidor._id,
          })

          console.log('PEDIDO_EN_CAMINO_SENDING_DRIVER', {
            traceId,
            orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
            orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
          })

          // Mensaje mínimo EN_ROUTE (interactivo) + notificación al remitente
          // (mandado__cliente, SIN cambios). El template repartidor_en_camino
          // deja de usarse en mandados.
          const notifications: Promise<unknown>[] = []
          const enRouteConfirmation = buildDriverConfirmationData(resolvedTargetOrder as Parameters<typeof buildDriverConfirmationData>[0])
          const enRouteMessage = buildMandadoEnRouteInteractive(
            resolvedTargetOrder as Parameters<typeof buildMandadoEnRouteInteractive>[0],
            enRouteConfirmation
          )
          const enRouteSent = await sendWhatsAppInteractiveMessage(fromPhone, enRouteMessage.body, enRouteMessage.buttons).catch(() => null)
          if (!enRouteSent) {
            // Fallback a texto plano si el interactivo falla: no se pierde la
            // información (destino + link de Maps), solo los botones.
            notifications.push(sendBotMessage(fromPhone, enRouteMessage.body).catch(() => null))
          }

          const customerPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
          if (customerPhone && (resolvedTargetOrder as Record<string, unknown>).customerName) {
            const mandado = resolvedTargetOrder as Record<string, unknown>
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
          }

          await Promise.allSettled(notifications)
          console.log('PEDIDO_EN_CAMINO_DRIVER_SENT', {
            traceId,
            orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
            orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
          })
          console.log('[whatsapp webhook] cliente notificado con orderId', {
            accion: 'en_camino',
            repartidorId: repartidor._id,
            orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
            orderNumber: (resolvedTargetOrder as Record<string, unknown>).orderNumber,
          })
          console.log('PEDIDO_EN_CAMINO_COMPLETED', {
            traceId,
            orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
            orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
          })

          return NextResponse.json({ status: 'ok' })
        }

        // ── Restaurantes: sin cambios ──
        console.log('PEDIDO_EN_CAMINO_SENDING_DRIVER', {
          traceId,
          orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
          orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
        })
        const notifications: Promise<unknown>[] = [
          sendRepartidorEnCamino(fromPhone, String((resolvedTargetOrder as Record<string, unknown>).orderNumber), String((resolvedTargetOrder as Record<string, unknown>)._id)),
        ]

        const customerPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (resolvedTargetOrder as Record<string, unknown>).customerName) {
          notifications.push(
            sendOrderOnTheWay(customerPhone, String((resolvedTargetOrder as Record<string, unknown>).customerName), String((resolvedTargetOrder as Record<string, unknown>).orderNumber))
          )
        }

        await Promise.allSettled(notifications)
        console.log('PEDIDO_EN_CAMINO_DRIVER_SENT', {
          traceId,
          orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
          orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
        })
        console.log('[whatsapp webhook] cliente notificado con orderId', {
          accion: 'en_camino',
          repartidorId: repartidor._id,
          orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
          orderNumber: (resolvedTargetOrder as Record<string, unknown>).orderNumber,
        })
        console.log('PEDIDO_EN_CAMINO_COMPLETED', {
          traceId,
          orderId: String((resolvedTargetOrder as Record<string, unknown>)._id),
          orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
        })

        return NextResponse.json({ status: 'ok' })
    }
// --- EN PUERTA ---
    const enPuertaToken = matchDriverCommand(textBody, 'EN PUERTA')
    if (enPuertaToken !== null) {
        const orderToken = buttonOrderId ?? (enPuertaToken || null)
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

        const isMandadoOrder = String((resolvedTargetOrder as Record<string, unknown>).serviceKind ?? '') === 'mandado'

        if (isMandadoOrder) {
          // Máquina de estados del repartidor (lib/mandado-driver-flow.ts): EN
          // PUERTA despacha por el ESTADO de la orden, nunca por número de
          // pulsación. La llegada al destino solo es válida en EN_ROUTE.
          const driverState = mandadoDriverState(resolvedTargetOrder as Record<string, unknown>)

          if (driverState === 'assigned') {
            // ── Transición PICKUP_ARRIVAL (EN PUERTA en recolección) ──
            // Persiste mandadoPickupAtDoor=true Y mandadoEnRuta=false (explícito)
            // para distinguir este estado del legacy (enRuta undefined → en_route).
            try {
              await backendClient
                .patch(String((resolvedTargetOrder as Record<string, unknown>)._id))
                .ifRevisionId(String((resolvedTargetOrder as Record<string, unknown>)._rev))
                .set({ mandadoPickupAtDoor: true, mandadoEnRuta: false, updatedAt: now })
                .commit()
            } catch (patchError) {
              // Carrera (409): si otro intento ya registró la recolección, es
              // duplicado idempotente: NO se reenvía WhatsApp ni efectos.
              const fresh = await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId: String((resolvedTargetOrder as Record<string, unknown>)._id) }).catch(() => null)
              if (fresh && fresh.mandadoPickupAtDoor === true) {
                console.log('EN_PUERTA_IDEMPOTENT', {
                  repartidorId: repartidor._id,
                  orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
                  reason: 'race_win_by_other_request',
                })
                return NextResponse.json({ status: 'ok' })
              }
              console.error('[webhook EN PUERTA] error registrando recolección', {
                orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
                patchError,
              })
              return NextResponse.json({ status: 'ok' })
            }

            after(() => syncBaserowOrderById(String((resolvedTargetOrder as Record<string, unknown>)._id)))
            await appendOrderEvent(String((resolvedTargetOrder as Record<string, unknown>)._id), {
              type: 'picked_up',
              source: 'whatsapp/webhook',
              actor: repartidor._id,
              payload: { location: 'mandado_origin' },
            })

            const senderPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
            const origin =
              ((resolvedTargetOrder as Record<string, unknown>).mandadoOrigin as { label?: string } | undefined)?.label
              ?? 'el punto de recolección'

            // Mensaje mínimo PICKUP_ARRIVAL (interactivo) con botón
            // "Ya recogí el mandado"; fallback a texto plano si falla.
            const pickupMessage = buildMandadoPickupArrivalInteractive(String((resolvedTargetOrder as Record<string, unknown>)._id))
            const pickupSent = await sendWhatsAppInteractiveMessage(fromPhone, pickupMessage.body, pickupMessage.buttons).catch(() => null)
            const notifications: Promise<unknown>[] = []
            if (!pickupSent) {
              notifications.push(
                sendBotMessage(
                  fromPhone,
                  'Llegaste al punto de recolección. Recibe el paquete y, cuando vayas al destino, presiona Pedido en dirección al domicilio.'
                ).catch(() => null)
              )
            }
            if (senderPhone) {
              // 1ª llegada (punto de recolección): aviso con el ORIGEN y acción
              // "recoger tu paquete". Clave de idempotencia propia (`recogido`)
              // para no colisionar con la 2ª llegada (`en_destino`).
              notifications.push(sendMandadoDestinoEnPuerta({
                _id: String((resolvedTargetOrder as Record<string, unknown>)._id),
                phone: senderPhone,
                orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber ?? ''),
                deliveryAddress: origin,
                orderStatus: 'pickup',
              }, { idempotencySuffix: 'recogido' }))
            }
            await Promise.allSettled(notifications)
            return NextResponse.json({ status: 'ok' })
          }

          if (driverState === 'pickup_arrival' || driverState === 'destination_arrival' || driverState === 'delivered') {
            // Duplicado (o acción sobre un estado ya transitado): idempotente,
            // NO se reenvía WhatsApp ni se repiten efectos secundarios. Esto
            // cierra el riesgo de que una 2ª pulsación en el ORIGEN avance al
            // destino: en PICKUP_ARRIVAL solo vale "Ya recogí el mandado".
            console.log('EN_PUERTA_IDEMPOTENT', {
              repartidorId: repartidor._id,
              orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
              driverState,
            })
            return NextResponse.json({ status: 'ok' })
          }

          if (driverState === null) {
            void sendBotMessage(
              fromPhone,
              'No se pudo determinar el estado del mandado. Contacta a soporte.'
            ).catch(() => null)
            return NextResponse.json({ status: 'ok' })
          }

          // driverState === 'en_route' → la llegada al destino es válida;
          // continúa al bloque de destino compartido (fall-through).
        }

        try {
          await backendClient
            .patch(String((resolvedTargetOrder as Record<string, unknown>)._id))
            .ifRevisionId(String((resolvedTargetOrder as Record<string, unknown>)._rev))
            .set({ dispatchStatus: 'at_door', updatedAt: now })
            .commit()
        } catch (patchError) {
          // Carrera (409): si otro intento ya marcó at_door, es duplicado
          // idempotente: NO se reenvían notificaciones (el ganador ya lo hizo).
          const fresh = await backendClient.fetch(ORDER_BY_ID_QUERY, { orderId: String((resolvedTargetOrder as Record<string, unknown>)._id) }).catch(() => null)
          if (fresh && fresh.dispatchStatus === 'at_door') {
            console.log('EN_PUERTA_IDEMPOTENT', {
              repartidorId: repartidor._id,
              orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
              reason: 'race_win_by_other_request',
            })
            return NextResponse.json({ status: 'ok' })
          }
          console.error('[webhook EN PUERTA] error marcando at_door', {
            orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
            patchError,
          })
          return NextResponse.json({ status: 'ok' })
        }

        after(() => syncBaserowOrderById(String((resolvedTargetOrder as Record<string, unknown>)._id)))
        await appendOrderEvent(String((resolvedTargetOrder as Record<string, unknown>)._id), { type: 'at_door', source: 'whatsapp/webhook', actor: repartidor._id })

        const notifications: Promise<unknown>[] = []
        if (isMandadoOrder && !orderRequiresDeliveryPin(resolvedTargetOrder as Record<string, unknown>)) {
          // Entrega Segura OFF: mensaje mínimo DESTINATION_ARRIVAL + botón
          // "Entregado". El template repartidor_en_puerta deja de usarse aquí.
          const arrivalMessage = buildMandadoDestinationArrivalInteractive(String((resolvedTargetOrder as Record<string, unknown>)._id))
          const arrivalSent = await sendWhatsAppInteractiveMessage(fromPhone, arrivalMessage.body, arrivalMessage.buttons).catch(() => null)
          if (!arrivalSent) {
            // Fallback a texto plano si el interactivo falla.
            notifications.push(sendBotMessage(fromPhone, arrivalMessage.body).catch(() => null))
          }
        } else {
          // Entrega Segura ON (mandado) y restaurantes: flujo actual intacto
          // (template repartidor_en_puerta + botón Entregado + NIP).
          notifications.push(
            sendRepartidorEnPuerta(fromPhone, String((resolvedTargetOrder as Record<string, unknown>).orderNumber), String((resolvedTargetOrder as Record<string, unknown>)._id))
          )
        }

        const customerPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).phone ?? ''))
        if (customerPhone && (resolvedTargetOrder as Record<string, unknown>).customerName) {
          let deliveryPin: string | undefined
          // Regla única de NIP: solo se revela/comunica si la orden REALMENTE lo
          // requiere (mandados: Entrega segura activa; restaurantes: método pin
          // pendiente). La existencia de un NIP almacenado NO implica requisito.
          if (orderRequiresDeliveryPin(resolvedTargetOrder as Record<string, unknown>)) {
            try {
              const ciphertext = String((resolvedTargetOrder as Record<string, unknown>).deliveryPinCiphertext ?? '')
              if (ciphertext) {
                deliveryPin = revealDeliveryPin(ciphertext)
              }
            } catch (error) {
              console.error('[webhook EN PUERTA] No se pudo revelar el NIP del pedido', {
                orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
                error,
              })
            }
          }

          // Regla central (lib/mandado-arrival.ts): decide QUÉ plantillas recibe
          // el remitente en EN PUERTA según el valor real de la orden (Entrega
          // segura). NO reutilizar `cliente_repartidor_en_puerta` para mandados.
          const arrivalPlan = planMandadoArrival(resolvedTargetOrder as Record<string, unknown>)
          if (arrivalPlan.sendDestinoEnPuerta) {
            // 2ª llegada (destino): el remitente recibe SIEMPRE el aviso
            // `mandado_destino_en_puerta` (APROBADA) con la dirección de destino
            // y acción "la entrega de tu mandado". Es el aviso equivalente a
            // `cliente_repartidor_en_puerta` de restaurantes, que NO se
            // reutiliza para mandados. Clave de idempotencia `en_destino`
            // (distinta de la 1ª llegada, `recogido`).
            const destinationLabel =
              ((resolvedTargetOrder as Record<string, unknown>).mandadoDestination as { label?: string } | undefined)?.label
              ?? 'el destino del mandado'
            notifications.push(sendMandadoDestinoEnPuerta({
              _id: String((resolvedTargetOrder as Record<string, unknown>)._id),
              phone: customerPhone,
              orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber ?? ''),
              deliveryAddress: destinationLabel,
            }))
            // La primera llegada ya avisó al remitente. En la segunda llegada se
            // avisa al destinatario; {{1}} indica si debe compartir un NIP.
            const recipientPhone = normalizeWhatsAppPhone(String((resolvedTargetOrder as Record<string, unknown>).mandadoRecipientPhone ?? '').replace(/\D/g, ''))
            const recipientGetsPin = arrivalPlan.sendOrdenPorCompletar && arrivalPlan.nipChannel === 'recipient' && Boolean(deliveryPin)
            if (recipientPhone) {
              notifications.push(sendMandadoDestinatarioEnPuerta({
                _id: String((resolvedTargetOrder as Record<string, unknown>)._id),
                recipientPhone,
                orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber ?? ''),
                recipientMessage: recipientGetsPin
                  ? `Tu paquete ya llegó. Comparte este NIP con el repartidor para confirmar la entrega: ${deliveryPin}.`
                  : 'Tu paquete ya llegó. Ya puedes recibirlo.',
              }))
            }
            // 2) NIP (SOLO si la orden requiere Entrega segura): se envía al canal
            //    configurado en la creación (PASO 4), NUNCA al repartidor. Un mandado
            //    sin Entrega segura NUNCA recibe instrucciones ni códigos de NIP.
            if (arrivalPlan.sendOrdenPorCompletar) {
              if (arrivalPlan.nipChannel === 'recipient') {
                if (recipientPhone) {
                  // Endurecimiento B: persiste el canal efectivo + teléfono destino.
                  await persistNipDeliveryTarget(resolvedTargetOrder as Record<string, unknown>, {
                    deliveryChannel: 'whatsapp_recipient',
                    deliveryPhone: recipientPhone,
                  }, nowDate)
                } else {
                  // Anomalía (canal destinatario sin teléfono): el NIP no puede
                  // entregarse por ningún canal disponible → estado explícito
                  // `none` + incidencia operativa (no solo un log). nipDeliveryStatus
                  // queda pending → gate cerrado → escalar a soporte.
                  await persistNipDeliveryTarget(resolvedTargetOrder as Record<string, unknown>, {
                    deliveryChannel: 'none',
                  }, nowDate)
                  await recordDeliveryPinIncident(
                    resolvedTargetOrder as Record<string, unknown>,
                    repartidor as Record<string, unknown>,
                    'not_delivered',
                    nowDate
                  )
                  console.warn('[webhook EN PUERTA] canal destinatario sin teléfono; NIP no enviado', {
                    orderId: (resolvedTargetOrder as Record<string, unknown>)._id,
                  })
                }
              } else {
                // Canal remitente (o legado): `orden_repartidor` (nombre heredado de
                // Meta; va al CLIENTE, no al repartidor) con el NIP y botón Ayuda.
                notifications.push(sendMandadoOrdenPorCompletar({
                  _id: String((resolvedTargetOrder as Record<string, unknown>)._id),
                  phone: customerPhone,
                  orderNumber: String((resolvedTargetOrder as Record<string, unknown>).orderNumber ?? ''),
                  deliveryPin,
                }))
                // Endurecimiento B: persiste el canal efectivo + teléfono destino.
                if (customerPhone) {
                  await persistNipDeliveryTarget(resolvedTargetOrder as Record<string, unknown>, {
                    deliveryChannel: 'whatsapp_sender',
                    deliveryPhone: customerPhone,
                  }, nowDate)
                }
              }
            }
          } else {
            notifications.push(sendClienteRepartidorEnPuerta(
              customerPhone,
              String((resolvedTargetOrder as Record<string, unknown>).customerName),
              String((resolvedTargetOrder as Record<string, unknown>).orderNumber),
              deliveryPin
            ))
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
      const entregadoToken = matchDriverCommand(textBody, 'ENTREGADO')
      if (entregadoToken !== null) {
        const orderToken = buttonOrderId ?? (entregadoToken || null)
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

        // A (endurecimiento): NIP ya VERIFICADO es terminal e idempotente. Si un
        // webhook reintentado o un flujo interrumpido vuelve a disparar ENTREGADO
        // sobre una orden cuya entrega ya fue autenticada, se completa sin volver
        // a exigir ni re-validar el código (nunca se bloquea lo ya verificado).
        if (effectiveNipStatus(resolvedTargetOrder as Record<string, unknown>, nowDate) === 'verified') {
          const { nextState: verifiedNextState } = await completeDeliveredOrder(
            resolvedTargetOrder as Record<string, unknown>,
            repartidor,
            nowDate,
            now
          )
          await sendBotMessage(
            fromPhone,
            verifiedNextState === 'offline'
              ? 'Pedido entregado correctamente. Tu sesion de disponibilidad ya termino; responde INICIO para volver a conectarte.'
              : 'Pedido entregado correctamente. Gracias!'
          ).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        // Gate de entrega (PASO 1 + AJUSTE 3): SOLO se pide el NIP si la orden
        // realmente lo requiere Y, en mandados, si hay evidencia de que el código
        // fue entregado al canal configurado Y sigue vigente (no expiró). Un 200 de
        // Meta no basta; pending/sent/failed o expirado cierran el gate.
        if (orderRequiresDeliveryPin(resolvedTargetOrder as Record<string, unknown>)) {
          const blockReason = getDeliveryPinBlockReason(resolvedTargetOrder as Record<string, unknown>, nowDate)
          if (blockReason) {
            // Incidencia operativa (deduplicada): la entrega protegida no puede
            // completarse porque el código no fue entregado al canal o expiró.
            // Aparece en la bandeja del Dispatch Center; el repartidor NO tiene
            // un bypass automático (el override es decisión explícita de operación).
            await recordDeliveryPinIncident(
              resolvedTargetOrder as Record<string, unknown>,
              repartidor as Record<string, unknown>,
              blockReason,
              nowDate
            )
            await sendBotMessage(
              fromPhone,
              blockReason === 'expired'
                ? 'El código de entrega expiró. Contacta a soporte para completar la entrega.'
                : 'El código de entrega todavía no está disponible. No completes la entrega todavía.'
            ).catch(() => null)
            return NextResponse.json({ status: 'ok' })
          }
          await sendBotMessage(
            fromPhone,
            `Solicita al cliente el NIP de 6 digitos del pedido #${String((resolvedTargetOrder as Record<string, unknown>).orderNumber)} y respondelo aqui.`
          ).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        // Entrega segura desactivada (o verificación no requerida): la entrega se
        // completa directamente, sin solicitar ni validar NIP.
        const { nextState: noPinNextState } = await completeDeliveredOrder(
          resolvedTargetOrder as Record<string, unknown>,
          repartidor,
          nowDate,
          now
        )
        await sendBotMessage(
          fromPhone,
          noPinNextState === 'offline'
            ? 'Pedido entregado correctamente. Tu sesion de disponibilidad ya termino; responde INICIO para volver a conectarte.'
            : 'Pedido entregado correctamente. Gracias!'
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

        // A (endurecimiento): NIP ya VERIFICADO es terminal e idempotente. Un
        // segundo `NIP <FOLIO> <6>` (reintento del webhook, doble envío del
        // repartidor) sobre una entrega ya autenticada NO re-valida ni cuenta
        // intentos: reconoce la entrega como ya verificada y la completa.
        if (effectiveNipStatus(targetOrder as Record<string, unknown>, nowDate) === 'verified') {
          const { nextState: verifiedNextState } = await completeDeliveredOrder(
            targetOrder as Record<string, unknown>,
            repartidor,
            nowDate,
            now
          )
          await sendBotMessage(
            fromPhone,
            verifiedNextState === 'offline'
              ? 'NIP correcto. Pedido entregado correctamente. Tu sesion de disponibilidad ya termino; responde INICIO para volver a conectarte.'
              : 'NIP correcto. Pedido entregado correctamente. Gracias!'
          ).catch(() => null)
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

        // Gate de entrega (PASO 1 + AJUSTE 3): un mandado sin NIP entregado al
        // canal o con NIP expirado NUNCA valida aquí (aunque exista un NIP
        // almacenado o el método diga pin). Restaurantes conservan su flujo.
        const blockReason = getDeliveryPinBlockReason(targetOrder as Record<string, unknown>, nowDate)
        if (blockReason) {
          // Incidencia operativa (deduplicada, ver recordDeliveryPinIncident).
          await recordDeliveryPinIncident(
            targetOrder as Record<string, unknown>,
            repartidor as Record<string, unknown>,
            blockReason,
            nowDate
          )
          await sendBotMessage(
            fromPhone,
            blockReason === 'expired'
              ? 'El código de entrega expiró. Contacta a soporte para completar la entrega.'
              : 'El código de entrega todavía no está disponible. No completes la entrega todavía.'
          ).catch(() => null)
          return NextResponse.json({ status: 'ok' })
        }

        // Regla única de NIP (lib/delivery-pin.ts): validación real del código.
        if (!isDeliveryPinValid(String(targetOrder.orderNumber), deliveryPinCommand.pin, String(targetOrder.deliveryPinHash ?? ''))) {
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

        const { nextState } = await completeDeliveredOrder(targetOrder, repartidor, nowDate, now, { verifiedByDriver: true })
        await sendBotMessage(
          fromPhone,
          nextState === 'offline'
            ? 'NIP correcto. Pedido entregado correctamente. Tu sesion de disponibilidad ya termino; responde INICIO para volver a conectarte.'
            : 'NIP correcto. Pedido entregado correctamente. Gracias!'
        ).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }
// --- Cualquier otro mensaje de un repartidor registrado ---
      // Se captura en la bandeja de mensajes del Dispatch Center (soporteChat)
      // para que el operador pueda verlo y responderle por WhatsApp. Nunca se
      // descarta ni se oculta: es información real del repartidor.
      await backendClient
        .patch(repartidor._id)
        .setIfMissing({ soporteChat: [] })
        .append('soporteChat', [
          {
            _key: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'driver',
            body: String(rawIncomingText ?? textBody ?? '').trim().substring(0, 2000),
            createdAt: now,
            readAt: null,
          },
        ])
        .commit()
        .catch((error: unknown) => {
          console.error('[webhook soporte] error guardando mensaje del repartidor:', error)
        })

      // La confirmación se envía solo al abrir la conversación. Los siguientes
      // mensajes van al operador silenciosamente para que el chat se sienta como
      // una conversación real y no como un menú repetitivo.
      if (repartidor.soporteConversacionAbierta !== true) {
        await backendClient.patch(repartidor._id).set({ soporteConversacionAbierta: true }).commit().catch(() => null)
        void sendBotMessage(
          fromPhone,
          'Te leemos. Describe el problema y el equipo de soporte te responderá por este chat. Para cerrar esta conversación escribe FIN SOPORTE.'
        ).catch(() => null)
      }

  } catch (error) {
    console.error('[whatsapp webhook] Error:', error)
  }

  return NextResponse.json({ status: 'ok' })
}








