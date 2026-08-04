import { assertProductionIntegration } from "./deployment-environment";

const WHATSAPP_API_URL = "https://graph.facebook.com/v25.0";
const WHATSAPP_FETCH_TIMEOUT_MS = 8000;
const RESTAURANTE_PICKUP_TEMPLATE_NAME =
  process.env.WHATSAPP_TEMPLATE_RESTAURANTE_PICKUP?.trim() || "restaurante_pickup_pedido";
const CLIENTE_PICKUP_READY_TEMPLATE_NAME =
  process.env.WHATSAPP_TEMPLATE_CLIENTE_PICKUP_READY?.trim() || "cliente_pickup_orden_lista";
const NUEVO_PEDIDO_RESTAURANTE_BODY_LIMIT = 1024;
const NUEVO_PEDIDO_RESTAURANTE_SAFETY_MARGIN = 48;
const NUEVO_PEDIDO_RESTAURANTE_FIXED_BODY =
  "Tienes un nuevo pedido en .\n\nPedido: #\nCliente: \nProductos:\n\n\nTotal: $\nTipo: \n\nGracias por utilizar ElMenu.";

/**
 * Sanitize text for WhatsApp template parameters
 * Removes newlines, tabs, and excessive spaces (more than 4 consecutive)
 */
function sanitizeWhatsAppParam(text: string): string {
  return text
    .replace(/[\n\r\t]/g, ' ') // Replace newlines, tabs with space
    .replace(/\s{5,}/g, '    ') // Limit to max 4 consecutive spaces
    .trim();
}

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
  assertProductionIntegration("WhatsApp");
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

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  variables: string[],
  languageCode: string = "es",
  buttonComponents: Array<Record<string, unknown>> = [],
  maxTextLength: number = 60
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
            text: String(text).substring(0, maxTextLength),
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

function fitTextToBudget(text: string, maxLength: number, fallback: string) {
  const normalized = String(text || "").trim();
  if (maxLength <= 0) {
    return fallback;
  }

  if (normalized.length <= maxLength) {
    return normalized || fallback;
  }

  const ellipsis = "...";
  if (maxLength <= ellipsis.length) {
    return ellipsis.substring(0, maxLength);
  }

  const candidate = normalized.slice(0, maxLength - ellipsis.length);
  const lastLineBreak = candidate.lastIndexOf("\n");
  const truncatedBase =
    lastLineBreak >= Math.floor(candidate.length * 0.6)
      ? candidate.slice(0, lastLineBreak).trimEnd()
      : candidate.trimEnd();

  return `${truncatedBase || candidate.trimEnd()}${ellipsis}`;
}

async function sendSpanishTemplate(
  phone: string,
  templateName: string,
  variables: string[],
  buttonComponents: Array<Record<string, unknown>> = [],
  maxTextLength: number = 60
) {
  try {
    return await sendWhatsAppTemplate(
      phone,
      templateName,
      variables,
      "es_MX",
      buttonComponents,
      maxTextLength
    );
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

    return sendWhatsAppTemplate(
      phone,
      templateName,
      variables,
      "es",
      buttonComponents,
      maxTextLength
    );
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
    sanitizeWhatsAppParam(name.substring(0, 30)),
    sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
  ]);
}

export async function sendPickupOrderReceived(
  phone: string,
  name: string,
  orderNumber: string,
  storeName: string,
  total: string,
  paymentMethod: string,
  storeMapsUrl: string
) {
  return sendSpanishTemplate(
    phone,
    "cliente_pickup_recibido",
    [
      sanitizeWhatsAppParam(name.substring(0, 30)),
      sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
      sanitizeWhatsAppParam(storeName.substring(0, 60)),
      sanitizeWhatsAppParam(total.substring(0, 30)),
      sanitizeWhatsAppParam(paymentMethod.substring(0, 40)),
    ],
    [
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: toWhatsAppUrlButtonParam(storeMapsUrl) }],
      },
    ]
  );
}

export async function sendRestaurantePickupPedido(
  phone: string,
  orderNumber: string,
  customerName: string,
  customerPhone: string,
  products: string,
  total: string,
  paymentMethod: string,
  orderId: string
) {
  const safeProducts = fitTextToBudget(products, 500, "Sin productos");
  // Sanitize products to remove newlines, tabs, and excessive spaces
  const sanitizedProducts = sanitizeWhatsAppParam(safeProducts);
  
  return sendSpanishTemplate(
    phone,
    RESTAURANTE_PICKUP_TEMPLATE_NAME,
    [
      sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
      sanitizeWhatsAppParam(customerName.substring(0, 60)),
      sanitizeWhatsAppParam(customerPhone.substring(0, 30)),
      sanitizedProducts,
      sanitizeWhatsAppParam(total.substring(0, 30)),
      sanitizeWhatsAppParam(paymentMethod.substring(0, 40)),
    ],
    [
      buildQuickReplyPayloadButton("0", `ORDEN_LISTA_PICKUP|${orderId}`),
      buildQuickReplyPayloadButton("1", `CANCELAR_PICKUP|${orderId}`),
    ],
    500
  );
}

export async function sendPickupReadyForCustomer(
  phone: string,
  orderNumber: string,
  storeName: string,
  _storeMapsUrl: string
) {
  return sendSpanishTemplate(
    phone,
    CLIENTE_PICKUP_READY_TEMPLATE_NAME,
    [sanitizeWhatsAppParam(orderNumber.substring(0, 30)), sanitizeWhatsAppParam(storeName.substring(0, 60))]
  );
}
export async function sendNuevoPedidoRestaurante(
  phone: string,
  restaurantName: string,
  orderNumber: string,
  customerName: string,
  products: string,
  total: string,
  deliveryType: string
) {
  const safeRestaurantName = restaurantName.substring(0, 60);
  const safeOrderNumber = orderNumber.substring(0, 30);
  const safeCustomerName = customerName.substring(0, 60);
  const safeTotal = total.substring(0, 30);
  const safeDeliveryType = deliveryType.substring(0, 30);

  const reservedLength =
    NUEVO_PEDIDO_RESTAURANTE_FIXED_BODY.length +
    NUEVO_PEDIDO_RESTAURANTE_SAFETY_MARGIN +
    safeRestaurantName.length +
    safeOrderNumber.length +
    safeCustomerName.length +
    safeTotal.length +
    safeDeliveryType.length;

  const productsBudget = NUEVO_PEDIDO_RESTAURANTE_BODY_LIMIT - reservedLength;
  const safeProducts = fitTextToBudget(products, productsBudget, "Productos varios");

  if (String(products || "").trim().length > safeProducts.length) {
    console.warn("[whatsapp] nuevo_pedido_restaurante truncado por limite de body", {
      originalProductsLength: String(products || "").trim().length,
      finalProductsLength: safeProducts.length,
      productsBudget,
      reservedLength,
    });
  }

  // Sanitize products to remove newlines, tabs, and excessive spaces
  const sanitizedProducts = sanitizeWhatsAppParam(safeProducts);

  return sendSpanishTemplate(
    phone,
    "nuevo_pedido_restaurante",
    [
      sanitizeWhatsAppParam(safeRestaurantName),
      sanitizeWhatsAppParam(safeOrderNumber),
      sanitizeWhatsAppParam(safeCustomerName),
      sanitizedProducts,
      sanitizeWhatsAppParam(safeTotal),
      sanitizeWhatsAppParam(safeDeliveryType),
    ],
    [],
    1024
  );
}

export async function sendRepartidorEnCaminoRestaurante(
  phone: string,
  driverName: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "repartidor_en_camino_restaurante", [
    sanitizeWhatsAppParam(driverName.substring(0, 60)),
    sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
  ]);
}

export async function sendOrderOnTheWay(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "pedido_en_camino", [
    sanitizeWhatsAppParam(name.substring(0, 30)),
    sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
  ]);
}

export async function sendOrderDelivered(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "pedido_entregado", [
    sanitizeWhatsAppParam(name.substring(0, 30)),
    sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
  ]);
}

export async function sendOrderCancelled(
  phone: string,
  name: string,
  orderNumber: string
) {
  return sendSpanishTemplate(phone, "pedido_cancelado", [
    sanitizeWhatsAppParam(name.substring(0, 30)),
    sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
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
  mapsUrl: string,
  restaurantLabel?: string,
  driverLabel?: string
) {
  const breakdown = restaurantLabel && driverLabel
    ? `Cobrar al cliente - Restaurante: ${restaurantLabel} - Tu envío: ${driverLabel} - Total: ${total}`
    : total;

  // Sanitize breakdown to remove newlines, tabs, and excessive spaces
  const sanitizedBreakdown = sanitizeWhatsAppParam(breakdown);

  return sendWhatsAppTemplate(
    phone,
    "oferta_reparto",
    [
      sanitizeWhatsAppParam(orderNumber),
      sanitizeWhatsAppParam(customerName),
      sanitizeWhatsAppParam(restaurantName),
      sanitizeWhatsAppParam(address),
      sanitizedBreakdown,
      sanitizeWhatsAppParam(paymentMethod),
    ],
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
    `Tienes una oferta multiple del mismo restaurante.\n\nRestaurante: ${restaurantName.substring(0, 60)}\nFolios: ${ordersLabel}\nPago total estimado: ${total}\nEntregas: ${deliveries}\n\nResponde ACEPTO para tomar ambos pedidos o RECHAZAR para liberarlos.`
  );
}

export async function sendDriverConfirmation(
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
      sanitizeWhatsAppParam(orderNumber.substring(0, 30)),
      sanitizeWhatsAppParam(restaurantName.substring(0, 30)),
      sanitizeWhatsAppParam(deliveryAddress.substring(0, 60)),
      sanitizeWhatsAppParam(paymentMethod.substring(0, 30)),
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
    [sanitizeWhatsAppParam(orderNumber.substring(0, 30))],
    [buildQuickReplyPayloadButton("0", `EN_PUERTA|${orderId}`)]
  );
}

export async function sendRepartidorEnPuerta(phone: string, orderNumber: string, orderId: string) {
  return sendSpanishTemplate(
    phone,
    "repartidor_en_puerta",
    [sanitizeWhatsAppParam(orderNumber.substring(0, 30))],
    [buildQuickReplyPayloadButton("0", `ENTREGADO|${orderId}`)]
  );
}

export async function sendClienteRepartidorEnPuerta(
  phone: string,
  customerName: string,
  orderNumber: string,
  deliveryPin?: string
) {
  const orderReference = deliveryPin
    ? `${orderNumber}. NIP: ${deliveryPin}`
    : orderNumber;

  return sendSpanishTemplate(phone, "cliente_repartidor_en_puerta", [
    sanitizeWhatsAppParam(customerName.substring(0, 30)),
    sanitizeWhatsAppParam(orderReference),
  ]);
}

// Mensajes de texto libre del bot hacia repartidores (respuestas a comandos y recordatorios)
// Se puede usar porque el repartidor habrÃ¡ iniciado conversaciÃ³n con INICIO
export async function sendBotMessage(phone: string, message: string) {
  return sendWhatsAppMessage(phone, message);
}


