import { NextRequest, NextResponse } from "next/server";
import {
  createCheckoutSession,
  GroupedBasketItem,
  Metadata,
} from "@/actions/createCheckoutSession";

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const body = await request.json();
    const { items, metadata } = body ?? {};

    if (!Array.isArray(items) || !metadata) {
      return NextResponse.json(
        { error: "Datos inválidos para checkout", requestId },
        { status: 400 }
      );
    }

    const clientSecret = await createCheckoutSession(
      items as GroupedBasketItem[],
      metadata as Metadata
    );

    return NextResponse.json({ clientSecret, requestId });
  } catch (error) {
    console.error("Error al crear la sesión de checkout", {
      requestId,
      error,
    });
    return NextResponse.json(
      {
        error: "Error al crear la sesión de checkout",
        requestId,
      },
      { status: 500 }
    );
  }
}
