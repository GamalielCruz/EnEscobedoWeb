import { auth } from "@clerk/nextjs/server";
import { backendClient } from "@/sanity/lib/backendClient";
import { NextResponse } from "next/server";

type RepartidorDoc = {
  _id: string;
  nombre: string;
  telefono: string;
  activo: boolean;
  bloqueado: boolean;
  disponible: boolean;
  disponibleDesde?: string;
  disponibleHasta?: string;
  duracionDisponibilidadMinutos?: number;
  estadoDisponibilidad?: "available" | "offline" | "busy" | "offer_pending";
  esperandoSeleccionDisponibilidad?: boolean;
  extensionPendiente?: boolean;
  prioridad?: number;
  calificacion?: number;
  tiendaAsignada?: { _ref: string } | null;
  ultimaUbicacion?: { lat?: number; lng?: number; reportedAt?: string } | null;
};

const DRIVER_BY_CLERK_ID_QUERY = `*[_type == "repartidor" && clerkUserId == $userId && activo == true][0]{
  _id,
  nombre,
  telefono,
  activo,
  bloqueado,
  disponible,
  disponibleDesde,
  disponibleHasta,
  duracionDisponibilidadMinutos,
  estadoDisponibilidad,
  esperandoSeleccionDisponibilidad,
  extensionPendiente,
  prioridad,
  calificacion,
  "storeId": tiendaAsignada._ref,
  ultimaUbicacion
}`;

type RequireDriverResult =
  | { ok: true; userId: string; repartidor: RepartidorDoc }
  | { ok: false; error: NextResponse };

/**
 * Resolve the authenticated Clerk user to a Sanity repartidor document.
 * Returns 401 if not authenticated, 403 if not a registered driver.
 */
export async function requireDriver(): Promise<RequireDriverResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }

  const repartidor = await backendClient.fetch<RepartidorDoc>(
    DRIVER_BY_CLERK_ID_QUERY,
    { userId }
  );

  if (!repartidor) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "No eres un repartidor registrado en ElMenu" },
        { status: 403 }
      ),
    };
  }

  if (repartidor.bloqueado) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "Tu cuenta de repartidor está bloqueada" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, userId, repartidor };
}

export type { RepartidorDoc };
