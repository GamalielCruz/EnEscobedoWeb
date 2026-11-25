export type DerivedDriverState = "available" | "offline" | "busy" | "offer_pending" | "paused" | "blocked";

export type DriverStateInput = {
  bloqueado?: boolean | null;
  motivoDesconexion?: string | null;
  estadoDisponibilidad?: string | null;
  disponible?: boolean | null;
  activeOrders?: unknown[] | null;
};

export function deriveDriverEstado(driver: DriverStateInput): DerivedDriverState {
  const activeCount = Array.isArray(driver.activeOrders) ? driver.activeOrders.length : 0;
  if (driver.bloqueado) return "blocked";
  if (driver.motivoDesconexion === "admin_paused") return "paused";
  if (driver.estadoDisponibilidad === "busy" || activeCount > 0) return "busy";
  if (driver.estadoDisponibilidad === "offer_pending") return "offer_pending";
  if (driver.estadoDisponibilidad === "available" && driver.disponible) return "available";
  return "offline";
}