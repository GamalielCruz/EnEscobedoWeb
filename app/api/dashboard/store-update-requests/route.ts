
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";

export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const statusParam = searchParams.get("status");

    const allowedStatuses = ["pending", "approved", "rejected"] as const;
    const requestedStatuses = statusParam
      ? statusParam
          .split(",")
          .map((status) => status.trim())
          .filter((status): status is (typeof allowedStatuses)[number] =>
            allowedStatuses.includes(status as (typeof allowedStatuses)[number])
          )
      : ["pending"];
    const statusFilter =
      requestedStatuses.length === 1
        ? `status == '${requestedStatuses[0]}'`
        : `status in [${requestedStatuses.map((status) => `'${status}'`).join(", ")}]`;

    let query;
    let params: any = {};

    if (storeId) {
      query = `*[_type == "storeUpdateRequest" && store._ref == $storeId && ${statusFilter}]{ 
        _id, 
        store->{_id, name}, 
        changes, 
        submittedBy, 
        submittedAt, 
        status,
        rejectionReason
      } | order(submittedAt desc)`;
      params = { storeId };
    } else {
      query = `*[_type == "storeUpdateRequest" && ${statusFilter}]{ 
        _id, 
        store->{_id, name}, 
        changes, 
        submittedBy, 
        submittedAt, 
        status,
        rejectionReason
      } | order(submittedAt desc)`;
    }
    
    const items = await writeClient.fetch(query, params);
    return NextResponse.json({ success: true, items: items ?? [] }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (e) {
    console.error("[store-update-requests GET]", e);
    return NextResponse.json({ error: "Error cargando solicitudes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { storeId, changes } = body;
    if (!storeId || !changes) return NextResponse.json({ error: "storeId y changes son requeridos" }, { status: 400 });

    const doc: any = {
      _type: "storeUpdateRequest",
      store: { _type: "reference", _ref: storeId },
      changes,
      status: "pending",
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
    };

    const created = await writeClient.create(doc);
    return NextResponse.json({ success: true, request: created });
  } catch (e) {
    console.error("[store-update-requests POST] Error:", e);
    return NextResponse.json({ error: String(e) || "Error creando solicitud" }, { status: 500 });
  }
}
