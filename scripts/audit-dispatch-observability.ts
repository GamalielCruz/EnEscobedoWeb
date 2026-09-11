import dotenv from "dotenv";
import { createClient } from "@sanity/client";
import { normalizeDispatchConfig } from "../lib/dispatch/dispatch-config-values.ts";
import { buildDispatchObservabilitySnapshot, type ObservabilityDriver, type ObservabilityOrder } from "../lib/dispatch/dispatch-observability.ts";

const envFile = process.env.OBSERVABILITY_ENV_FILE;
if (envFile) dotenv.config({ path: envFile });

const projectId = process.env.SANITY_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const token = process.env.SANITY_API_READ_TOKEN || process.env.SANITY_API_TOKEN;
const dataset = process.env.OBSERVABILITY_DATASET || (process.env.VERCEL_ENV === "production" ? "production" : "test");

if (!projectId || !token) {
  throw new Error("Faltan SANITY_PROJECT_ID/NEXT_PUBLIC_SANITY_PROJECT_ID o un token de lectura.");
}

const client = createClient({ projectId, dataset, apiVersion: "2024-07-25", useCdn: false, token });

const driversQuery = `*[_type == "repartidor"]{
  _id,
  activo,
  bloqueado,
  disponible,
  disponibleDesde,
  disponibleHasta,
  estadoDisponibilidad,
  motivoDesconexion,
  ultimaActividad,
  "activeOrders": *[_type == "order" && repartidorAsignado._ref == ^._id && status == "shipped" && orderStatus != "delivered" && orderStatus != "cancelled" && orderStatus != "completed"]{
    _id, serviceKind, orderType, orderStatus, status, dispatchStatus, orderDate,
    repartidorAsignadoAt, deliveredAt, mandadoPickupAtDoor, mandadoEnRuta,
    mandadoOrigin, mandadoDestination, shippingAddress, orderEvents
  }
}`;

const ordersQuery = `*[_type == "order" && serviceKind == "mandado"]{
  _id, serviceKind, orderType, orderStatus, status, dispatchStatus, orderDate,
  repartidorAsignadoAt, deliveredAt, mandadoPickupAtDoor, mandadoEnRuta,
  mandadoOrigin, mandadoDestination, shippingAddress, "repartidorAsignadoRef": repartidorAsignado._ref,
  orderEvents
}`;

const waitingQuery = `*[_type == "order" && serviceKind == "mandado" && dispatchStatus == "waiting_for_driver" && !defined(repartidorAsignado) && !defined(offeredTo) && status != "cancelled" && status != "delivered" && status != "completed" && orderStatus != "cancelled" && orderStatus != "delivered" && orderStatus != "completed"]{
  _id, serviceKind, orderType, orderStatus, status, dispatchStatus, orderDate, orderEvents
}`;

const configQuery = `*[_type == "dispatchConfig" && _id == "dispatchConfig"][0]`;

const [rawDrivers, rawOrders, rawWaiting, rawConfig] = await Promise.all([
  client.fetch<ObservabilityDriver[]>(driversQuery),
  client.fetch<ObservabilityOrder[]>(ordersQuery),
  client.fetch<ObservabilityOrder[]>(waitingQuery),
  client.fetch(configQuery),
]);

const snapshot = buildDispatchObservabilitySnapshot({
  drivers: rawDrivers ?? [],
  orders: rawOrders ?? [],
  waitingMandadoOrders: rawWaiting ?? [],
  config: normalizeDispatchConfig(rawConfig),
});

console.log(JSON.stringify({
  dataset,
  config: {
    mode: normalizeDispatchConfig(rawConfig).mode,
    allowMultipleOrders: normalizeDispatchConfig(rawConfig).allowMultipleOrders,
    maxOrdersPerDriver: normalizeDispatchConfig(rawConfig).maxOrdersPerDriver,
  },
  metrics: {
    connectedDrivers: snapshot.connectedDrivers,
    availableDrivers: snapshot.availableDrivers,
    busyDrivers: snapshot.busyDrivers,
    offerPendingDrivers: snapshot.offerPendingDrivers,
    waitingOrders: snapshot.waitingOrders,
    activeOrders: snapshot.activeOrders,
    immediateCapacity: snapshot.immediateCapacity,
    oldestWaitingMinutes: snapshot.oldestWaitingMinutes,
    capacityState: snapshot.capacityState,
  },
  driverSessions: snapshot.driverSessions.map(({ state, sessionRemainingMinutes, immediateCapacity, activeOrderCount }) => ({
    state,
    sessionRemainingMinutes,
    immediateCapacity,
    activeOrderCount,
  })),
  orderStages: snapshot.orderStages.map(({ stage }) => ({ stage })),
  expectedRelease: snapshot.expectedRelease.map(({ stage, minMinutes, maxMinutes, confidence, reason }) => ({
    stage,
    minMinutes,
    maxMinutes,
    confidence,
    reason,
  })),
  eventQuality: {
    ...snapshot.eventQuality,
    diagnostics: snapshot.eventQuality.diagnostics,
  },
}, null, 2));