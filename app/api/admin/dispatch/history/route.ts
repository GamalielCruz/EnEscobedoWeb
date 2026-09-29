import { NextResponse } from "next/server";
import { fetchDispatchHistory, requireAdmin } from "@/lib/dispatch/dispatch-core";

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const entries = await fetchDispatchHistory(150);
    return NextResponse.json({ entries }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/dispatch/history]", error);
    return NextResponse.json({ error: "No se pudo cargar el historial." }, { status: 500 });
  }
}
