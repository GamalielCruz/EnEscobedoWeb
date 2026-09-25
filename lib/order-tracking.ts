// ────────────────────────────────────────────────────────────────────
// Experiencia del cliente tras confirmar el pedido (estilo Uber).
//
// Este módulo es PURO (sin I/O) para poder probarse con
// `node --experimental-strip-types --test`. La persistencia y las rutas API
// consumen estas decisiones: la UI solo lee fases derivadas del documento de
// la orden, nunca estados técnicos de despacho.
//
// Principios:
//   - El cliente nunca ve cronómetros con números ni estados técnicos
//     (dispatchStatus, offeredTo, PENDING_DELIVERY, etc.).
//   - "Buscando repartidor" es un estado semántico y accesible (texto vivo,
//     no solo la barra animada).
//   - Los detalles completos viven en una card plegable, sin competir con el
//     estado principal.
//   - Cancelar solo cuando el negocio lo permite: sin repartidor asignado y
//     pago no cobrado (o pagado → requiere reembolso, nunca se cobra doble).
// ────────────────────────────────────────────────────────────────────

export type CustomerTrackingPhase =
  | "searching" // Pedido confirmado, esperando repartidor
  | "accepted" // Repartidor asignado
  | "pickup_arrival" // En el comercio / recolectando
  | "en_route" // En camino al cliente
  | "delivered" // Entregado
  | "cancelled"; // Cancelado (por el cliente, tienda o soporte)

/**
 * Fase derivada del documento de la orden. Solo campos proyectados de solo
 * lectura (nunca datos operativos internos del despacho).
 */
export type OrderTrackingInput = {
  serviceKind?: string;
  orderType?: string;
  status?: string;
  orderStatus?: string;
  dispatchStatus?: string;
  hasAssignedDriver?: boolean;
  mandadoPickupAtDoor?: boolean;
  mandadoEnRuta?: boolean;
};

const TERMINAL_CANCELLATIONS = new Set(["cancelled", "failed", "expired"]);
const TERMINAL_SUCCESS = new Set(["delivered", "completed", "picked_up"]);

/**
 * Fase amigable para el cliente. Derivada SIEMPRE de la orden, nunca del
 * repartidor. Las órdenes de pickup/click&collect nunca entran a la búsqueda
 * de repartidor (dispatchStatus "not_required"): su fase es "accepted" desde
 * la confirmación.
 */
export function deriveCustomerPhase(order: OrderTrackingInput): CustomerTrackingPhase {
  const orderStatus = String(order.orderStatus ?? order.status ?? "").toLowerCase();
  const dispatchStatus = String(order.dispatchStatus ?? "").toLowerCase();
  const isDelivery = (order.orderType ?? "delivery") === "delivery" && order.serviceKind !== "mandado"
    ? true
    : (order.orderType ?? "delivery") === "delivery";
  const isMandado = order.serviceKind === "mandado";

  if (TERMINAL_CANCELLATIONS.has(orderStatus)) return "cancelled";
  if (TERMINAL_SUCCESS.has(orderStatus)) return "delivered";

  if (orderStatus === "shipped") {
    // Mandado: mandadoEnRuta solo es válido tras recolección explícita.
    if (isMandado && order.mandadoEnRuta === true && order.mandadoPickupAtDoor === true) {
      return "en_route";
    }
    return "accepted";
  }

  if (dispatchStatus === "accepted" || order.hasAssignedDriver) {
    if (isMandado && order.mandadoEnRuta === true && order.mandadoPickupAtDoor === true) {
      return "en_route";
    }
    if (isMandado && order.mandadoPickupAtDoor === true) return "pickup_arrival";
    return "accepted";
  }

  if (isDelivery && (dispatchStatus === "waiting_for_driver" || dispatchStatus === "offered")) {
    return "searching";
  }

  // Pickup / click&collect: no requiere repartidor.
  if (!isDelivery) return "accepted";

  // Pago pendiente u otros estados tempranos de una orden a domicilio.
  return "searching";
}

export function customerPhaseLabel(phase: CustomerTrackingPhase): string {
  switch (phase) {
    case "searching":
      return "Buscando repartidor";
    case "accepted":
      return "Tu repartidor ha aceptado el pedido";
    case "pickup_arrival":
      return "El repartidor está en el comercio";
    case "en_route":
      return "Tu pedido va en camino";
    case "delivered":
      return "Pedido entregado";
    case "cancelled":
      return "Pedido cancelado";
  }
}

/** Texto secundario humano, sin tiempos ni estados técnicos. */
export function customerPhaseHint(phase: CustomerTrackingPhase): string | null {
  switch (phase) {
    case "searching":
      return "En cuanto alguien acepte tu pedido te avisamos.";
    case "accepted":
      return "Irá por tu pedido y lo verás aquí en el mapa.";
    case "pickup_arrival":
      return "Está recolectando tu pedido ahora mismo.";
    case "en_route":
      return "Prepárate para recibirlo.";
    case "delivered":
      return "¡Buen provecho! Cuéntanos cómo fue tu experiencia.";
    case "cancelled":
      return null;
  }
}

/**
 * ¿Puede el cliente cancelar?
 * - Solo antes de la recolección: nunca cuando el repartidor ya está en el
 *   comercio o en ruta.
 * - Cancelación explícita o terminal (cancelled/failed/expired) → ya no.
 * - Reglas de pago (backend intacto): Stripe cobrado pasa a requires_refund /
 *   refunded automáticamente en la API; aquí solo evaluamos si la cancelación
 *   es operativamente posible.
 */
export function canCustomerCancel(input: {
  phase: CustomerTrackingPhase;
  paymentStatus?: string;
  orderStatus?: string;
}): boolean {
  if (input.phase === "cancelled" || input.phase === "delivered") return false;
  if (input.phase === "pickup_arrival" || input.phase === "en_route") return false;
  const orderStatus = String(input.orderStatus ?? "").toLowerCase();
  if (TERMINAL_CANCELLATIONS.has(orderStatus) || TERMINAL_SUCCESS.has(orderStatus)) return false;
  return true;
}

/**
 * Aviso de espera prolongada (sin relojes): la UI lo muestra cuando la búsqueda
 * lleva varios ciclos de sondeo sin asignación. Mensaje humano, con acciones
 * claras (seguir esperando o cancelar). "NoDrivers" es una variante que la UI
 * usa cuando el backend confirma que no hay repartidores conectados.
 */
export function prolongedSearchCopy(input: { phase: CustomerTrackingPhase; noDrivers?: boolean }): {
  message: string;
  hint: string;
} | null {
  if (input.phase !== "searching") return null;
  if (input.noDrivers) {
    return {
      message: "Por ahora no hay repartidores disponibles",
      hint: "Tu pedido sigue activo. Puedes esperar a que alguien se conecte o cancelarlo sin costo.",
    };
  }
  return {
    message: "La búsqueda está tardando más de lo normal",
    hint: "Seguimos buscando por ti. También puedes cancelar tu pedido si prefieres.",
  };
}

/** Etiqueta de fase de voz/ARIA: texto semántico, no la animación. */
export function trackingAnnouncement(phase: CustomerTrackingPhase): string {
  return customerPhaseLabel(phase);
}
