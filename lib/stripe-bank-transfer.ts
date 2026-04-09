import { getStripe } from "./stripe";
import { ExtendedPaymentIntent, BankTransferInstructions } from "@/types/stripe-extended";

export interface BankTransferDetails {
  reference?: string;
  clabe?: string;
  amount?: number;
  currency?: string;
  instructions?: string;
}

/**
 * Retrieves bank transfer details from a Stripe PaymentIntent
 */
export async function getBankTransferDetails(paymentIntentId: string): Promise<BankTransferDetails | null> {
  try {
    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['next_action.display_bank_transfer_instructions']
    }) as ExtendedPaymentIntent;

    if (paymentIntent.next_action?.type === 'display_bank_transfer_instructions') {
      const instructions = paymentIntent.next_action.display_bank_transfer_instructions as BankTransferInstructions;
      
      // Extract CLABE from financial_addresses
      const clabeAddress = instructions?.financial_addresses?.find(
        (addr) => addr.type === 'clabe'
      );

      return {
        reference: instructions?.reference || undefined,
        clabe: clabeAddress?.clabe || undefined,
        amount: paymentIntent.amount ? paymentIntent.amount / 100 : undefined,
        currency: paymentIntent.currency,
        instructions: instructions?.hosted_instructions_url || undefined,
      };
    }

    return null;
  } catch (error) {
    console.error("Error retrieving bank transfer details:", error);
    return null;
  }
}

/**
 * Formats a CLABE number for display (adds spaces for readability)
 */
export function formatClabe(clabe: string): string {
  if (!clabe || clabe.length !== 18) return clabe;
  
  // Format as: XXX XXX XXXXXXXXXXX X (bank code + branch + account + check digit)
  return `${clabe.slice(0, 3)} ${clabe.slice(3, 6)} ${clabe.slice(6, 17)} ${clabe.slice(17)}`;
}

/**
 * Validates a SPEI reference format
 */
export function isValidSpeiReference(reference: string): boolean {
  // SPEI references are typically 7-10 digits
  return /^\d{7,10}$/.test(reference);
}

/**
 * Generates a fallback reference if Stripe doesn't provide one
 */
export function generateFallbackReference(orderNumber: string): string {
  // Use last 8 characters of order number, removing hyphens
  const cleaned = orderNumber.replace(/-/g, '');
  return cleaned.slice(-8).toUpperCase();
}
