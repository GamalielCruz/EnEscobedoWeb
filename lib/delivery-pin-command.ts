export type DeliveryPinCommand = {
  pin: string;
  orderToken: string | null;
};

export function parseDeliveryPinCommand(text: string): DeliveryPinCommand | null {
  const normalized = String(text || "").trim().toUpperCase();
  if (/^\d{6}$/.test(normalized)) {
    return { pin: normalized, orderToken: null };
  }

  const match = normalized.match(/^NIP\s+#?(\S+)\s+(\d{6})$/);
  return match ? { orderToken: match[1], pin: match[2] } : null;
}
