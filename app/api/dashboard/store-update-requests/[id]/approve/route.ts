
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    // In a real app check if user is admin. For now, we assume user visiting this endpoint is authorized 
    // (though verify if you want strict admin check here like in PendingProductsPage)
    if (!userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    
    // Fetch the request
    const reqDoc = await writeClient.fetch(
      `*[_type == "storeUpdateRequest" && _id == $id][0]`,
      { id }
    );

    if (!reqDoc) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    if (reqDoc.status !== "pending") {
      return NextResponse.json(
        { error: `Solicitud ya fue procesada. Status actual: ${reqDoc.status}` },
        { status: 400 }
      );
    }

    const storeId = reqDoc.store?._ref;
    if (!storeId) {
      return NextResponse.json({ error: "Tienda referencia inválida" }, { status: 400 });
    }

    // Apply changes to store
    // The changes object contains fields that map directly to the store schema
    const changes = reqDoc.changes || {};
    
    // Filter out undefined/nulls if necessary, but sanity patch handles objects fine.
    // We want to update only fields present in changes.
    const patch = writeClient.patch(storeId);
    
    if (Object.keys(changes).length > 0) {
        patch.set(changes);
    }

    const updatedStore = await patch.commit();

    // Update the request status
    await writeClient
      .patch(id)
      .set({
        status: "approved",
        approvedBy: userId,
        approvedAt: new Date().toISOString(),
      })
      .commit();

    return NextResponse.json({ success: true, store: updatedStore });
  } catch (e) {
    console.error("[approve-store]", e);
    return NextResponse.json(
      { error: "Error aprobando solicitud: " + String(e) },
      { status: 500 }
    );
  }
}
