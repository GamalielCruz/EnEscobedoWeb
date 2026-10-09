import { after, NextRequest, NextResponse } from "next/server";
import { appendOrderEvent } from "@/lib/order-events";
import { createOrderWithCommercialCap } from "@/lib/commercial-order";
import { dispatchDeliveryOffer } from "@/lib/delivery-dispatch";
import { buildMandadoOrderDocument, createMandadoSettlementSnapshot, quoteMandado } from "@/lib/mandado-order";
import { resolveMandadoNipChannel, resolveNipDeliveryTarget } from "@/lib/mandado-nip-channel";

const TEST_ACTOR = "test-api";

function isAllowedTestEnvironment() {
  return process.env.VERCEL_ENV !== "production" && process.env.NODE_ENV !== "production";
}

function authorizeTestRequest(request: NextRequest) {
  if (!isAllowedTestEnvironment()) return false;
  const configuredSecret = process.env.ELMENU_TEST_API_SECRET?.trim();
  const receivedSecret = request.headers.get("x-test-secret")?.trim();
  return Boolean(configuredSecret && receivedSecret && receivedSecret === configuredSecret);
}

function testOrderNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();
  return `TEST-M-${stamp}-${suffix}`;
}

export async function POST(request: NextRequest) {
  if (!authorizeTestRequest(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const draft = await quoteMandado({
      mode: body.mode ?? "pickup",
      origin: body.origin,
      destination: body.destination,
      details: body.details ?? "Pedido de prueba para ElMenu Drive",
      pinEnabled: body.pinEnabled === true,
    });

    const phone = String(body.phone || "4420000000").replace(/\D/g, "");
    const recipientPhone = String(body.recipientPhone || "4420000001").replace(/\D/g, "");
    if (phone.length < 10 || recipientPhone.length < 10) {
      throw new Error("phone y recipientPhone deben tener al menos 10 dígitos.");
    }

    const customerEmail = String(body.customerEmail || "test@elmenu.site").trim();
    const recipientWhatsAppDeclared = body.recipientWhatsAppDeclared === undefined
      ? true
      : Boolean(body.recipientWhatsAppDeclared);
    const senderNipFallbackAccepted = body.senderNipFallbackAccepted === true;

    const nipChannel = resolveMandadoNipChannel({
      pinEnabled: draft.pinEnabled === true,
      senderPhone: phone,
      recipientName: String(body.recipientName || "Destinatario Test"),
      recipientPhone,
      recipientWhatsAppDeclared,
      senderFallbackAccepted: senderNipFallbackAccepted,
      explicitNipRecipient: typeof body.nipRecipient === "string" ? body.nipRecipient : undefined,
    });
    if (!nipChannel.ok) throw new Error(nipChannel.error);

    const nipTarget = resolveNipDeliveryTarget(nipChannel.channel, {
      senderPhone: phone,
      recipientPhone,
    });

    const orderNumber = testOrderNumber();
    const settlementSnapshot = createMandadoSettlementSnapshot(draft, "cash_on_delivery");
    const orderData = {
      ...buildMandadoOrderDocument({
        draft,
        orderNumber,
        clerkUserId: TEST_ACTOR,
        customerName: String(body.customerName || "Cliente Test").trim(),
        customerEmail,
        phone,
        paymentMethod: "cash_on_delivery",
        paymentStatus: "unpaid",
        settlementSnapshot,
        recipientPhone,
        recipientName: String(body.recipientName || "Destinatario Test").trim(),
        recipientWhatsAppDeclared,
        senderNipFallbackAccepted,
        nipRecipient: nipChannel.ok ? nipChannel.channel ?? undefined : undefined,
        nipDeliveryChannel: nipTarget.deliveryChannel,
        nipDeliveryPhone: nipTarget.deliveryPhone,
        businessName: String(body.businessName || "Mandado TEST").trim(),
        originReference: String(body.originReference || "Prueba Postman").trim(),
        destinationReference: String(body.destinationReference || "Prueba Postman").trim(),
        destinationPerson: String(body.destinationPerson || "Destinatario Test").trim(),
      }),
      isTestOrder: true,
      testSource: "postman",
    };

    const order = await createOrderWithCommercialCap(orderData);
    await appendOrderEvent(order._id, { type: "created", source: "api/test/mandado", actor: TEST_ACTOR });
    await appendOrderEvent(order._id, { type: "dispatch_started", source: "api/test/mandado" });

    after(async () => {
      await dispatchDeliveryOffer(order._id);
    });

    return NextResponse.json({
      success: true,
      testOrder: true,
      orderId: order._id,
      orderNumber,
      dispatchStatus: order.dispatchStatus ?? "waiting_for_driver",
      price: draft.price,
      driverPayout: draft.polygonPrice,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No pudimos crear el pedido de prueba." },
      { status: 400 },
    );
  }
}
