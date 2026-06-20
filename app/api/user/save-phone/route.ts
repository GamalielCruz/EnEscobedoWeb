import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();
    const { phone, whatsappConsent } = body;

    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ success: false, error: "Número de teléfono inválido" }, { status: 400 });
    }

    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: {
        phone: phone.replace(/\D/g, "").slice(-10),
        whatsappConsent: whatsappConsent === true,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno";
    console.error("❌ save-phone API ERROR:", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
