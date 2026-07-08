import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado", requestId }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "Sin permisos", requestId }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    const query = `*[_type == "product" && approvalStatus == 'pending' ${storeId ? '&& affiliateStore._ref == $storeId' : ''}] { _id, name, price, affiliateStore->{_id, name}, submittedBy, submittedAt, pendingChanges }`;
    const data = await client.fetch(query, { storeId });
    return NextResponse.json({ success: true, items: data ?? [], requestId });
  } catch (e) {
    console.error("[dashboard/pending-products GET]", { requestId, error: e });
    return NextResponse.json({ error: "Error cargando pendientes", requestId }, { status: 500 });
  }
}
