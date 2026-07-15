import type {
  SupportCategory,
  SupportClassification,
} from "./support-categories";

type SupportRule = {
  category: Exclude<SupportCategory, "unknown">;
  confidence: "high" | "medium";
  id: string;
  patterns: RegExp[];
};

export function normalizeSupportMessage(message: string) {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RULES: SupportRule[] = [
  {
    id: "health_or_safety",
    category: "sensitive_case",
    confidence: "high",
    patterns: [
      /\b(alergia|alergico|intoxicacion|accidente|amenaza)\b/,
      /\bproducto\b.*\bmal estado\b/,
      /\brepartidor\b.*\bagresiv[oa]\b/,
    ],
  },
  {
    id: "refund_or_conflict",
    category: "sensitive_case",
    confidence: "high",
    patterns: [
      /\b(reembolso|devolucion|fraude|queja|conflicto)\b/,
      /\bcancelar\b.*\bpedido\b/,
      /\b(cobro duplicado|no reconozco (el )?cargo|pedido nunca llego)\b/,
    ],
  },
  {
    id: "order_status",
    category: "operational_query",
    confidence: "high",
    patterns: [
      /\b(donde esta|estado de|ya salio|cuanto falta)\b.*\bpedido\b/,
      /\b(quien es|donde esta)\b.*\brepartidor\b/,
      /\brestaurante\b.*\b(confirmo|confirmado)\b/,
      /\bpedido\b.*\b(pendiente|numero|estatus)\b/,
      /\bnumero de pedido\b/,
    ],
  },
  {
    id: "request_human",
    category: "human_support",
    confidence: "high",
    patterns: [
      /\b(humano|asesor|agente)\b/,
      /\bhablar con (una persona|alguien)\b/,
      /\b(atencion personal|necesito soporte)\b/,
    ],
  },
  {
    id: "business_hours",
    category: "business_hours",
    confidence: "high",
    patterns: [
      /\b(horario|horarios|orario|orarios)\b/,
      /\ba que hora\b.*\b(abren|cierran)\b/,
      /\b(hasta que hora|abren hoy|estan abiertos)\b/,
    ],
  },
  {
    id: "delivery_cost",
    category: "delivery_cost",
    confidence: "high",
    patterns: [
      /\b(costo|precio|cuanto cuesta|cuanto cobran)\b.*\b(envio|entrega|llevar)\b/,
      /\b(envio gratis|costo de entrega)\b/,
    ],
  },
  {
    id: "coverage",
    category: "coverage",
    confidence: "high",
    patterns: [
      /\b(cobertura|zona de entrega|mi colonia|mi comunidad)\b/,
      /\b(entregan|reparten|llegan)\b.*\b(en|a|hasta)\b/,
      /\bhacen envio a\b/,
    ],
  },
  {
    id: "payment_methods",
    category: "payment_methods",
    confidence: "high",
    patterns: [
      /\b(metodo de pago|metodos de pago|formas de pago|efectivo|stripe)\b/,
      /\b(pagar|pago|aceptan|puedo pagar)\b.*\btarjeta\b/,
      /\btarjeta( de (credito|debito))?\b$/,
      /\b(pagar en tienda|pago al recoger)\b/,
    ],
  },
  {
    id: "promotions",
    category: "promotions",
    confidence: "high",
    patterns: [
      /\b(promocion|promociones|promo|promos|descuento|descuentos)\b/,
      /\b(cupon|cupones|oferta|ofertas)\b/,
    ],
  },
  {
    id: "pickup",
    category: "pickup",
    confidence: "high",
    patterns: [
      /\b(recoger|recogida|retiro|pickup)\b/,
      /\b(pasar por|click and collect)\b.*\b(pedido|tienda|local)?\b/,
    ],
  },
  {
    id: "how_to_order",
    category: "how_to_order",
    confidence: "high",
    patterns: [
      /\b(como compro|como hago un pedido|como ordenar|quiero pedir)\b/,
      /\b(hacer pedido|comprar comida)\b/,
    ],
  },
  {
    id: "greeting",
    category: "greeting",
    confidence: "high",
    patterns: [
      /^(hola|buenas|buen dia|buenos dias|buenas tardes|buenas noches|que tal)$/,
    ],
  },
];

export function classifySupportMessage(message: string): SupportClassification {
  const normalized = normalizeSupportMessage(message);
  if (!normalized) return { category: "unknown", confidence: "low" };

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(normalized))) {
      return {
        category: rule.category,
        confidence: rule.confidence,
        matchedRule: rule.id,
      };
    }
  }

  return { category: "unknown", confidence: "low" };
}
