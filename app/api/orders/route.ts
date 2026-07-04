import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getMyOrders } from "@/sanity/lib/orders/getMyOrders";

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const orders = await getMyOrders(userId);
  const simplifiedOrders = (orders ?? []).map((order: Record<string, unknown>) => ({
    _id: String(order._id ?? ""),
    orderNumber: String(order.orderNumber ?? ""),
    status: String(order.status ?? "pending"),
    updatedAt: String(order.updatedAt ?? order.orderDate ?? ""),
    isClickCollect: Boolean(order.isClickCollect),
  }));

  return NextResponse.json(
    { orders: simplifiedOrders },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
