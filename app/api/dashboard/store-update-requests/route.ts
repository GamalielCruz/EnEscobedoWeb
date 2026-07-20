
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";

const OWNED_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] { _id }`;
const ALLOWED_CHANGE_FIELDS = new Set([
  "name",
  "isOpen",
  "manualOperationalStatus",
  "highDemandMode",
  "contact",
  "address",
  "operatingHours",
  "serviceTypes",
  "hasOwnDelivery",
]);

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
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
    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownedStoreIds = ownedStores?.map((store) => store._id) ?? [];
    if (storeId && !ownedStoreIds.includes(storeId)) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda", requestId }, { status: 403 });
    }
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
      query = `*[_type == "storeUpdateRequest" && store._ref in $ownedStoreIds && ${statusFilter}]{ 
        _id, 
        store->{_id, name}, 
        changes, 
        submittedBy, 
        submittedAt, 
        status,
        rejectionReason
      } | order(submittedAt desc)`;
      params = { ownedStoreIds };
    }
    
    const items = await writeClient.fetch(query, params);
    return NextResponse.json({ success: true, items: items ?? [], requestId }, {
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (e) {
    console.error("[store-update-requests GET]", { requestId, error: e });
    return NextResponse.json({ error: "Error cargando solicitudes", requestId }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const body = await request.json();
    const { storeId, changes } = body;
    if (!storeId || !changes) return NextResponse.json({ error: "storeId y changes son requeridos" }, { status: 400 });
    const safeChanges = Object.fromEntries(
      Object.entries(changes).filter(([key]) => ALLOWED_CHANGE_FIELDS.has(key))
    );
    if (Object.keys(safeChanges).length === 0) {
      return NextResponse.json({ error: "No hay cambios permitidos" }, { status: 400 });
    }

    const ownedStores = await writeClient.fetch<{ _id: string }[]>(OWNED_STORES_QUERY, {
      userId,
    });
    const ownsStore = ownedStores?.some((store) => store._id === storeId);
    if (!ownsStore) {
      return NextResponse.json({ error: "No tienes permiso para esta tienda", requestId }, { status: 403 });
    }

    const doc: any = {
      _type: "storeUpdateRequest",
      store: { _type: "reference", _ref: storeId },
      changes: safeChanges,
      status: "pending",
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
    };

    const created = await writeClient.create(doc);
    return NextResponse.json({ success: true, request: created, requestId });
  } catch (e) {
    console.error("[store-update-requests POST] Error:", { requestId, error: e });
    return NextResponse.json({ error: "Error creando solicitud", requestId }, { status: 500 });
  }
}
