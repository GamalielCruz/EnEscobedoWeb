import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import {
  connectDriverSession,
  disconnectDriverSession,
  resumeReceivingNewOffers,
  stopReceivingNewOffers,
} from "@/lib/driver-actions";

export const dynamic = "force-dynamic";

const SESSION_OPTIONS: Record<number, number> = {
  60: 60,
  120: 120,
  240: 240,
  360: 360,
  480: 480,
};

export async function POST(request: NextRequest) {
  const auth = await requireDriver();
  if (!auth.ok) return auth.error;

  const { repartidor } = auth;
  const body = await request.json().catch(() => ({}));
  const { action, durationMinutes } = body ?? {};

  if (action === "connect") {
    // Duración opcional: sin durationMinutes se abre una sesión abierta
    // (sin disponibleHasta) que dura hasta desconexión manual.
    let minutes: number | undefined;
    if (durationMinutes != null && durationMinutes !== "") {
      const parsed = Number(durationMinutes);
      if (!SESSION_OPTIONS[parsed]) {
        return NextResponse.json(
          { error: "Duración inválida. Opciones: 60, 120, 240, 360, 480 minutos." },
          { status: 400 }
        );
      }
      minutes = parsed;
    }

    const result = await connectDriverSession(repartidor._id, minutes);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      connected: true,
      disponibleHasta: minutes
        ? new Date(Date.now() + minutes * 60 * 1000).toISOString()
        : null,
    });
  }

  if (action === "disconnect") {
    const result = await disconnectDriverSession(repartidor._id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({ connected: false });
  }

  // "Dejar de recibir pedidos": apaga la intención de recibir NUEVAS ofertas.
  // Con orden activa NO desconecta: el servicio continúa y al completar queda
  // offline. Sin orden activa equivale a desconectar ya.
  if (action === "stop_offers") {
    const result = await stopReceivingNewOffers(repartidor._id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      connected: result.newState !== "offline",
      acceptsNewOffers: false,
      inService: result.newState === "in_service",
    });
  }

  // "Seguir recibiendo pedidos": reactiva la intención de recibir NUEVAS
  // ofertas DURANTE un servicio activo (Hoja de ruta). Se puede alternar en
  // cualquier momento del viaje; nunca toca la orden en curso.
  if (action === "resume_offers") {
    const result = await resumeReceivingNewOffers(repartidor._id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 409 });
    }

    return NextResponse.json({
      connected: true,
      acceptsNewOffers: true,
      inService: result.newState === "in_service",
    });
  }

  return NextResponse.json(
    { error: "Acción inválida. Usa 'connect', 'disconnect', 'stop_offers' o 'resume_offers'." },
    { status: 400 }
  );
}
