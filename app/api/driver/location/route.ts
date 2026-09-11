import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import { updateDriverLocation } from "@/lib/driver-actions";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const body = await request.json().catch(() => ({}));
  const { lat, lng } = body ?? {};

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json(
      { error: "lat y lng son requeridos y deben ser números." },
      { status: 400 }
    );
  }

  const result = await updateDriverLocation(repartidor._id, lat, lng);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
