import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, writeClient } from "@/sanity/lib/client";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const includeRejected = searchParams.get("includeRejected") === "true";

    // Fetch pending requests (optionally include rejected for re-approval)
    const statusFilter = includeRejected 
      ? `(status == 'pending' || status == 'rejected')`
      : `status == 'pending'`;
    const query = `*[_type == "productUpdateRequest" && ${statusFilter}]{ _id, product->{_id, name, affiliateStore->{_id, name}}, changes, submittedBy, submittedAt, status, rejectionReason }`;
    console.log("[product-update-requests GET] Fetching with query:", query);
    const items = await writeClient.fetch(query, {});
    console.log("[product-update-requests GET] Found items:", items.length);
    return NextResponse.json({ success: true, items: items ?? [] }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (e) {
    console.error("[product-update-requests GET]", e);
    return NextResponse.json({ error: "Error cargando solicitudes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { productId, changes } = body;
    if (!productId || !changes) return NextResponse.json({ error: "productId y changes son requeridos" }, { status: 400 });

    console.log("[product-update-requests POST] Creating request for product:", productId);
    console.log("[product-update-requests POST] Changes:", changes);

    const doc: any = {
      _type: "productUpdateRequest",
      product: { _type: "reference", _ref: productId },
      changes,
      status: "pending",
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
    };

    console.log("[product-update-requests POST] Doc to create:", JSON.stringify(doc, null, 2));

    const created = await writeClient.create(doc);
    console.log("[product-update-requests POST] Created successfully:", created._id);
    return NextResponse.json({ success: true, request: created });
  } catch (e) {
    console.error("[product-update-requests POST] Error:", e);
    return NextResponse.json({ error: String(e) || "Error creando solicitud" }, { status: 500 });
  }
}
