import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";
import { recordCurrentLegalAcceptance } from "@/lib/legal-acceptance";
import { quoteMandado } from "@/lib/mandado-order";
import { getStripe } from "@/lib/stripe";
import { buildUrl } from "@/lib/urls";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    const body = await request.json();
    assertCurrentLegalAcceptance(body.legalAccepted);
    await recordCurrentLegalAcceptance(request, userId, "checkout_card");
    const draft = await quoteMandado(body.draft);
    const orderNumber = String(body.orderNumber || crypto.randomUUID());
    const customerEmail = String(body.customerEmail || "").trim();
    const customerName = String(body.customerName || "Cliente").trim();
    const phone = String(body.phone || "").replace(/\D/g, "");
    if (phone.length < 10 || !customerEmail.includes("@")) throw new Error("Revisa tu teléfono y correo antes de continuar.");
    const stripe = getStripe();
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    const customerId = customers.data[0]?.id ?? (await stripe.customers.create({ email: customerEmail, name: customerName, metadata: { clerkUserId: userId } })).id;
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      ui_mode: "embedded",
      payment_method_types: ["card"],
      return_url: buildUrl(`/success?session_id={CHECKOUT_SESSION_ID}&orderNumber=${encodeURIComponent(orderNumber)}&service=mandado`),
      metadata: {
        serviceKind: "mandado",
        orderNumber,
        clerkUserId: userId,
        customerName,
        customerEmail,
        phone,
        mandadoMode: draft.mode,
        mandadoOriginLabel: draft.origin.label,
        mandadoOriginLat: String(draft.origin.lat),
        mandadoOriginLng: String(draft.origin.lng),
        mandadoDestinationLabel: draft.destination.label,
        mandadoDestinationLat: String(draft.destination.lat),
        mandadoDestinationLng: String(draft.destination.lng),
        mandadoDetails0: draft.details.slice(0, 450),
        mandadoDetails1: draft.details.slice(450),
        mandadoRecipientPhone: String(body.recipientPhone || "").replace(/\D/g, "").slice(-12),
        mandadoRecipientName: String(body.recipientName || "").trim().slice(0, 60),
        mandadoBusinessName: String(body.businessName || "").trim().slice(0, 80),
        mandadoOriginReference: String(body.originReference || "").trim().slice(0, 120),
        mandadoDestinationReference: String(body.destinationReference || "").trim().slice(0, 120),
        mandadoDestinationPerson: String(body.destinationPerson || "").trim().slice(0, 60),
      },
      line_items: [{
        price_data: {
          currency: "mxn",
          unit_amount: Math.round(draft.price * 100),
          product_data: { name: "Servicio de mandado", description: draft.mode === "purchase" ? "Comprar y entregar" : "Recoger y entregar" },
        },
        quantity: 1,
      }],
    });
    return NextResponse.json({ clientSecret: session.client_secret, orderNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pudimos iniciar el pago." }, { status: 400 });
  }
}
