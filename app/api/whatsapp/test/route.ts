import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: '524427958919',
          type: 'template',
          template: {
            name: 'confirmacion_pedido',
            language: { code: 'es' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: 'Ignacio' },
                  { type: 'text', text: 'ORD-001' }
                ]
              }
            ]
          }
        }),
      }
    )
    const result = await response.json()
    if (!response.ok) {
      throw new Error(result.error?.message || 'Error enviando mensaje')
    }
    return NextResponse.json({ success: true, result })
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}