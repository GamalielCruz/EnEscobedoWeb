import Stripe from "stripe";
import { assertSafeDeploymentConfiguration } from "./deployment-environment";

let stripeInstance: Stripe | null = null;

export function getStripe() {
  assertSafeDeploymentConfiguration();
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey, {
      apiVersion: "2025-07-30.basil",
    });
  }
  return stripeInstance;
}

export default getStripe;
