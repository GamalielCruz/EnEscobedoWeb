
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!isAdminUser(userId)) {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { reason } = body;

    const updatedRequest = await writeClient
      .patch(id)
      .set({
        status: "rejected",
        rejectedBy: userId,
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason || undefined,
      })
      .commit();

    return NextResponse.json({ success: true, request: updatedRequest });
  } catch (e) {
    console.error("[reject-store]", e);
    return NextResponse.json(
      { error: "Error rechazando solicitud" },
      { status: 500 }
    );
  }
}
