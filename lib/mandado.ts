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
  // Entrega segura con NIP: el código se envía al canal configurado
  // (`nipRecipient`: destinatario o remitente) según lib/mandado-nip-channel.ts.
  pinEnabled?: boolean;
  // Notificación al destinatario (plantilla `mandado__destinatario`, sin NIP).
  recipientName?: string;
  recipientPhone?: string;
  // Declaración del remitente sobre si el destinatario usa WhatsApp (AJUSTE 2:
  // es una declaración del usuario, NO una verdad verificada por Meta).
  recipientWhatsAppDeclared?: boolean;
  // Confirmación explícita del remitente de ser el canal fallback del NIP cuando
  // el destinatario no tiene WhatsApp (AJUSTE 1). Se persiste en la orden.
  senderNipFallbackAccepted?: boolean;
  // Quién recibe el código de entrega (sender | recipient) (PASO 3).
  nipRecipient?: "sender" | "recipient";
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
