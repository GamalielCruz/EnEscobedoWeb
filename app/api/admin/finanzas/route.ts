import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isAdminUser } from "@/lib/admin";
import { getAdminFinanceSnapshot } from "@/lib/admin-finance";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || undefined;
    const snapshot = await getAdminFinanceSnapshot(date);

    return NextResponse.json({ success: true, snapshot }, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("[admin/finanzas GET]", error);
    return NextResponse.json({ error: "Error al cargar finanzas" }, { status: 500 });
  }
}
