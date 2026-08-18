import { NextResponse } from "next/server";
import { backendClient } from "@/sanity/lib/backendClient";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────────────
// Query: obtiene repartidores comunitarios con sus pedidos activos.
// MISMA lógica que DRIVERS_QUERY en lib/dispatch/dispatch-core.ts,
// filtrada para repartidores comunitarios (sin tienda asignada).
// ────────────────────────────────────────────────────────────────────

type RawDriver = {
  _id: string;
  nombre: string;
  activo: boolean;
  bloqueado: boolean;
  disponible: boolean;
  disponibleDesde?: string;
  disponibleHasta?: string;
  estadoDisponibilidad?: "available" | "offline" | "busy" | "offer_pending";
  motivoDesconexion?: string;
  activeOrders?: Array<{ _id: string }>;
};

const COMMUNITY_DRIVERS_AVAILABILITY_QUERY = `*[
  _type == "repartidor" &&
  activo == true &&
  !bloqueado
] | order(prioridad desc, nombre asc){
  _id,
  nombre,
  disponible,
  disponibleDesde,
  disponibleHasta,
  estadoDisponibilidad,
  motivoDesconexion,
  "activeOrders": *[
    _type == "order" &&
    repartidorAsignado._ref == ^._id &&
    status == "shipped" &&
    orderStatus != "delivered" &&
    orderStatus != "cancelled" &&
    orderStatus != "completed"
  ]{ _id }
}`;

// ────────────────────────────────────────────────────────────────────
// Derivación de estado (MISMA lógica que deriveDriverEstado en
// lib/dispatch/dispatch-core.ts — fuente de verdad).
// ────────────────────────────────────────────────────────────────────

function deriveDriverEstado(driver: RawDriver): string {
  const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
  if (driver.bloqueado) return "blocked";
  if (driver.motivoDesconexion === "admin_paused") return "paused";
  if (driver.estadoDisponibilidad === "busy" || activeCount > 0) return "busy";
  if (driver.estadoDisponibilidad === "offer_pending") return "offer_pending";
  if (driver.estadoDisponibilidad === "available" && driver.disponible) return "available";
  return "offline";
}

// ────────────────────────────────────────────────────────────────────
// Candidato elegible (MISMA lógica que isDriverCandidateAvailable en
// lib/dispatch/dispatch-core.ts — fuente de verdad).
// Un repartidor puede recibir un mandado nuevo si:
//  1. tiene sesión activa (disponible === true)
//  2. estado === "available"
//  3. su sesión no expiró (disponibleHasta > now)
// ────────────────────────────────────────────────────────────────────

function isDriverCandidateAvailable(driver: RawDriver, now: number): boolean {
  if (!driver.disponible) return false;
  if (driver.estadoDisponibilidad !== "available") return false;
  if (driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() <= now) return false;
  return true;
}

export type MandadoAvailabilityResponse = {
  availableCount: number;
  busyCount: number;
  activeCount: number;
  connectedCount: number;
  estimatedWaitMinutes: null; // No hay fuente confiable para ETA de mandados
  lastUpdatedAt: string;
};

export async function GET() {
  try {
    const now = Date.now();
    const rawDrivers = await backendClient.fetch<RawDriver[]>(COMMUNITY_DRIVERS_AVAILABILITY_QUERY);

    const drivers = rawDrivers ?? [];

    // Clasificar cada repartidor usando la misma lógica que Dispatch Center
    const classified = drivers.map((driver: RawDriver) => ({
      estado: deriveDriverEstado(driver),
      isCandidate: isDriverCandidateAvailable(driver, now),
      hasActiveOrders: Array.isArray(driver.activeOrders) ? driver.activeOrders.length > 0 : false,
    }));

    // Contar por categoría
    const availableCount = classified.filter((d) => d.isCandidate).length;
    const busyCount = classified.filter(
      (d) => d.estado === "busy" || d.estado === "offer_pending"
    ).length;
    const activeCount = classified.filter(
      (d) => d.estado !== "offline" && d.estado !== "blocked" && d.estado !== "paused"
    ).length;
    const connectedCount = classified.filter(
      (d) =>
        d.estado === "available" ||
        d.estado === "busy" ||
        d.estado === "offer_pending"
    ).length;

    const response: MandadoAvailabilityResponse = {
      availableCount,
      busyCount,
      activeCount,
      connectedCount,
      // No hay fuente confiable para ETA de mandados ocupados.
      // El Dispatch Center no calcula tiempo restante de entregas activas.
      estimatedWaitMinutes: null,
      lastUpdatedAt: new Date(now).toISOString(),
    };

    return NextResponse.json(response, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[mandado/availability] error:", error);
    return NextResponse.json(
      { error: "No pudimos consultar la disponibilidad de repartidores." },
      { status: 500 }
    );
  }
}
