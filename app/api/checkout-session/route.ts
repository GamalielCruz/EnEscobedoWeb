import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createCheckoutSession,
  GroupedBasketItem,
  Metadata,
} from "@/actions/createCheckoutSession";
import { assertCurrentLegalAcceptance } from "@/lib/legal-config";
import { recordCurrentLegalAcceptance } from "@/lib/legal-acceptance";
import { DeliverySlotUnavailableError } from "@/lib/fulfillment-schedule";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado", requestId }, { status: 401 });
    }

    const body = await request.json();
    const { items, metadata } = body ?? {};

    if (!Array.isArray(items) || !metadata) {
      return NextResponse.json(
        { error: "Datos invalidos para checkout", requestId },
        { status: 400 }
      );
    }
    assertCurrentLegalAcceptance(metadata.legalAccepted);
    await recordCurrentLegalAcceptance(request, userId, "checkout_card");

    const clientSecret = await createCheckoutSession(items as GroupedBasketItem[], {
      ...(metadata as Metadata),
      clerkUserId: userId,
    });

    return NextResponse.json({ clientSecret, requestId });
  } catch (error) {
    console.error("Error al crear la sesion de checkout", {
      requestId,
      error,
    });
    return NextResponse.json(
      {
        ...(error instanceof DeliverySlotUnavailableError
          ? { code: error.code, alternatives: error.alternatives }
          : {}),
        error: error instanceof Error ? error.message : "Error al crear la sesion de checkout",
        requestId,
      },
      { status: error instanceof DeliverySlotUnavailableError ? 409 : 500 }
    );
  }
}
