import { NextRequest, NextResponse } from 'next/server'
import { backendClient } from '@/sanity/lib/backendClient'
import { sendBotMessage } from '@/lib/whatsapp'

const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000
const THIRTY_MINUTES_MS = 30 * 60 * 1000

type RepartidorCron = {
  _id: string
  nombre: string
  telefono: string
  disponibleDesde?: string
  confirmacionEnviadaAt?: string
}

export async function GET(req: NextRequest) {
  // Protección con Bearer token
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const now = new Date()
  const summary = {
    recordatoriosEnviados: 0,
    desconectadosPorInactividad: 0,
    errores: 0,
  }

  try {
    // --- FASE 1: Repartidores disponibles >8h sin recordatorio pendiente ---
    const threshold8h = new Date(now.getTime() - EIGHT_HOURS_MS).toISOString()

    const candidatosRecordatorio: RepartidorCron[] = await backendClient.fetch(
      `*[_type == "repartidor" && disponible == true && pendienteConfirmacion == false && disponibleDesde < $threshold]{
        _id, nombre, telefono, disponibleDesde
      }`,
      { threshold: threshold8h }
    )

    await Promise.allSettled(
      candidatosRecordatorio.map(async (rep) => {
        try {
          await backendClient
            .patch(rep._id)
            .set({ pendienteConfirmacion: true, confirmacionEnviadaAt: now.toISOString() })
            .commit()

          await sendBotMessage(
            rep.telefono,
            `¿Sigues en servicio? Responde SI para continuar o NO para desconectarte. Si no respondes en 30 minutos te desconectaremos automáticamente.`
          )

          summary.recordatoriosEnviados++
          console.log(`[cron/check-repartidores] Recordatorio enviado a ${rep.nombre}`)
        } catch (e) {
          summary.errores++
          console.error(`[cron/check-repartidores] Error con ${rep.nombre}:`, e)
        }
      })
    )

    // --- FASE 2: Repartidores con confirmación pendiente >30min ---
    const threshold30m = new Date(now.getTime() - THIRTY_MINUTES_MS).toISOString()

    const candidatosDesconectar: RepartidorCron[] = await backendClient.fetch(
      `*[_type == "repartidor" && pendienteConfirmacion == true && confirmacionEnviadaAt < $threshold]{
        _id, nombre, telefono, confirmacionEnviadaAt
      }`,
      { threshold: threshold30m }
    )

    await Promise.allSettled(
      candidatosDesconectar.map(async (rep) => {
        try {
          await backendClient
            .patch(rep._id)
            .set({ disponible: false, pendienteConfirmacion: false })
            .commit()

          await sendBotMessage(
            rep.telefono,
            `Te hemos desconectado por inactividad. Manda INICIO cuando estés listo.`
          )

          summary.desconectadosPorInactividad++
          console.log(`[cron/check-repartidores] Desconectado por inactividad: ${rep.nombre}`)
        } catch (e) {
          summary.errores++
          console.error(`[cron/check-repartidores] Error desconectando ${rep.nombre}:`, e)
        }
      })
    )

  } catch (error) {
    console.error('[cron/check-repartidores] Error general:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }

  return NextResponse.json({ success: true, ...summary, timestamp: now.toISOString() })
}
