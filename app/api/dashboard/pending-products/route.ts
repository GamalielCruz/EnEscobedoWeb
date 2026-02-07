import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");

    const query = `*[_type == "product" && approvalStatus == 'pending' ${storeId ? '&& affiliateStore._ref == $storeId' : ''}] { _id, name, price, affiliateStore->{_id, name}, submittedBy, submittedAt, pendingChanges }`;
    const data = await client.fetch(query, { storeId });
    return NextResponse.json({ success: true, items: data ?? [] });
  } catch (e) {
    console.error("[dashboard/pending-products GET]", e);
    return NextResponse.json({ error: "Error cargando pendientes", details: String(e) }, { status: 500 });
  }
}
