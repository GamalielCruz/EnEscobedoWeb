import { NextResponse } from 'next/server'
import { sendWhatsAppMessage } from '@/lib/whatsapp'

export async function GET() {
  try {
    const result = await sendWhatsAppMessage(
      '524427958919', // tu número personal con código de país, sin espacios ni +
      'Hola! Este es un mensaje de prueba desde la API 🎉'
    )
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}