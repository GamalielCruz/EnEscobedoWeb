import { after, NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appendOrderEvent } from "@/lib/order-events";
import { createOrderWithCommercialCap } from "@/lib/commercial-order";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";
import { recordCurrentLegalAcceptance } from "@/lib/legal-acceptance";
import { buildMandadoOrderDocument, quoteMandado } from "@/lib/mandado-order";
import { resolveMandadoNipChannel, resolveNipDeliveryTarget } from "@/lib/mandado-nip-channel";
import { syncBaserowOrder } from "@/lib/baserow";

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
    // PASO 3 + AJUSTE 1/2: decidir el canal del NIP (destinatario o remitente).
    // `recipientWhatsAppDeclared` es una DECLARACIÓN del usuario; el fallback al
    // remitente exige `senderNipFallbackAccepted` explícito. Sin canal válido se
    // rechaza con explicación.
    const recipientWhatsAppDeclared = body.recipientWhatsAppDeclared === undefined ? undefined : Boolean(body.recipientWhatsAppDeclared);
    const senderNipFallbackAccepted = body.senderNipFallbackAccepted === true;
    const nipChannel = resolveMandadoNipChannel({
      pinEnabled: draft.pinEnabled === true,
      senderPhone: phone,
      recipientName: String(body.recipientName || ""),
      recipientPhone: String(body.recipientPhone || ""),
      recipientWhatsAppDeclared,
      senderFallbackAccepted: senderNipFallbackAccepted,
      explicitNipRecipient: typeof body.nipRecipient === "string" ? body.nipRecipient : undefined,
    });
    if (!nipChannel.ok) throw new Error(nipChannel.error);
    // Endurecimiento B: canal EFECTIVO + teléfono destino, separados del
    // responsable (`nipRecipient`). Se persisten para la auditoría del envío.
    const nipTarget = resolveNipDeliveryTarget(nipChannel.channel, {
      senderPhone: phone,
      recipientPhone: String(body.recipientPhone || ""),
    });
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
      recipientPhone: String(body.recipientPhone || ""),
      recipientName: String(body.recipientName || ""),
      recipientWhatsAppDeclared,
      senderNipFallbackAccepted,
      nipRecipient: nipChannel.ok ? nipChannel.channel ?? undefined : undefined,
      nipDeliveryChannel: nipTarget.deliveryChannel,
      nipDeliveryPhone: nipTarget.deliveryPhone,
      businessName: String(body.businessName || ""),
      originReference: String(body.originReference || ""),
      destinationReference: String(body.destinationReference || ""),
      destinationPerson: String(body.destinationPerson || ""),
    });
    const order = await createOrderWithCommercialCap(orderData);
    await appendOrderEvent(order._id, { type: "created", source: "api/mandado/orders", actor: userId });
    await appendOrderEvent(order._id, { type: "dispatch_started", source: "api/mandado/orders" });
    after(async () => {
      // Confirmación inicial: NO reutilizar `confirmacion_pedido` (plantilla de
      // restaurantes). Los Mandados tienen flujo propio: cuando Meta apruebe una
      // plantilla exclusiva de confirmación, registrarla en lib/whatsapp/templates.ts
      // y enviarla aquí.
      await Promise.allSettled([
        dispatchDeliveryOffer(order._id),
        syncBaserowOrder({ ...orderData, _id: order._id, restaurantName: "Mandado El Menú" }),
      ]);
    });
    return NextResponse.json({ success: true, orderId: order._id, orderNumber });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pudimos crear el mandado." }, { status: 400 });
  }
}
