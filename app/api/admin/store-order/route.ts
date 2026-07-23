import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { isAdminUser } from "@/lib/admin";
import { isCompleteOrder } from "@/lib/product-order";
import { writeClient } from "@/sanity/lib/client";

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    if (!isAdminUser(userId)) {
      return NextResponse.json({ error: "No tienes permisos" }, { status: 403 });
    }

    const { storeIds } = await request.json();
    if (
      !Array.isArray(storeIds) ||
      storeIds.some((storeId) => typeof storeId !== "string" || !storeId)
    ) {
      return NextResponse.json({ error: "Orden de tiendas invalido" }, { status: 400 });
    }

    const availableIds = await writeClient.fetch<string[]>(
      `*[_type == "affiliateStore" && isActive == true]._id`
    );
    if (!isCompleteOrder(availableIds, storeIds)) {
      return NextResponse.json(
        { error: "El orden debe incluir todas las tiendas activas una sola vez" },
        { status: 400 }
      );
    }

    if (storeIds.length === 0) {
      return NextResponse.json({ success: true });
    }

    let transaction = writeClient.transaction();
    storeIds.forEach((storeId, index) => {
      transaction = transaction.patch(storeId, { set: { homepageOrder: index } });
    });
    await transaction.commit();

    revalidatePath("/");
    revalidatePath("/admin");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[admin/store-order PATCH]", error);
    return NextResponse.json({ error: "No se pudo guardar el orden" }, { status: 500 });
  }
}
