import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client, writeClient } from "@/sanity/lib/client";
import { isAdminUser } from "@/lib/admin";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    const { id } = await params;

    console.log("[approve] Starting approval for request:", id);

    // Fetch the request
    const reqDoc = await writeClient.fetch(`*[_type == "productUpdateRequest" && _id == $id][0]`, { id });
    console.log("[approve] Request doc fetched:", { status: reqDoc?.status, productId: reqDoc?.product?._ref });
    
    if (!reqDoc) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });

    // Allow approval of pending OR rejected requests (re-approval)
    if (reqDoc.status !== "pending" && reqDoc.status !== "rejected") {
      console.log("[approve] Cannot approve - status is:", reqDoc.status);
      return NextResponse.json({ error: `Solicitud ya fue ${reqDoc.status === 'approved' ? 'aprobada' : 'procesada'}. Status actual: ${reqDoc.status}` }, { status: 400 });
    }

    const productId = reqDoc.product?._ref || reqDoc.product?._id || (reqDoc.product && reqDoc.product._ref);
    if (!productId) return NextResponse.json({ error: "Producto referencia inválida" }, { status: 400 });

    console.log("[approve] Applying changes to product:", productId);

    // Apply changes to product
    const patch = writeClient.patch(productId as string);
    const changes = reqDoc.changes || {};
    const setObj: any = {};
    if (changes.name) setObj.name = changes.name;
    if (changes.price != null) setObj.price = changes.price;
    if (changes.stock != null) setObj.stock = changes.stock;
    if (changes.description) setObj.description = changes.description;
    if (changes.image) setObj.image = changes.image;
    if (changes.categories) setObj.categories = changes.categories;
    if (changes.optionGroups) setObj.optionGroups = changes.optionGroups;

    if (Object.keys(setObj).length > 0) patch.set(setObj);

    // mark product visible/approved if desired
    patch.set({ approvalStatus: "approved", approvedBy: userId, approvedAt: new Date().toISOString(), isVisible: true });

    const updatedProduct = await patch.commit();
    console.log("[approve] Product updated successfully:", updatedProduct._id);

    // Update the request status
    const updatedRequest = await writeClient.patch(id)
      .set({ 
        status: "approved", 
        approvedBy: userId, 
        approvedAt: new Date().toISOString() 
      })
      .commit();
    
    console.log("[approve] Request updated to approved:", updatedRequest._id);

    return NextResponse.json({ success: true, product: updatedProduct });
  } catch (e) {
    console.error("[approve]", e);
    return NextResponse.json({ error: "Error aprobando solicitud" }, { status: 500 });
  }
}
