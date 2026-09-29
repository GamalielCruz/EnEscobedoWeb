import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, setDriverControl, type DriverControlAction } from "@/lib/dispatch/dispatch-core";

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const body = await request.json();
    const { driverId, action, value, reason } = body ?? {};
    const validActions: DriverControlAction[] = ["block", "unblock", "pause", "resume", "priority"];
    if (!driverId || !validActions.includes(action)) {
      return NextResponse.json({ error: "Acción o repartidor inválidos." }, { status: 400 });
    }
    const result = await setDriverControl({
      driverId,
      action,
      value: typeof value === "number" ? value : undefined,
      reason,
      actorUserId: admin.userId,
      actorName: "Operador admin",
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/dispatch/driver]", error);
    return NextResponse.json({ error: "No se pudo actualizar el repartidor." }, { status: 500 });
  }
}
