import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appendOrderEvent } from "@/lib/order-events";
import { createOrderWithCommercialCap } from "@/lib/commercial-order";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";
import { recordCurrentLegalAcceptance } from "@/lib/legal-acceptance";
import { buildMandadoOrderDocument, quoteMandado } from "@/lib/mandado-order";
import { syncBaserowOrder } from "@/lib/baserow";
import { sendOrderConfirmation } from "@/lib/whatsapp";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    const body = await request.json();
    assertCurrentLegalAcceptance(body.legalAccepted);
    await recordCurrentLegalAcceptance(request, userId, "checkout_cash_delivery");
    const draft = await quoteMandado(body.draft);
    const phone = String(body.phone || "").replace(/\D/g, "");
    const customerEmail = String(body.customerEmail || "").trim();
    if (phone.length < 10 || !customerEmail.includes("@")) throw new Error("Revisa tu teléfono y correo antes de continuar.");
    const orderNumber = String(body.orderNumber || crypto.randomUUID());
    const orderData = buildMandadoOrderDocument({
      draft,
      orderNumber,
      clerkUserId: userId,
      customerName: String(body.customerName || "Cliente").trim(),
      customerEmail,
      phone,
      paymentMethod: "cash_on_delivery",
      paymentStatus: "unpaid",
    });
    const order = await createOrderWithCommercialCap(orderData);
    await appendOrderEvent(order._id, { type: "created", source: "api/mandado/orders", actor: userId });
    await appendOrderEvent(order._id, { type: "dispatch_started", source: "api/mandado/orders" });
    after(async () => {
      await Promise.allSettled([
        dispatchDeliveryOffer(order._id),
        syncBaserowOrder({ ...orderData, _id: order._id, restaurantName: "Mandado El Menú" }),
        sendOrderConfirmation(String(orderData.phone || ""), String(orderData.customerName || "Cliente"), orderNumber),
      ]);
    });
    return NextResponse.json({ success: true, orderId: order._id, orderNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pudimos crear el mandado." }, { status: 400 });
  }
}
