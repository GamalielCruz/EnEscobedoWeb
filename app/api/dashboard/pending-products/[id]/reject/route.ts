import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    const productId = id;
    const body = await request.json();
    const { reason } = body || {};

    const patch = writeClient.patch(productId as string).set({
      approvalStatus: "rejected",
      rejectedBy: userId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason || undefined,
    }).unset(["pendingChanges"]);

    const updated = await patch.commit();
    return NextResponse.json({ success: true, product: updated });
  } catch (e) {
    console.error("[dashboard/pending-products reject]", e);
    return NextResponse.json({ error: "Error al rechazar" }, { status: 500 });
  }
}
