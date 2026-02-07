import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const { id } = await params;

    const body = await request.json();
    const { reason } = body || {};

    console.log("[reject] Starting rejection for request:", id);
    
    const updated = await writeClient.patch(id).set({ 
      status: "rejected", 
      rejectedBy: userId, 
      rejectedAt: new Date().toISOString(), 
      rejectionReason: reason || undefined 
    }).commit();
    
    console.log("[reject] Request updated to rejected:", updated._id, "Status:", updated.status);
    
    return NextResponse.json({ success: true, request: updated });
  } catch (e) {
    console.error("[reject]", e);
    return NextResponse.json({ error: "Error rechazando solicitud: " + String(e) }, { status: 500 });
  }
}
