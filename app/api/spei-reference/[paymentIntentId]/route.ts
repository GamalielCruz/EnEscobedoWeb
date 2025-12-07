import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendClient } from "@/sanity/lib/backendClient";
import { extractSpeiDetails } from "@/lib/spei-reference-extractor";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentIntentId: string }> }
) {
  try {
    const { userId } = await auth();
    const { paymentIntentId } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify the user owns an order with this payment intent
    const order = await backendClient.fetch(
      `*[_type == "order" && stripePaymentIntentId == $paymentIntentId && clerkUserId == $userId][0]`,
      { paymentIntentId }
    );

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // Extract fresh SPEI details from Stripe
    const speiDetails = await extractSpeiDetails(paymentIntentId);

    // Update the order with the latest details if we got new information
    if (speiDetails.reference && speiDetails.reference !== order.bankTransferReference) {
      await backendClient
        .patch(order._id)
        .set({
          bankTransferReference: speiDetails.reference,
          bankTransferClabe: speiDetails.clabe || order.bankTransferClabe,
        })
        .commit();

      console.log("Updated order with fresh SPEI details:", order._id);
    }

    return NextResponse.json({
      reference: speiDetails.reference,
      clabe: speiDetails.clabe,
      bankName: speiDetails.bankName,
      instructions: speiDetails.instructions,
      orderNumber: order.orderNumber,
      amount: order.totalPrice,
      currency: order.currency,
    });

  } catch (error) {
    console.error("Error retrieving SPEI reference:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}