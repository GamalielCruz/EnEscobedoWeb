// Regla central y PURA de qué plantillas se envían al remitente cuando el
// repartidor llega al destino de un mandado (evento EN PUERTA del webhook).
//
// Vive aquí (sin dependencias de runtime) para que el webhook y sus tests
// compartan EXACTAMENTE la misma decisión y no se duplique la condición.
//
// Reglas:
//  - `mandado_destino_en_puerta` (APROBADA en Meta): aviso de llegada al
//    remitente. Siempre para mandados (no depende de Entrega segura ni del
//    teléfono del destinatario). Variables: {{1}} dirección, {{2}} acción.
//  - `orden_repartidor` (NIP + botón Ayuda): SOLO si la orden REALMENTE
//    requiere NIP (mandados: Entrega segura activa). Un mandado sin Entrega
//    segura NUNCA recibe instrucciones ni códigos de NIP, aunque exista un
//    NIP almacenado en la orden.
// Extensión `.ts` requerida por los tests de node (--experimental-strip-types)
// en imports relativos; el resto del proyecto importa sin extensión.
import { orderRequiresDeliveryPin } from "./delivery-pin.ts";

export type MandadoArrivalPlan = {
  /** `mandado_destino_en_puerta` (aprobada): repartidor llegó al destino. */
  sendDestinoEnPuerta: boolean;
  /** `orden_repartidor` (NIP + botón Ayuda): solo si la orden requiere NIP. */
  sendOrdenPorCompletar: boolean;
};

export function planMandadoArrival(order: {
  serviceKind?: string;
  mandadoEntregaSegura?: boolean;
  deliveryVerificationMethod?: string;
  deliveryVerificationStatus?: string;
}): MandadoArrivalPlan {
  const isMandado = String(order.serviceKind ?? "") === "mandado";
  return {
    sendDestinoEnPuerta: isMandado,
    sendOrdenPorCompletar: isMandado && orderRequiresDeliveryPin(order),
  };
}
