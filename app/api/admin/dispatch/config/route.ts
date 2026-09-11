import { NextRequest, NextResponse } from "next/server";
import {
  getDispatchConfig,
  saveDispatchConfig,
  type DispatchConfig,
} from "@/lib/dispatch/dispatch-config";
import { requireAdmin } from "@/lib/dispatch/dispatch-core";
import { backendClient } from "@/sanity/lib/backendClient";

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const config = await getDispatchConfig();
  return NextResponse.json({ config }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  try {
    const body = (await request.json()) as Partial<DispatchConfig>;
    const current = await getDispatchConfig();
    const next = { ...current, ...body } as DispatchConfig;
    const saved = await saveDispatchConfig(next, admin.userId);
    await backendClient.create({
      _type: "dispatchAudit",
      action: "config",
      mode: saved.mode,
      actorUserId: admin.userId,
      actorName: "Operador admin",
      reason: "Cambio de configuración del Dispatch Center",
      details: `Modo: ${saved.mode}. Máx pedidos/repartidor: ${saved.maxOrdersPerDriver}. Escalar a los ${saved.maxWaitMinutesBeforeEscalate} min.`,
      createdAt: new Date().toISOString(),
    }).catch(() => null);
    return NextResponse.json({ success: true, config: saved });
  } catch (error) {
    console.error("[admin/dispatch/config]", error);
    return NextResponse.json({ error: "No se pudo guardar la configuración." }, { status: 500 });
  }
}
