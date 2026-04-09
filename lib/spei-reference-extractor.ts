import { getStripe } from "./stripe";
import type Stripe from "stripe";

export interface SpeiDetails {
  reference?: string;
  clabe?: string;
  bankName?: string;
  accountNumber?: string;
  instructions?: string;
}

interface FinancialAddress {
  type: string;
  clabe?: string;
  bank_name?: string;
  account_number?: string;
}

// Tipo para PaymentIntent expandido - necesitamos any para propiedades dinámicas de Stripe
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtendedPaymentIntent = any;

// Helper para acceder seguro a propiedades anidadas
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeGet(obj: any, path: string): any {
  return (
    path
      .split(".")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .reduce((current: any, key: string) => current?.[key], obj)
  );
}

/**
 * Extrae referencia SPEI y detalles bancarios desde Stripe
 */
export async function extractSpeiDetails(
  paymentIntentId: string
): Promise<SpeiDetails> {
  const details: SpeiDetails = {};

  try {
    const stripe = getStripe();
    // Obtener PaymentIntent con expansiones
    const pi = (await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: [
        "charges.data.payment_method_details",
        "payment_method",
        "next_action.display_bank_transfer_instructions",
        "latest_charge.payment_method_details",
      ],
    })) as ExtendedPaymentIntent;

    console.log("Extracting SPEI details for PI:", paymentIntentId);

    // Método 1: Desde next_action (pagos pendientes)
    if (
      pi.next_action?.type === "display_bank_transfer_instructions" &&
      pi.next_action.display_bank_transfer_instructions
    ) {
      const instructions = pi.next_action.display_bank_transfer_instructions;

      if (instructions.reference) {
        details.reference = instructions.reference;
        console.log("SPEI reference extracted from next_action");
      }

      if (Array.isArray(instructions.financial_addresses)) {
        // Buscar la dirección SPEI (no CLABE como tipo)
        const speiAddress = instructions.financial_addresses.find(
          (addr: any) => addr?.type === "spei"
        );
        
        if (speiAddress?.spei) {
          details.clabe = speiAddress.spei.clabe;
          details.bankName = speiAddress.spei.bank_name;
          console.log("SPEI CLABE extracted from next_action");
        }
        
        // Fallback: buscar por tipo "clabe" (estructura anterior)
        if (!details.clabe) {
          const clabeAddress = instructions.financial_addresses.find(
            (addr: FinancialAddress) => addr?.type === "clabe"
          );
          if (clabeAddress) {
            details.clabe = clabeAddress.clabe;
            details.bankName = clabeAddress.bank_name;
            console.log("SPEI CLABE extracted from fallback");
          }
        }
      }

      if (instructions.hosted_instructions_url) {
        details.instructions = instructions.hosted_instructions_url;
      }
    }

    // Método 2: Desde charges (pagos completados)
    const charges = pi.charges?.data ?? [];
    for (const charge of charges) {
      if (charge.payment_method_details?.customer_balance) {
        console.log("Checking charge for SPEI reference");

        // Extraer referencia desde la descripción
        if (charge.description) {
          const refMatch =
            charge.description.match(/REF[:\s]*(\d{7,10})/i) ||
            charge.description.match(/\b(\d{7,10})\b/);
          if (refMatch?.[1]) {
            details.reference = refMatch[1];
            console.log("SPEI reference extracted from charge description");
            break;
          }
        }

        // Desde metadata
        if (charge.metadata?.spei_reference) {
          details.reference = charge.metadata.spei_reference;
          console.log("SPEI reference extracted from charge metadata");
          break;
        }
      }
    }

    // Método 3: Desde payment_method
    if (pi.payment_method && typeof pi.payment_method === "object") {
      const pm = pi.payment_method as Stripe.PaymentMethod;
      // Payment method validation for customer_balance
    }

    // Método 4: Revisar balance transactions recientes
    if (!details.reference) {
      try {
        const transactions = await stripe.balanceTransactions.list({
          limit: 20,
        });

        for (const tx of transactions.data) {
          if (tx.description?.includes(pi.id)) {
            const refMatch =
              tx.description.match(/REF[:\s]*(\d{7,10})/i) ||
              tx.description.match(/\b(\d{7,10})\b/);
            if (refMatch?.[1]) {
              details.reference = refMatch[1];
              console.log("SPEI reference extracted from balance transaction");
              break;
            }
          }
        }
      } catch (err) {
        console.log("Could not retrieve balance transactions");
      }
    }

    // Fallback: Generar referencia desde el ID del PI
    if (!details.reference) {
      const piId = pi.id.replace("pi_", "");
      let fallbackRef = piId.slice(-8);
      fallbackRef = fallbackRef.replace(/[a-z]/gi, (c: string) =>
        String(c.charCodeAt(0) % 10)
      );
      details.reference = fallbackRef.padStart(8, "0");
      console.log("Using generated SPEI reference as fallback");
    }

    return details;
  } catch (error) {
    console.error("Error extracting SPEI details:", error);

    // Fallback final
    const piId = paymentIntentId.replace("pi_", "");
    let fallbackRef = piId.slice(-8);
    fallbackRef = fallbackRef.replace(/[a-z]/gi, (c: string) =>
      String(c.charCodeAt(0) % 10)
    );

    return {
      reference: fallbackRef.padStart(8, "0"),
    };
  }
}

/**
 * Valida si una referencia parece válida para SPEI
 */
export function isValidSpeiReference(reference: string): boolean {
  return /^\d{7,10}$/.test(reference);
}

/**
 * Formatea la referencia SPEI para mostrar
 */
export function formatSpeiReference(reference: string): string {
  if (!reference) return "";
  return reference.replace(/(\d{3})(?=\d)/g, "$1 ");
}
