import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";

const MY_STORES_QUERY = `*[_type == "affiliateStore" && ownerClerkUserId == $userId] {
  _id,
  name,
  storeId
}`;

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ stores: [] });
    }
    const stores = await client.fetch<{ _id: string; name: string; storeId?: string }[]>(
      MY_STORES_QUERY,
      { userId }
    );
    return NextResponse.json({ stores: stores ?? [] });
  } catch (e) {
    console.error("[api/my-stores]", e);
    return NextResponse.json({ stores: [] });
  }
}
