// Regla central y PURA de qué plantillas se envían cuando el repartidor llega al
// destino de un mandado (evento EN PUERTA del webhook).
//
// Vive aquí (sin dependencias de runtime) para que el webhook y sus tests
// compartan EXACTAMENTE la misma decisión y no se duplique la condición.
//
// Reglas para la segunda llegada (destinatario):
//  - `mandado__destinatario`: aviso de llegada al destinatario. Su variable
//    incluye el NIP solo cuando el canal configurado es el destinatario.
//  - NIP: SOLO si la orden REALMENTE lo requiere (mandados: Entrega segura
//    activa). Un mandado sin Entrega segura NUNCA recibe instrucciones ni
//    códigos de NIP, aunque exista un NIP almacenado en la orden.
//  - `nipChannel` (PASO 4 + endurecimiento B): decide a QUIÉN llega el NIP en
//    EN PUERTA según el canal EFECTIVO configurado en la creación
//    (`nipDeliveryChannel`; legado sin el campo → `mandadoNipRecipient`):
//      - "recipient" → `mandado_nip_destinatario` (PENDIENTE en Meta).
//      - "sender"    → `orden_repartidor` (canal actual del remitente).
//    Órdenes legadas sin ningún campo → "sender" (comportamiento actual).
// Extensión `.ts` requerida por los tests de node (--experimental-strip-types)
// en imports relativos; el resto del proyecto importa sin extensión.
import { orderRequiresDeliveryPin } from "./delivery-pin.ts";

export type MandadoArrivalPlan = {
  /** `mandado_destino_en_puerta` (aprobada): repartidor llegó al destino. */
  sendDestinoEnPuerta: boolean;
  /** El NIP debe enviarse en este evento (la orden requiere NIP). */
  sendOrdenPorCompletar: boolean;
  /** Canal del NIP: destinatario o remitente (null si no requiere NIP). */
  nipChannel: "sender" | "recipient" | null;
};

export function planMandadoArrival(order: {
  serviceKind?: string;
  mandadoEntregaSegura?: boolean;
  deliveryVerificationMethod?: string;
  deliveryVerificationStatus?: string;
  mandadoNipRecipient?: string;
  nipDeliveryChannel?: string;
}): MandadoArrivalPlan {
  const isMandado = String(order.serviceKind ?? "") === "mandado";
  const requiresPin = isMandado && orderRequiresDeliveryPin(order);
  let nipChannel: "sender" | "recipient" | null = null;
  if (requiresPin) {
    // Canal EFECTIVO persistido (endurecimiento B); legado sin el campo → el
    // responsable (`mandadoNipRecipient`) decide, y sin ambos → sender (actual).
    const deliveryChannel = String(order.nipDeliveryChannel ?? "");
    if (deliveryChannel === "whatsapp_recipient") nipChannel = "recipient";
    else if (deliveryChannel === "whatsapp_sender") nipChannel = "sender";
    else nipChannel = String(order.mandadoNipRecipient ?? "") === "recipient" ? "recipient" : "sender";
  }
  return {
    sendDestinoEnPuerta: isMandado,
    sendOrdenPorCompletar: requiresPin,
    nipChannel,
  };
}
