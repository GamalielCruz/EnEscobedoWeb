import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { writeClient } from "@/sanity/lib/client";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }

    // Convertir el archivo a buffer
    const buffer = await file.arrayBuffer();
    const blob = new Blob([buffer], { type: file.type });

    // Subir a Sanity
    const asset = await writeClient.assets.upload("image", blob, {
      filename: file.name,
    });

    return NextResponse.json({
      success: true,
      asset: {
        _type: "image",
        asset: {
          _type: "reference",
          _ref: asset._id,
        },
      },
    });
  } catch (e) {
    console.error("[dashboard/upload-image POST]", e);
    return NextResponse.json(
      { error: "Error al subir imagen" },
      { status: 500 }
    );
  }
}
