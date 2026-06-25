import { NextResponse } from 'next/server'
import { sendDeliveryOffer, sendWhatsAppMessage } from '@/lib/whatsapp'

export async function GET() {
  const testPhone = '524427958919' // teléfono del repartidor de prueba

  const results: Record<string, unknown> = {}

  // Test 1: mensaje de texto libre (sendBotMessage / sendWhatsAppMessage)
  try {
    const r = await sendWhatsAppMessage(testPhone, 'Prueba de mensaje de texto desde el bot 🤖')
    results.textMessage = { success: true, response: r }
  } catch (e) {
    results.textMessage = { success: false, error: String(e) }
  }

  // Test 2: plantilla oferta_reparto (sendDeliveryOffer)
  try {
    const r = await sendDeliveryOffer(
      testPhone,
      'TEST-001',
      'Cliente de Prueba',
      'Restaurante de Prueba',
      'Calle Falsa 123, Pedro Escobedo',
      '$150.00 MXN',
      'YA PAGADO',
      'https://maps.google.com/maps?q=Calle%20Falsa%20123%2C%20Pedro%20Escobedo'
    )
    results.deliveryOffer = { success: true, response: r }
  } catch (e) {
    results.deliveryOffer = { success: false, error: String(e) }
  }

  return NextResponse.json(results)
}
