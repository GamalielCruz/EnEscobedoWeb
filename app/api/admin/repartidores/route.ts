import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { backendClient } from "@/sanity/lib/backendClient";
import { isAdminUser } from "@/lib/admin";

const REPARTIDORES_QUERY = `*[_type == "repartidor"] | order(nombre asc) {
  _id,
  nombre,
  telefono,
  activo,
  disponible,
  disponibleHasta,
  estadoDisponibilidad,
  "conectado": activo == true &&
    disponible == true &&
    (!defined(disponibleHasta) || disponibleHasta > now()),
  notas,
  "tiendaAsignada": tiendaAsignada->{
    _id,
    name,
    storeId
  }
}`;

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const repartidores = await backendClient.fetch(REPARTIDORES_QUERY, {});
    return NextResponse.json({ success: true, repartidores: repartidores ?? [] });
  } catch (error) {
    console.error("[admin/repartidores GET]", error);
    return NextResponse.json({ error: "Error al cargar repartidores" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    if (!isAdminUser(userId)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

    const body = await request.json();
    const { id, activo } = body;

    if (!id || typeof activo !== "boolean") {
      return NextResponse.json({ error: "id y activo son requeridos" }, { status: 400 });
    }

    await backendClient.patch(id).set({ activo }).commit();

    return NextResponse.json({ success: true, id, activo });
  } catch (error) {
    console.error("[admin/repartidores PATCH]", error);
    return NextResponse.json({ error: "Error al actualizar repartidor" }, { status: 500 });
  }
}
