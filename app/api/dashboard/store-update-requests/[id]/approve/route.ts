
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

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
  "scheduledOrdersEnabled",
  "minimumPreparationMinutes",
  "scheduledOrderIntervalMinutes",
  "maximumScheduledDays",
  "lastDeliveryOrderMinutesBeforeClose",
  "lastPickupOrderMinutesBeforeClose",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!isAdminUser(userId)) {
        return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
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
    const changes = Object.fromEntries(
      Object.entries(reqDoc.changes || {}).filter(([key]) => ALLOWED_CHANGE_FIELDS.has(key))
    );
    if (typeof changes.maximumScheduledDays === "number") {
      const globalMaximum = await writeClient.fetch<number | null>(
        `*[_type == "deliveryScheduleConfig" && _id == "deliveryScheduleConfig"][0].maximumScheduledDays`
      );
      if (changes.maximumScheduledDays > (globalMaximum ?? 7)) {
        return NextResponse.json(
          { error: `El maximo global es ${globalMaximum ?? 7} dias.` },
          { status: 400 }
        );
      }
    }
    
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
      { error: "Error aprobando solicitud" },
      { status: 500 }
    );
  }
}
