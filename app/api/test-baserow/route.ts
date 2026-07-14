import { BaserowError, createBaserowRow } from "@/lib/baserow";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const row = await createBaserowRow({
      "Número de pedido": "TEST-001",
      "ID de orden": "test_baserow_001",
    });

    return NextResponse.json({ success: true, row });
  } catch (error) {
    if (error instanceof BaserowError) {
      console.error("[test-baserow POST] Respuesta de Baserow:", error.status, error.responseBody);
      return NextResponse.json({ error: "Baserow rechazó la solicitud" }, { status: error.status });
    }

    console.error("[test-baserow POST]", error);
    return NextResponse.json({ error: "Error al crear la fila de prueba" }, { status: 500 });
  }
}
