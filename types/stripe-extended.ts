import Stripe from "stripe";

// Extended types for Stripe bank transfer instructions
export interface BankTransferInstructions {
  reference?: string | null;
  hosted_instructions_url?: string | null;
  financial_addresses?: FinancialAddress[];
}

export interface FinancialAddress {
  type: string;
  clabe?: string;
  account_number?: string;
  routing_number?: string;
  sort_code?: string;
  iban?: string;
  bsb_number?: string;
  branch_code?: string;
  bank_code?: string;
  bank_name?: string;
  supported_networks?: string[];
}

export interface ExtendedPaymentIntent extends Omit<Stripe.PaymentIntent, 'next_action'> {
  next_action?: {
    type: string;
    display_bank_transfer_instructions?: BankTransferInstructions;
  } | Stripe.PaymentIntent.NextAction | null;
}