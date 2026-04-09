import { ensureOrderFromCheckoutSession } from "@/lib/stripe-order";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { sessionId, orderNumber } = await request.json();

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json(
        { success: false, error: "sessionId es requerido" },
        { status: 400 }
      );
    }

    const order = await ensureOrderFromCheckoutSession(sessionId, orderNumber);

    return NextResponse.json({
      success: true,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
      },
    });
  } catch (error) {
    console.error("[checkout/confirm] Error confirming checkout:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo confirmar la orden",
      },
      { status: 500 }
    );
  }
}
