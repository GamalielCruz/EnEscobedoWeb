import { NextRequest, NextResponse } from "next/server";
import { recommendDriversForOrder, requireAdmin } from "@/lib/dispatch/dispatch-core";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const orderId = request.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "Falta el pedido." }, { status: 400 });
  try {
    const recommendations = await recommendDriversForOrder(orderId, 5);
    return NextResponse.json({ recommendations });
  } catch (error) {
    console.error("[admin/dispatch/recommend]", error);
    return NextResponse.json({ error: "No se pudieron calcular recomendaciones." }, { status: 500 });
  }
}
