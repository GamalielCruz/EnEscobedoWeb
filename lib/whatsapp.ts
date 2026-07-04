const WHATSAPP_API_URL = "https://graph.facebook.com/v25.0";
const WHATSAPP_FETCH_TIMEOUT_MS = 8000;

type WhatsAppErrorPayload = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_data?: {
    details?: string;
  };
  error_user_msg?: string;
};

class WhatsAppApiError extends Error {
  code?: number;
  errorSubcode?: number;
  details?: string;
  type?: string;

  constructor(payload: WhatsAppErrorPayload) {
    const details = [
      payload.message,
      payload.error_data?.details,
      payload.error_user_msg,
    ]
      .filter(Boolean)
      .join(" | ");

    super(details || "Error enviando plantilla");
    this.name = "WhatsAppApiError";
    this.code = payload.code;
    this.errorSubcode = payload.error_subcode;
    this.details = payload.error_data?.details;
    this.type = payload.type;
  }
}

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
    throw new WhatsAppApiError((data?.error ?? {}) as WhatsAppErrorPayload);
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

function buildQuickReplyPayloadButton(index: string, payload: string) {
  return {
    type: "button",
    sub_type: "quick_reply",
    index,
    parameters: [{ type: "payload", payload: String(payload).substring(0, 128) }],
  };
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
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const shouldFallbackToEs =
      message.includes("does not exist in es_mx") ||
      message.includes("does not exist in the translation") ||
      message.includes("template name does not exist") ||
      (message.includes("does not exist") && message.includes("es_mx")) ||
      (message.includes("translation") && message.includes("es_mx")) ||
      (message.includes("language") && message.includes("es_mx"));

    if (!shouldFallbackToEs) {
      throw error;
    }

    if (error instanceof WhatsAppApiError) {
      console.warn(
        `[whatsapp] ${templateName} fallo en es_MX; reintentando con es`,
        {
          code: error.code,
          errorSubcode: error.errorSubcode,
          details: error.details,
          type: error.type,
        }
      );
    } else {
      console.warn(`[whatsapp] ${templateName} fallo en es_MX; reintentando con es:`, error);
    }

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

export async function sendBundleDeliveryOffer(
  phone: string,
  restaurantName: string,
  orderNumbers: string[],
  total: string,
  deliveries: number
) {
  const ordersLabel = orderNumbers.map((orderNumber) => `#${orderNumber.substring(0, 30)}`).join(", ");

  return sendBotMessage(
    phone,
    `Tienes una oferta multiple del mismo restaurante.\n\nRestaurante: ${restaurantName.substring(0, 60)}\nPedidos: ${deliveries}\nFolios: ${ordersLabel}\nPago total estimado: ${total}\nEntregas: ${deliveries}\n\nAceptas llevar ambos pedidos?\n\n1. Aceptar\n2. Rechazar\n\nResponde ACEPTO o RECHAZAR.`
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
  return sendSpanishTemplate(
    phone,
    "confirmacion_repartidor",
    [
      orderNumber.substring(0, 30),
      restaurantName.substring(0, 30),
      deliveryAddress.substring(0, 60),
      paymentMethod.substring(0, 30),
    ],
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

export async function sendRepartidorEnCamino(phone: string, orderNumber: string, orderId: string) {
  return sendSpanishTemplate(
    phone,
    "repartidor_en_camino",
    [orderNumber.substring(0, 30)],
    [buildQuickReplyPayloadButton("0", `EN_PUERTA|${orderId}`)]
  );
}

export async function sendRepartidorEnPuerta(phone: string, orderNumber: string, orderId: string) {
  return sendSpanishTemplate(
    phone,
    "repartidor_en_puerta",
    [orderNumber.substring(0, 30)],
    [buildQuickReplyPayloadButton("0", `ENTREGADO|${orderId}`)]
  );
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


