export type MandadoPointQuote = {
  allowed: boolean;
  finalPrice: number | null;
  zone: { id: string; name: string; basePrice: number } | null;
};

export type MandadoMode = "pickup" | "purchase";
export type MandadoAddressPoint = { label: string; lat: number; lng: number };

export type MandadoDraft = {
  mode: MandadoMode;
  origin: MandadoAddressPoint;
  destination: MandadoAddressPoint;
  details: string;
  price: number;
  // Detalles opcionales de los puntos
  businessName?: string;
  originReference?: string;
  destinationReference?: string;
  destinationPerson?: string;
  // Entrega segura con NIP: el NIP se envía únicamente al WhatsApp del cliente
  // (remitente), quien decide si lo comparte con el destinatario.
  pinEnabled?: boolean;
  // Notificación al destinatario (plantilla `mandado__destinatario`, sin NIP).
  recipientName?: string;
  recipientPhone?: string;
};

export const MANDADO_SERVICE_FEE = 14;

export function calculateMandadoQuote(origin: MandadoPointQuote, destination: MandadoPointQuote) {
  if (!origin.allowed || !origin.zone) {
    return { allowed: false as const, finalPrice: null, outsidePoint: "origin" as const };
  }
  if (!destination.allowed || !destination.zone) {
    return { allowed: false as const, finalPrice: null, outsidePoint: "destination" as const };
  }
  if (origin.finalPrice == null || destination.finalPrice == null) {
    return { allowed: false as const, finalPrice: null, outsidePoint: null };
  }

  return {
    allowed: true as const,
    finalPrice: Math.max(origin.finalPrice, destination.finalPrice) + MANDADO_SERVICE_FEE,
    outsidePoint: null,
  };
}
