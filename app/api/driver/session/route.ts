import { NextRequest, NextResponse } from "next/server";
import { requireDriver } from "@/lib/driver-auth";
import { connectDriverSession, disconnectDriverSession } from "@/lib/driver-actions";

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

  return NextResponse.json(
    { error: "Acción inválida. Usa 'connect' o 'disconnect'." },
    { status: 400 }
  );
}
