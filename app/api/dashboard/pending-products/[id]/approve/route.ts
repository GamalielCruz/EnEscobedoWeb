import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const { id } = await params;
    const productId = id;

    // Fetch product and pendingChanges
    const prod = await writeClient.fetch(`*[_type == "product" && _id == $id][0]`, { id: productId });
    if (!prod) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    // Apply pendingChanges if present, else just mark approved
    const patch = writeClient.patch(productId as string);
    if (prod.pendingChanges) {
      const pending = prod.pendingChanges;
      // set fields from pending
      const setObj: any = {};
      if (pending.name) setObj.name = pending.name;
      if (pending.price != null) setObj.price = pending.price;
      if (pending.stock != null) setObj.stock = pending.stock;
      if (pending.description) setObj.description = pending.description;
      if (pending.image) setObj.image = pending.image;
      if (pending.categories) setObj.categories = pending.categories;
      if (pending.optionGroups) setObj.optionGroups = pending.optionGroups;
      if (pending.allowSpecialInstructions != null) setObj.allowSpecialInstructions = pending.allowSpecialInstructions;
      if (pending.acceptsAllergyRequests != null) setObj.acceptsAllergyRequests = pending.acceptsAllergyRequests;
      patch.set(setObj).unset(["pendingChanges"]);
    }

    patch.set({ approvalStatus: "approved", approvedBy: userId, approvedAt: new Date().toISOString(), isVisible: true });

    const updated = await patch.commit();
    return NextResponse.json({ success: true, product: updated });
  } catch (e) {
    console.error("[dashboard/pending-products approve]", e);
    return NextResponse.json({ error: "Error al aprobar" }, { status: 500 });
  }
}
