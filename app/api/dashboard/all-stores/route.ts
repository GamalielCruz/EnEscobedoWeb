import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Fetch all stores with their owners
    const stores = await client.fetch(`*[_type == "affiliateStore"] {
      _id,
      name,
      ownerClerkUserId
    }`);

    return NextResponse.json({ stores });
  } catch (e) {
    console.error("[all-stores GET]", e);
    return NextResponse.json({ error: "Error al cargar tiendas" }, { status: 500 });
  }
}
