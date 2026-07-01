const WHATSAPP_API_URL = "https://graph.facebook.com/v25.0";
const WHATSAPP_FETCH_TIMEOUT_MS = 8000;

async function fetchWhatsAppApi(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WHATSAPP_FETCH_TIMEOUT_MS);

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

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

  const response = await fetchWhatsAppApi(endpoint, accessToken, {
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
            text: String(text).substring(0, 60),
          })),
        },
        ...buttonComponents,
      ],
    },
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

  if (trimmed.startsWith("http")) {
    try {
      const url = new URL(trimmed);
      const q = url.searchParams.get("q");
      if (q) return encodeURIComponent(q).substring(0, 1800);
    } catch {}
  }

  return encodeURIComponent(trimmed).substring(0, 1800);
}

async function sendSpanishTemplate(
  phone: string,
  templateName: string,
  variables: string[],
  buttonComponents: Array<Record<string, unknown>> = []
) {
  try {
    return await sendWhatsAppTemplate(phone, templateName, variables, "es_MX", buttonComponents);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const shouldFallbackToEs =
      message.includes("does not exist in es_MX") ||
      message.includes("does not exist in the translation");

    if (!shouldFallbackToEs) {
      throw error;
    }

    console.warn(`[whatsapp] ${templateName} no existe en es_MX, reintentando con es`);
    return sendWhatsAppTemplate(phone, templateName, variables, "es", buttonComponents);
  }
}
export async function sendWhatsAppMessage(to: string, message: string) {
  const normalizedPhone = normalizeWhatsAppPhone(to);

  if (!normalizedPhone) {
    throw new Error("Telefono invalido para WhatsApp");
  }

  const { endpoint, accessToken } = getWhatsAppEndpoint();
  const response = await fetchWhatsAppApi(endpoint, accessToken, {
    messaging_product: "whatsapp",
    to: normalizedPhone,
    type: "text",
    text: { body: message },
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
  return sendSpanishTemplate(phone, "confirmacion_pedido", [
    name.substring(0, 30),
    orderNumber.substring(0, 30),
  ]);
}

export async function sendOrderOnTheWay(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "pedido_en_camino", [
    name.substring(0, 30),
    orderNumber.substring(0, 30),
  ]);
}

export async function sendOrderDelivered(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "pedido_entregado", [
    name.substring(0, 30),
    orderNumber.substring(0, 30),
  ]);
}

export async function sendOrderCancelled(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "pedido_cancelado", [
    name.substring(0, 30),
    orderNumber.substring(0, 30),
  ]);
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
  return sendSpanishTemplate(phone, "cliente_repartidor_en_puerta", [
    customerName.substring(0, 30),
    orderNumber.substring(0, 30),
  ]);
}

// Mensajes de texto libre del bot hacia repartidores (respuestas a comandos y recordatorios)
// Se puede usar porque el repartidor habrá iniciado conversación con INICIO
export async function sendBotMessage(phone: string, message: string) {
  return sendWhatsAppMessage(phone, message);
}

