// ────────────────────────────────────────────────────────────────────
// MOTIVOS DE CANCELACIÓN DE PEDIDO
//
// Fuente ÚNICA de verdad del catálogo de motivos: la usa la hoja de
// cancelación del repartidor (Drive), la validación del endpoint
// /api/driver/action y la etiqueta legible que se persiste en Sanity
// (order.cancellation.reasonLabel). Módulo PURO (sin imports ni I/O).
// ────────────────────────────────────────────────────────────────────

export type OrderCancellationReason = {
  /** Código estable persistido en Sanity (nunca cambiar uno existente). */
  code: string;
  /** Etiqueta legible que ve el repartidor y que se guarda como snapshot. */
  label: string;
};

/** Motivos que puede elegir el REPARTIDOR al cancelar un pedido asignado. */
export const DRIVER_CANCELLATION_REASONS: readonly OrderCancellationReason[] = [
  { code: "store_closed", label: "La tienda está cerrada" },
  { code: "store_no_response", label: "La tienda no responde" },
  { code: "order_not_ready", label: "El pedido no está listo" },
  { code: "customer_no_answer", label: "El cliente no contesta" },
  { code: "customer_refused", label: "El cliente rechazó el pedido" },
  { code: "wrong_address", label: "Dirección incorrecta o no localizada" },
  { code: "vehicle_problem", label: "Problema con mi vehículo" },
  { code: "safety_issue", label: "Situación de riesgo o inseguridad" },
  { code: "other", label: "Otro motivo" },
];

/** Códigos válidos (para `options.list` del schema y validaciones). */
export const DRIVER_CANCELLATION_REASON_CODES: readonly string[] =
  DRIVER_CANCELLATION_REASONS.map((reason) => reason.code);

export function isOrderCancellationReason(code: unknown): boolean {
  return (
    typeof code === "string" &&
    DRIVER_CANCELLATION_REASON_CODES.includes(code)
  );
}

/** Etiqueta legible de un código; null si el código no es del catálogo. */
export function orderCancellationReasonLabel(code: unknown): string | null {
  if (typeof code !== "string") return null;
  return (
    DRIVER_CANCELLATION_REASONS.find((reason) => reason.code === code)?.label ??
    null
  );
}

/** Longitud máxima de la explicación libre ("Detalles"). */
export const CANCELLATION_NOTE_MAX_LENGTH = 300;
