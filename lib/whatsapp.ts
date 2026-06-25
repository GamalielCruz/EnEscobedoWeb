const WHATSAPP_API_URL = "https://graph.facebook.com/v25.0";

function getWhatsAppEndpoint() {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    throw new Error("Missing WhatsApp environment variables");
  }

  return {
    endpoint: `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
    accessToken,
  };
}

export function normalizeWhatsAppPhone(phone?: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `52${digits}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return digits;
  }

  return null;
}

async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: string[],
  languageCode: string = "es",
  buttonComponents: Array<Record<string, unknown>> = []
) {
  const normalizedPhone = normalizeWhatsAppPhone(to);

  if (!normalizedPhone) {
    throw new Error("Telefono invalido para WhatsApp");
  }

  const { endpoint, accessToken } = getWhatsAppEndpoint();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: "body",
            parameters: variables.map((text) => ({
              type: "text",
              text: String(text),
            })),
          },
          ...buttonComponents,
        ],
      },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[whatsapp] Error:", data);
    throw new Error(data.error?.message || "Error enviando plantilla");
  }

  return data;
}

function toWhatsAppUrlButtonParam(value: string) {
  const trimmed = String(value || "").trim();
  const mapsPrefix = "https://maps.google.com/maps?q=";

  if (trimmed.startsWith(mapsPrefix)) {
    return trimmed.slice(mapsPrefix.length);
  }

  return trimmed;
}

export async function sendWhatsAppMessage(to: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(to);

  if (!normalizedPhone) {
    throw new Error("Telefono invalido para WhatsApp");
  }

  const { endpoint, accessToken } = getWhatsAppEndpoint();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: normalizedPhone,
      type: "text",
      text: { body: message },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("[whatsapp] Error:", data);
    throw new Error(data.error?.message || "Error enviando mensaje");
  }

  return data;
}

export async function sendOrderConfirmation(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendWhatsAppTemplate(phone, "confirmacion_pedido", [name, orderNumber]);
}

export async function sendOrderOnTheWay(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendWhatsAppTemplate(phone, "pedido_en_camino", [name, orderNumber], "es_MX");
}

export async function sendOrderDelivered(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendWhatsAppTemplate(phone, "pedido_entregado", [name, orderNumber], "es_MX");
}

export async function sendOrderCancelled(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendWhatsAppTemplate(phone, "pedido_cancelado", [name, orderNumber], "es_MX");
}

export async function sendDeliveryOffer(
  phone: string,
  orderNumber: string,
  customerName: string,
  restaurantName: string,
  address: string,
  total: string,
  paymentMethod: string,
  mapsUrl: string
) {
  return sendWhatsAppTemplate(
    phone,
    "oferta_reparto",
    [orderNumber, customerName, restaurantName, address, total, paymentMethod],
    "es_MX",
    [
      {
        type: "button",
        sub_type: "url",
        index: "2",
        parameters: [{ type: "text", text: toWhatsAppUrlButtonParam(mapsUrl) }],
      },
    ]
  );
}

export async function sendConfirmacionRepartidor(
  phone: string,
  orderNumber: string,
  restaurantName: string,
  deliveryAddress: string,
  paymentMethod: string,
  restaurantMapsUrl: string,
  clientMapsUrl: string
) {
  return sendWhatsAppTemplate(
    phone,
    "confirmacion_repartidor",
    [orderNumber, restaurantName, deliveryAddress, paymentMethod],
    "es_MX",
    [
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: toWhatsAppUrlButtonParam(restaurantMapsUrl) }],
      },
      {
        type: "button",
        sub_type: "url",
        index: "1",
        parameters: [{ type: "text", text: toWhatsAppUrlButtonParam(clientMapsUrl) }],
      },
    ]
  );
}

export async function sendRepartidorEnCamino(phone: string, orderNumber: string) {
  return sendWhatsAppTemplate(phone, "repartidor_en_camino", [orderNumber], "es_MX");
}

export async function sendRepartidorEnPuerta(phone: string, orderNumber: string) {
  return sendWhatsAppTemplate(phone, "repartidor_en_puerta", [orderNumber], "es_MX");
}

export async function sendClienteRepartidorEnPuerta(
  phone: string,
  customerName: string,
  orderNumber: string
) {
  return sendWhatsAppTemplate(phone, "repartidor_en_puerta", [customerName, orderNumber], "es_MX");
}

// Mensajes de texto libre del bot hacia repartidores (respuestas a comandos y recordatorios)
// Se puede usar porque el repartidor habrá iniciado conversación con INICIO
export async function sendBotMessage(phone: string, message: string) {
  return sendWhatsAppMessage(phone, message);
}
