import { NextRequest, NextResponse } from 'next/server'
import { backendClient } from '@/sanity/lib/backendClient'
import { appendOrderEvent } from '@/lib/order-events'
import { redispatchOrders, releaseOrdersForDriver } from '@/lib/delivery-dispatch'
import { sendBotMessage } from '@/lib/whatsapp'

export const dynamic = "force-dynamic";
export const revalidate = 0;
const TEN_MINUTES_MS = 10 * 60 * 1000

type RepartidorCron = {
  _id: string
  nombre: string
  telefono: string
  disponibleHasta?: string
  estadoDisponibilidad?: 'available' | 'offline' | 'busy' | 'offer_pending'
  extensionPendiente?: boolean
  extensionPreguntadaAt?: string
  ofertaTipo?: 'single' | 'bundle'
  ofertaExpiraAt?: string
  ultimoPedidoOfertadoRef?: string
  pedidosOfertadosRefs?: string[]
}

function getExtensionPrompt(): string {
  return `Tu sesion termina en aproximadamente 10 minutos.

Quieres extender tu disponibilidad?

1. Extender 1 hora
2. Extender 2 horas
3. Terminar al finalizar`
}

function getPendingOfferOrderIds(rep: RepartidorCron): string[] {
  if (Array.isArray(rep.pedidosOfertadosRefs) && rep.pedidosOfertadosRefs.length > 0) {
    return rep.pedidosOfertadosRefs.filter(Boolean).slice(0, 2)
  }

  return rep.ultimoPedidoOfertadoRef ? [rep.ultimoPedidoOfertadoRef] : []
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const summary = {
    ofertasExpiradas: 0,
    bundlesExpirados: 0,
    extensionesPreguntadas: 0,
    desconectadosPorFinSesion: 0,
    ocupadosOmitidos: 0,
    ofertasPendientesOmitidas: 0,
    errores: 0,
  }

  try {
    const candidatosOfertasExpiradas: RepartidorCron[] = await backendClient.fetch(
      `*[
        _type == "repartidor" &&
        disponible == true &&
        estadoDisponibilidad == "offer_pending" &&
        defined(ofertaExpiraAt) &&
        ofertaExpiraAt <= $now
      ]{
        _id,
        nombre,
        telefono,
        estadoDisponibilidad,
        ofertaTipo,
        ofertaExpiraAt,
        "ultimoPedidoOfertadoRef": ultimoPedidoOfertado._ref,
        "pedidosOfertadosRefs": pedidosOfertados[]._ref
      }`,
      { now: nowIso }
    )

    await Promise.allSettled(
      candidatosOfertasExpiradas.map(async (rep) => {
        const orderIds = getPendingOfferOrderIds(rep)

        try {
          await backendClient
            .patch(rep._id)
            .set({
              estadoDisponibilidad: 'available',
              ultimaActividad: nowIso,
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

          if (rep.ofertaTipo === 'bundle') {
            summary.bundlesExpirados++
            console.log('[cron/check-repartidores] bundle expirado', {
              repartidorId: rep._id,
              repartidorNombre: rep.nombre,
              orderIds,
              ofertaExpiraAt: rep.ofertaExpiraAt,
            })
          } else {
            summary.ofertasExpiradas++
            console.log('[cron/check-repartidores] oferta individual expirada', {
              repartidorId: rep._id,
              repartidorNombre: rep.nombre,
              orderIds,
              ofertaExpiraAt: rep.ofertaExpiraAt,
            })
          }

          if (orderIds.length > 0) {
            const releasedOrderIds = await releaseOrdersForDriver(orderIds, rep._id, 'offer_expired')
            if (releasedOrderIds.length > 0) {
              await Promise.allSettled(releasedOrderIds.map((orderId) => appendOrderEvent(orderId, { type: 'offer_expired', source: 'cron/check-repartidores', actor: rep._id })))
              await redispatchOrders(releasedOrderIds, [rep._id])
            }
          }
        } catch (e) {
          summary.errores++
          console.error('[cron/check-repartidores] Error expirando oferta pendiente', {
            id: rep._id,
            nombre: rep.nombre,
            orderIds,
            error: e,
          })
        }
      })
    )

    const candidatosDesconectar: RepartidorCron[] = await backendClient.fetch(
      `*[
        _type == "repartidor" &&
        disponible == true &&
        estadoDisponibilidad in ["available", "busy", "offer_pending"] &&
        defined(disponibleHasta) &&
        disponibleHasta <= $now
      ]{
        _id,
        nombre,
        telefono,
        estadoDisponibilidad,
        disponibleHasta,
        extensionPendiente,
        extensionPreguntadaAt
      }`,
      { now: nowIso }
    )

    console.log('[cron/check-repartidores] Repartidores vencidos encontrados', {
      total: candidatosDesconectar.length,
      now: nowIso,
      repartidores: candidatosDesconectar.map((rep) => ({
        id: rep._id,
        nombre: rep.nombre,
        estadoDisponibilidad: rep.estadoDisponibilidad,
        disponibleHasta: rep.disponibleHasta,
        extensionPendiente: rep.extensionPendiente ?? false,
      })),
    })

    await Promise.allSettled(
      candidatosDesconectar.map(async (rep) => {
        try {
          if (rep.estadoDisponibilidad === 'busy') {
            summary.ocupadosOmitidos++
            console.log('[cron/check-repartidores] Repartidor saltado por estado ocupado', {
              id: rep._id,
              nombre: rep.nombre,
              estadoDisponibilidad: rep.estadoDisponibilidad,
              disponibleHasta: rep.disponibleHasta,
            })
            return
          }

          if (rep.estadoDisponibilidad === 'offer_pending') {
            summary.ofertasPendientesOmitidas++
            console.log('[cron/check-repartidores] Repartidor omitido por oferta pendiente', {
              id: rep._id,
              nombre: rep.nombre,
              estadoDisponibilidad: rep.estadoDisponibilidad,
              disponibleHasta: rep.disponibleHasta,
            })
            return
          }

          await backendClient
            .patch(rep._id)
            .set({
              disponible: false,
              estadoDisponibilidad: 'offline',
              extensionPendiente: false,
              autoDesconectadoAt: nowIso,
              motivoDesconexion: 'sesion_finalizada',
              ultimaActividad: nowIso,
              pendienteConfirmacion: false,
              esperandoSeleccionDisponibilidad: false,
            })
            .unset(['extensionPreguntadaAt', 'confirmacionEnviadaAt'])
            .commit()

          await sendBotMessage(
            rep.telefono,
            `Tu sesion de disponibilidad termino.
Te desconectamos automaticamente.

Responde INICIO cuando quieras volver a estar disponible.`
          )

          summary.desconectadosPorFinSesion++
          console.log('[cron/check-repartidores] Repartidor desconectado', {
            id: rep._id,
            nombre: rep.nombre,
            disponibleHasta: rep.disponibleHasta,
            desconectadoAt: nowIso,
          })
        } catch (e) {
          summary.errores++
          console.error('[cron/check-repartidores] Error al actualizar Sanity', {
            id: rep._id,
            nombre: rep.nombre,
            disponibleHasta: rep.disponibleHasta,
            error: e,
          })
        }
      })
    )

    const extensionThreshold = new Date(now.getTime() + TEN_MINUTES_MS).toISOString()

    const candidatosExtension: RepartidorCron[] = await backendClient.fetch(
      `*[
        _type == "repartidor" &&
        disponible == true &&
        estadoDisponibilidad == "available" &&
        defined(disponibleHasta) &&
        disponibleHasta > $now &&
        disponibleHasta <= $extensionThreshold &&
        extensionPendiente != true
      ]{
        _id,
        nombre,
        telefono,
        disponibleHasta,
        extensionPendiente,
        extensionPreguntadaAt
      }`,
      { now: nowIso, extensionThreshold }
    )

    await Promise.allSettled(
      candidatosExtension.map(async (rep) => {
        try {
          await backendClient
            .patch(rep._id)
            .set({ extensionPendiente: true, extensionPreguntadaAt: nowIso })
            .commit()

          await sendBotMessage(rep.telefono, getExtensionPrompt())

          summary.extensionesPreguntadas++
          console.log(`[cron/check-repartidores] Extension enviada a ${rep.nombre}`)
        } catch (e) {
          summary.errores++
          console.error(`[cron/check-repartidores] Error enviando extension a ${rep.nombre}:`, e)
        }
      })
    )
  } catch (error) {
    console.error('[cron/check-repartidores] Error general:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...summary, timestamp: now.toISOString() })
}


