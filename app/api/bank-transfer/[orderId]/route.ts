import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendClient } from "@/sanity/lib/backendClient";
import { getBankTransferDetails } from "@/lib/stripe-bank-transfer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const { userId } = await auth();
    const { orderId } = await params;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the order from Sanity
    const order = await backendClient.fetch(
      `*[_type == "order" && _id == $orderId && clerkUserId == $userId][0]`,
      { orderId }
    );

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    // If it's not a bank transfer, return error
    if (order.paymentMethod !== "bank_transfer") {
      return NextResponse.json(
        { error: "Order is not a bank transfer" },
        { status: 400 }
      );
    }

    // If we already have the bank transfer details, return them
    if (order.bankTransferReference && order.bankTransferClabe) {
      return NextResponse.json({
        reference: order.bankTransferReference,
        clabe: order.bankTransferClabe,
        amount: order.totalPrice,
        currency: order.currency,
        orderNumber: order.orderNumber,
      });
    }

    // If we don't have them stored, try to get them from Stripe
    if (order.stripePaymentIntentId) {
      const bankDetails = await getBankTransferDetails(order.stripePaymentIntentId);
      
      if (bankDetails) {
        // Update the order with the retrieved details
        await backendClient
          .patch(order._id)
          .set({
            bankTransferReference: bankDetails.reference,
            bankTransferClabe: bankDetails.clabe,
          })
          .commit();

        return NextResponse.json({
          reference: bankDetails.reference,
          clabe: bankDetails.clabe,
          amount: order.totalPrice,
          currency: order.currency,
          orderNumber: order.orderNumber,
        });
      }
    }

    // If we still don't have details, return what we have
    return NextResponse.json({
      reference: order.orderNumber, // Fallback to order number
      amount: order.totalPrice,
      currency: order.currency,
      orderNumber: order.orderNumber,
      message: "Bank transfer details are being generated. Check your email or try again in a few minutes.",
    });

  } catch (error) {
    console.error("Error retrieving bank transfer details:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}