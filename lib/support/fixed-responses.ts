import type {
  SupportCategory,
  SupportClassification,
} from "./support-categories";

export const FIXED_RESPONSES: Partial<Record<SupportCategory, string>> = {
  greeting:
    "Hola 👋 Soy el asistente de soporte de El Menú. Puedo ayudarte con horarios, cobertura, métodos de pago, promociones, entregas y retiro en restaurante.",
  business_hours:
    "Los horarios pueden variar según cada restaurante. Puedes consultar el horario y el estado actual directamente en la página del restaurante dentro de El Menú.",
  coverage:
    "La cobertura depende del restaurante y de la dirección de entrega. Agrega tus productos al carrito y escribe tu ubicación en el checkout para confirmar si el pedido está dentro de la zona disponible.",
  payment_methods:
    "Los métodos disponibles dependen del tipo de pedido y del restaurante. En el checkout podrás ver las opciones habilitadas, como tarjeta, efectivo o pago al recoger.",
  promotions:
    "Las promociones activas aparecen directamente en El Menú y en la página de cada restaurante. Si una promoción no aparece durante el checkout, puede haber terminado o no aplicar a ese pedido.",
  delivery_cost:
    "El costo de envío se calcula según el restaurante, la dirección y la zona de entrega. El total exacto se muestra antes de confirmar el pedido.",
  pickup:
    "Puedes seleccionar “Recogida” durante el checkout cuando el restaurante tenga esa modalidad disponible. Al confirmar el pedido recibirás la información necesaria para recogerlo.",
  how_to_order:
    "Elige un restaurante, agrega productos al carrito, abre el checkout, selecciona entrega o recogida, proporciona los datos solicitados y confirma tu método de pago.",
  human_support:
    "Claro. Voy a dirigirte con el equipo de Atención al Cliente. Ahora transfiero tu conversación para que una persona pueda ayudarte.",
  operational_query:
    "No pude resolver la consulta con la información disponible. Voy a dirigirte con el equipo de Operaciones. Ahora transfiero tu conversación para que una persona revise el pedido contigo.",
  sensitive_case:
    "Lamento lo ocurrido. Voy a dirigirte con el equipo de Pagos y Reembolsos. Ahora transfiero tu conversación para que una persona revise el caso con prioridad.",
};

const HEALTH_AND_SAFETY_RESPONSE =
  "Lamento lo ocurrido. Voy a dirigirte con el equipo de Atención Prioritaria. Evita consumir el producto y conserva el pedido, empaque y comprobante. Ahora transfiero tu conversación para que una persona revise el caso.";

export function getFixedResponse(classification: SupportClassification) {
  if (
    classification.category === "sensitive_case" &&
    classification.matchedRule === "health_or_safety"
  ) {
    return HEALTH_AND_SAFETY_RESPONSE;
  }

  return FIXED_RESPONSES[classification.category];
}
