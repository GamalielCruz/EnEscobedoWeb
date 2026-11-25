/**
 * WhatsApp conversation window utilities for Mandado driver offers.
 *
 * WhatsApp Business API allows free-form text messages ONLY within 24 hours
 * of the last message received from the contact. After that, only templates
 * can be sent.
 *
 * We use a 23h 30m safety margin to avoid edge-case failures near the
 * 24h boundary (clock skew, network latency, Meta processing delays).
 */

/** Safety margin below 24h to avoid boundary failures. */
const CONVERSATION_WINDOW_MS = 23 * 60 * 60 * 1000 + 30 * 60 * 1000; // 23h 30m

/**
 * Determines whether a free-form WhatsApp message can likely be sent
 * to a driver based on their last interaction timestamp.
 *
 * This is a pure function — no side effects, no Date.now() calls,
 * making it fully testable.
 *
 * @param lastActivityAt - ISO timestamp of the driver's last WhatsApp message
 * @param now - current time as a Date object (for testability)
 * @returns true if the conversation window is likely still open
 */
export function isWhatsAppConversationOpen(
  lastActivityAt: string | null | undefined,
  now: Date
): boolean {
  if (!lastActivityAt) return false;
  const lastActivity = new Date(lastActivityAt);
  if (Number.isNaN(lastActivity.getTime())) return false;
  const elapsed = now.getTime() - lastActivity.getTime();
  return elapsed >= 0 && elapsed < CONVERSATION_WINDOW_MS;
}

/**
 * Build the free-form text message for a Mandado driver offer.
 *
 * This is presentation only — it does NOT send the message or
 * interact with Dispatch logic. The acceptance flow continues
 * using the existing Dispatch mechanism (webhook commands).
 */
export function buildMandadoDeliveryOfferMessage(input: {
  orderNumber: string;
  customerName: string;
  pickupAddress: string;
  deliveryAddress: string;
  driverPayoutLabel: string;
  customerTotalLabel: string;
  paymentMethod: string;
}): string {
  const lines = [
    `Nuevo mandado #${input.orderNumber}`,
    `para ${input.customerName}.`,
    ``,
    `📍 Recolección:`,
    input.pickupAddress,
    ``,
    `📍 Entrega:`,
    input.deliveryAddress,
    ``,
    `💰 Tu envío: ${input.driverPayoutLabel}`,
    `💳 ${input.paymentMethod}`,
    ``,
    `Total pagado: ${input.customerTotalLabel}`,
  ];
  return lines.join("\n");
}
