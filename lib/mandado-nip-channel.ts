/**
 * Decisión del canal del NIP en la creación del mandado (PASO 3 + ajustes 1-2
 * + endurecimiento B: responsable ≠ canal).
 *
 * Reglas de producto aprobadas:
 *  1. Destinatario identificado + WhatsApp DECLARADO por el usuario → NIP al DESTINATARIO.
 *  2. Destinatario identificado sin WhatsApp → NIP al REMITENTE solo si:
 *       a. el remitente tiene un WhatsApp válido, y
 *       b. el remitente ACEPTA EXPLÍCITAMENTE el fallback
 *          (`senderFallbackAccepted`), que queda persistido en la orden.
 *  3. Sin destinatario identificado → NIP al REMITENTE solo con flujo explícito
 *     (`explicitNipRecipient === "sender"`) y WhatsApp válido del remitente.
 *  4. Ningún canal WhatsApp válido → NIP NO permitido (se explica por qué; el
 *     envío puede continuar sin NIP).
 *
 * MODELO (endurecimiento B): se separan dos conceptos que antes coincidían:
 *  - RESPONSABLE del NIP (`mandadoNipRecipient: sender | recipient`): quién debe
 *    asegurarse de que el destinatario tenga el código.
 *  - CANAL EFECTIVO (`nipDeliveryChannel: whatsapp_sender | whatsapp_recipient | none`)
 *    y teléfono destino (`nipDeliveryPhone`): a qué canal/número se intenta
 *    entregar el código. Hoy responsable y canal siempre coinciden; el modelo ya
 *    los representa por separado para escenarios futuros (contacto autorizado,
 *    teléfono inválido, WhatsApp no disponible, etc.) sin tocar restaurantes.
 *
 * NOMENCLATURA (AJUSTE 2): `recipientWhatsAppDeclared` es una DECLARACIÓN del
 * usuario, NO una verdad verificada. La verificación real llega después por el
 * ciclo de vida del mensaje de Meta (sent/delivered/read/failed) vía
 * `nipDeliveryStatus`; no se usa ningún proveedor externo para pre-verificar.
 *
 * Módulo puro (sin imports) para testear con node.
 */
export type MandadoNipChannel = "sender" | "recipient";

/** Canal EFECTIVO al que se intenta entregar el NIP (endurecimiento B). */
export type MandadoDeliveryChannel =
  | "whatsapp_sender"
  | "whatsapp_recipient"
  | "none";

/** Formato de teléfono compatible con WhatsApp (10 dígitos MX o 11-15 con lada). */
export function isValidWhatsAppPhone(phone?: string | null): boolean {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return false;
  if (digits.length === 10) return true;
  return digits.length >= 11 && digits.length <= 15;
}

/** Normaliza un teléfono a dígitos (para persistir el destino del NIP). */
export function normalizePhoneDigits(phone?: string | null): string {
  return String(phone || "").replace(/\D/g, "");
}

/**
 * Deriva el CANAL EFECTIVO y el TELÉFONO destino a partir del responsable del
 * NIP (endurecimiento B). `none` = no existe un canal entregable (p. ej. falta
 * el teléfono): el NIP no puede entregarse por ningún canal disponible.
 */
export function resolveNipDeliveryTarget(
  channel: MandadoNipChannel | null,
  input: { senderPhone?: string | null; recipientPhone?: string | null }
): { deliveryChannel: MandadoDeliveryChannel; deliveryPhone?: string } {
  if (channel === "recipient") {
    const phone = normalizePhoneDigits(input.recipientPhone);
    return phone
      ? { deliveryChannel: "whatsapp_recipient", deliveryPhone: phone.slice(-12) }
      : { deliveryChannel: "none" };
  }
  if (channel === "sender") {
    const phone = normalizePhoneDigits(input.senderPhone);
    return phone
      ? { deliveryChannel: "whatsapp_sender", deliveryPhone: phone.slice(-12) }
      : { deliveryChannel: "none" };
  }
  return { deliveryChannel: "none" };
}

export function resolveMandadoNipChannel(input: {
  pinEnabled: boolean;
  senderPhone?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientWhatsAppDeclared?: boolean;
  senderFallbackAccepted?: boolean;
  explicitNipRecipient?: "sender" | "recipient" | string | null;
}): { ok: true; channel: MandadoNipChannel | null } | { ok: false; error: string } {
  if (!input.pinEnabled) return { ok: true, channel: null };

  const senderValid = isValidWhatsAppPhone(input.senderPhone);
  const recipientIdentified =
    Boolean(String(input.recipientName || "").trim()) &&
    isValidWhatsAppPhone(input.recipientPhone);
  const recipientWhatsAppDeclared = input.recipientWhatsAppDeclared === true;

  // Regla 1: destinatario identificado con WhatsApp declarado → el código va al destinatario.
  if (recipientIdentified && recipientWhatsAppDeclared) {
    return { ok: true, channel: "recipient" };
  }

  // Regla 2: destinatario identificado sin WhatsApp → fallback al remitente,
  // SOLO con confirmación explícita del remitente (AJUSTE 1).
  if (recipientIdentified && !recipientWhatsAppDeclared) {
    if (input.senderFallbackAccepted !== true) {
      return {
        ok: false,
        error:
          "El destinatario no tiene WhatsApp. Confirma que recibirás el código de entrega y se lo proporcionarás al destinatario antes de la entrega.",
      };
    }
    if (!senderValid) {
      return {
        ok: false,
        error:
          "El destinatario no tiene WhatsApp. Para enviar el código a tu WhatsApp necesitamos un número válido tuyo.",
      };
    }
    return { ok: true, channel: "sender" };
  }

  // Regla 3: sin destinatario identificado → flujo explícito del remitente.
  if (String(input.explicitNipRecipient || "") === "sender") {
    if (!senderValid) {
      return {
        ok: false,
        error:
          "Para usar la entrega con NIP necesitamos un WhatsApp donde podamos enviar el código.",
      };
    }
    return { ok: true, channel: "sender" };
  }

  // Regla 4: sin canal válido → NIP no permitido (con explicación).
  return {
    ok: false,
    error:
      "Para usar la entrega con NIP necesitamos un WhatsApp donde podamos enviar el código: el del destinatario o el tuyo. Completa los datos del destinatario o elige recibir el código tú.",
  };
}
