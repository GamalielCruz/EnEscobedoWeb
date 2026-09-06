import { draftMode } from "next/headers";
import { NextResponse } from "next/server";
import { buildUrl } from "@/lib/urls";

export async function GET() {
    await (await draftMode()).disable();
    return NextResponse.redirect(buildUrl("/"));
}
