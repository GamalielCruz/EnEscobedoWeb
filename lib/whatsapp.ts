const WHATSAPP_API_URL = 'https://graph.facebook.com/v19.0'

export async function sendWhatsAppMessage(to: string, message: string) {
  const response = await fetch(
    `${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      }),
    }
  )

  const data = await response.json()
  
  if (!response.ok) {
    console.error('[whatsapp] Error:', data)
    throw new Error(data.error?.message || 'Error enviando mensaje')
  }

  return data
}