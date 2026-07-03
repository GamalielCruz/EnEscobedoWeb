import { NextRequest, NextResponse } from 'next/server'
import { backendClient } from '@/sanity/lib/backendClient'
import { sendBotMessage } from '@/lib/whatsapp'

export const dynamic = "force-dynamic";
export const revalidate = 0;
const TEN_MINUTES_MS = 10 * 60 * 1000

type RepartidorCron = {
  _id: string
  nombre: string
  telefono: string
  disponibleHasta?: string
  extensionPendiente?: boolean
  extensionPreguntadaAt?: string
  tienePedidoActivo?: boolean
}

function getExtensionPrompt(): string {
  return `Tu sesión termina en aproximadamente 10 minutos.

¿Quieres extender tu disponibilidad?

1️⃣ Extender 1 hora
2️⃣ Extender 2 horas
3️⃣ Terminar al finalizar`
}

export async function GET(req: NextRequest) {
  // Protección con Bearer token
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()
  const nowIso = now.toISOString()
  const summary = {
    extensionesPreguntadas: 0,
    desconectadosPorFinSesion: 0,
    pedidosActivosOmitidos: 0,
    errores: 0,
  }

  try {
    // --- FASE 1: Sesiones finalizadas ---
    const candidatosDesconectar: RepartidorCron[] = await backendClient.fetch(
      `*[
        _type == "repartidor" &&
        disponible == true &&
        estadoDisponibilidad == "available" &&
        defined(disponibleHasta) &&
        disponibleHasta <= $now
      ]{
        _id,
        nombre,
        telefono,
        disponibleHasta,
        extensionPendiente,
        extensionPreguntadaAt,
        "tienePedidoActivo": count(*[_type == "order" && repartidorAsignado._ref == ^._id && status == "shipped"]) > 0
      }`,
      { now: nowIso }
    )

    console.log('[cron/check-repartidores] Repartidores vencidos encontrados', {
      total: candidatosDesconectar.length,
      now: nowIso,
      repartidores: candidatosDesconectar.map((rep) => ({
        id: rep._id,
        nombre: rep.nombre,
        disponibleHasta: rep.disponibleHasta,
        extensionPendiente: rep.extensionPendiente ?? false,
        tienePedidoActivo: rep.tienePedidoActivo ?? false,
      })),
    })

    await Promise.allSettled(
      candidatosDesconectar.map(async (rep) => {
        try {
          if (rep.tienePedidoActivo) {
            summary.pedidosActivosOmitidos++
            console.log('[cron/check-repartidores] Repartidor saltado por pedido activo', {
              id: rep._id,
              nombre: rep.nombre,
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
            `Tu sesión de disponibilidad terminó.
Te desconectamos automáticamente.

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

    // --- FASE 2: Sesiones por expirar en <= 10 minutos ---
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
          console.log(`[cron/check-repartidores] Extensión enviada a ${rep.nombre}`)
        } catch (e) {
          summary.errores++
          console.error(`[cron/check-repartidores] Error enviando extensión a ${rep.nombre}:`, e)
        }
      })
    )

  } catch (error) {
    console.error('[cron/check-repartidores] Error general:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...summary, timestamp: now.toISOString() })
}
