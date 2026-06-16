import { NextRequest, NextResponse } from 'next/server'
import { backendClient } from '@/sanity/lib/backendClient'
import { sendWhatsAppMessage, sendOrderOnTheWay, normalizeWhatsAppPhone } from '@/lib/whatsapp'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'garoga_verify_token'

// Consulta para buscar la orden con datos completos de oferta
const ORDER_BY_NUMBER_QUERY = `*[_type == "order" && orderNumber == $orderNumber][0]{
  _id,
  orderNumber,
  customerName,
  phone,
  status,
  deliveryOfertaEnviada,
  deliveryOfertaExpiresAt,
  "repartidorAsignadoRef": repartidorAsignado._ref,
  "storeAddress": affiliateStore->address.street,
  "storeName": affiliateStore->name
}`

// Consulta para encontrar repartidor por teléfono normalizado
const REPARTIDOR_BY_PHONE_QUERY = `*[_type == "repartidor" && telefono == $telefono][0]{
  _id, nombre, telefono
}`

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
    // Extraer el mensaje de texto entrante del payload de Meta
    const entry = (body?.entry as Record<string, unknown>[])?.[0]
    const changes = (entry?.changes as Record<string, unknown>[])?.[0]
    const value = changes?.value as Record<string, unknown> | undefined
    const messages = value?.messages as Record<string, unknown>[] | undefined
    const message = messages?.[0]

    if (!message || message.type !== 'text') {
      return NextResponse.json({ status: 'ok' })
    }

    const fromPhone = message.from as string
    const textBody = ((message.text as Record<string, unknown>)?.body as string ?? '').trim().toUpperCase()

    // Detectar patrón "ACEPTO [número de pedido]"
    const match = textBody.match(/^ACEPTO\s+([A-Z0-9-]+)$/i)
    if (!match) {
      return NextResponse.json({ status: 'ok' })
    }

    const orderNumber = match[1].toUpperCase()
    console.log(`[whatsapp webhook] ACEPTO recibido para pedido ${orderNumber} de ${fromPhone}`)

    // Buscar la orden
    const order = await backendClient.fetch(ORDER_BY_NUMBER_QUERY, { orderNumber })

    if (!order) {
      void sendWhatsAppMessage(fromPhone, `Lo sentimos, el pedido #${orderNumber} no existe.`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // Verificar que la oferta fue enviada
    if (!order.deliveryOfertaEnviada) {
      void sendWhatsAppMessage(fromPhone, `Lo sentimos, este pedido #${orderNumber} ya no está disponible.`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // Verificar que no fue ya tomado
    if (order.repartidorAsignadoRef) {
      void sendWhatsAppMessage(fromPhone, `Lo sentimos, el pedido #${orderNumber} ya fue tomado por otro repartidor.`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // Verificar que la oferta no ha expirado
    if (order.deliveryOfertaExpiresAt) {
      const expires = new Date(order.deliveryOfertaExpiresAt).getTime()
      if (Date.now() > expires) {
        void sendWhatsAppMessage(fromPhone, `Lo sentimos, la oferta del pedido #${orderNumber} ya expiró.`).catch(() => null)
        return NextResponse.json({ status: 'ok' })
      }
    }

    // Buscar repartidor por teléfono (probar con y sin código de país)
    const normalizedFrom = normalizeWhatsAppPhone(fromPhone)
    let repartidor = null

    if (normalizedFrom) {
      repartidor = await backendClient.fetch(REPARTIDOR_BY_PHONE_QUERY, { telefono: normalizedFrom })
    }
    if (!repartidor) {
      repartidor = await backendClient.fetch(REPARTIDOR_BY_PHONE_QUERY, { telefono: fromPhone })
    }

    if (!repartidor) {
      void sendWhatsAppMessage(fromPhone, `Tu número no está registrado como repartidor. Contacta al administrador.`).catch(() => null)
      return NextResponse.json({ status: 'ok' })
    }

    // Asignar repartidor a la orden
    const now = new Date().toISOString()
    await backendClient
      .patch(order._id)
      .set({
        repartidorAsignado: { _type: 'reference', _ref: repartidor._id },
        repartidorAsignadoAt: now,
        status: 'shipped',
        updatedAt: now,
      })
      .commit()

    // Notificar al repartidor asignado
    const storeAddress = order.storeAddress ?? order.storeName ?? 'la tienda'
    void sendWhatsAppMessage(
      fromPhone,
      `✅ Pedido #${orderNumber} asignado a ti. Dirígete a ${storeAddress} para recogerlo.`
    ).catch(() => null)

    // Notificar al cliente
    if (order.phone && order.customerName && order.orderNumber) {
      void sendOrderOnTheWay(order.phone, order.customerName, order.orderNumber).catch(() => null)
    }

    // Notificar a los demás repartidores que la oferta ya fue tomada
    const offeredDriversQuery = order.repartidorAsignadoRef
      ? `*[_type == "repartidor" && activo == true && _id != $assignedId && telefono != $assignedPhone]{_id, nombre, telefono}`
      : `*[_type == "repartidor" && activo == true && _id != $assignedId]{_id, nombre, telefono}`

    const otherDrivers: Array<{ _id: string; nombre: string; telefono: string }> =
      await backendClient.fetch(offeredDriversQuery, {
        assignedId: repartidor._id,
        assignedPhone: repartidor.telefono,
      })

    void Promise.allSettled(
      otherDrivers.map((d) =>
        sendWhatsAppMessage(
          d.telefono,
          `El pedido #${orderNumber} ya fue tomado. ¡Gracias por estar disponible!`
        )
      )
    ).catch(() => null)

    console.log(`[whatsapp webhook] Pedido ${orderNumber} asignado a ${repartidor.nombre}`)

  } catch (error) {
    console.error('[whatsapp webhook] Error procesando ACEPTO:', error)
  }

  return NextResponse.json({ status: 'ok' })
}
