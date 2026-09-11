import { NextResponse } from "next/server";
import { fetchDispatchSnapshot, requireAdmin } from "@/lib/dispatch/dispatch-core";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const snapshot = await fetchDispatchSnapshot();
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/dispatch GET]", error);
    return NextResponse.json({ error: "No se pudo cargar el Dispatch Center." }, { status: 500 });
  }
}
