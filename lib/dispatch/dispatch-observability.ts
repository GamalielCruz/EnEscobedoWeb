import type { DispatchConfig } from "./dispatch-config.ts";
import { deriveDriverEstado, type DerivedDriverState } from "./driver-state.ts";
import {
  validateAssignment,
  type AssignmentDriverLike,
  type AssignmentOrderLike,
} from "./dispatch-validation.ts";

export type ObservabilityEvent = {
  type?: string;
  at?: string;
};

export type ObservabilityOrder = {
  _id: string;
  serviceKind?: string;
  orderType?: string;
  orderStatus?: string;
  status?: string;
  dispatchStatus?: string;
  orderDate?: string;
  repartidorAsignadoAt?: string;
  deliveredAt?: string;
  mandadoPickupAtDoor?: boolean;
  mandadoEnRuta?: boolean;
  mandadoOrigin?: { lat?: number; lng?: number };
  mandadoDestination?: { lat?: number; lng?: number };
  shippingAddress?: { latitude?: number; longitude?: number };
  repartidorAsignadoRef?: string | null;
  orderEvents?: ObservabilityEvent[];
};

export type ObservabilityDriver = AssignmentDriverLike & {
  _id: string;
  nombre?: string;
  motivoDesconexion?: string | null;
  disponibleDesde?: string;
  ultimaActividad?: string;
  activeOrders?: ObservabilityOrder[];
  ofertaExpiraAt?: string;
};

export type EtaConfidence = "high" | "medium" | "low";
export type OrderStage = "assigned" | "pickup_arrival" | "en_route" | "at_door" | "delivered" | "unknown";
export type DataGeneration = "legacy" | "modern" | "unknown";
export type EtaReason =
  | "driver_assigned"
  | "driver_at_pickup"
  | "driver_en_route"
  | "driver_at_door"
  | "historical_fallback"
  | "insufficient_stage_history"
  | "delivery_wait_extended"
  | "multiple_active_orders"
  | "session_risk";

export type EstimatedWait = {
  minMinutes: number;
  maxMinutes: number;
  confidence: EtaConfidence;
  reason: EtaReason;
  stage?: "assigned" | "pickup_arrival" | "en_route" | "destination_arrival";
  sampleSize?: number;
  driverId?: string;
};

export type EtaEngineConfig = {
  assignedFallback: { minMinutes: number; maxMinutes: number };
  pickupFallback: { minMinutes: number; maxMinutes: number };
  enRouteFallback: { minMinutes: number; maxMinutes: number };
  atDoorFallback: { minMinutes: number; maxMinutes: number };
  minimumOperationalMinutes: number;
  minimumSamplesForConfidence: number;
};

export const DEFAULT_ETA_ENGINE_CONFIG: EtaEngineConfig = {
  assignedFallback: { minMinutes: 12, maxMinutes: 25 },
  pickupFallback: { minMinutes: 12, maxMinutes: 30 },
  enRouteFallback: { minMinutes: 12, maxMinutes: 25 },
  atDoorFallback: { minMinutes: 3, maxMinutes: 12 },
  minimumOperationalMinutes: 1,
  minimumSamplesForConfidence: 30,
};

export type ExpectedReleaseCandidate = {
  driverId: string;
  stage: OrderStage;
  minMinutes: number;
  maxMinutes: number;
  confidence: EtaConfidence;
  reason: string;
  orderId: string;
};

export type StageDurationStats = {
  sampleSize: number;
  p50: number | null;
  p75: number | null;
  p90: number | null;
};

export type EventQualityReport = {
  totalMandados: number;
  ordersWithCompleteEvents: number;
  legacyOrders: number;
  modernOrders: number;
  modernCompleteOrders: number;
  modernIncompleteOrders: number;
  modernCancelledOrders: number;
  modernTerminalOrders: number;
  modernCompleteEventRate: number | null;
  modernEventCoverage: Record<"driver_assigned" | "picked_up" | "en_route" | "at_door" | "delivered", { present: number; total: number; percentage: number | null }>;
  unknownGenerationOrders: number;
  completeTransitions: Record<Transition, number>;
  missingEvents: Record<"assigned" | "picked_up" | "en_route" | "at_door" | "delivered", number>;
  anomalousValues: number;
  transitionQuality: Record<Transition, { valid: number; suspicious: number; invalid: number; missing: number; excluded: number }>;
  durations: Record<Transition, StageDurationStats>;
  sufficientSample: boolean;
  diagnostics: HistoricalOrderDiagnostic[];
};

export type HistoricalOrderDiagnostic = {
  sequence: number;
  dataGeneration: DataGeneration;
  classificationReason: "modern_flow_marker" | "legacy_pickup_marker" | "missing_modern_markers" | "missing_assignment" | "insufficient_evidence";
  complete: boolean;
  cancelled: boolean;
  orderDate?: string;
  repartidorAsignadoAt?: string;
  eventTimes: Partial<Record<"driver_assigned" | "picked_up" | "en_route" | "at_door" | "delivered", string[]>>;
  missingEvents: string[];
  duplicateEvents: string[];
  transitionDurations: Partial<Record<Transition, number>>;
  transitionClassifications: Partial<Record<Transition, "VALID" | "SUSPICIOUS" | "INVALID" | "INSUFFICIENT_SAMPLE">>;
};

export type DispatchObservabilitySnapshot = {
  generatedAt: string;
  connectedDrivers: number;
  availableDrivers: number;
  busyDrivers: number;
  offerPendingDrivers: number;
  waitingOrders: number;
  activeOrders: number;
  immediateCapacity: number;
  oldestWaitingMinutes: number | null;
  capacityState: "HEALTHY" | "LIMITED" | "SATURATED" | "CLOSED";
  driverSessions: Array<{ driverId: string; state: DerivedDriverState; sessionRemainingMinutes: number | null; immediateCapacity: number; activeOrderCount: number }>;
  expectedRelease: ExpectedReleaseCandidate[];
  orderStages: Array<{ orderId: string; driverId: string | null; stage: OrderStage }>;
  eventQuality: EventQualityReport;
};

type Transition = "assignment_to_pickup_arrival" | "pickup_arrival_to_en_route" | "en_route_to_destination_arrival" | "destination_arrival_to_delivered";
const REQUIRED_EVENTS = ["driver_assigned", "picked_up", "en_route", "at_door", "delivered"] as const;
const TRANSITIONS: Array<[Transition, [number, number]]> = [
  ["assignment_to_pickup_arrival", [0, 1]],
  ["pickup_arrival_to_en_route", [1, 2]],
  ["en_route_to_destination_arrival", [2, 3]],
  ["destination_arrival_to_delivered", [3, 4]],
];

function eventTimes(order: ObservabilityOrder, type: string): number[] {
  return (order.orderEvents ?? [])
    .filter((candidate) => candidate.type === type && candidate.at)
    .map((candidate) => new Date(candidate.at as string).getTime())
    .filter(Number.isFinite);
}

function eventAt(order: ObservabilityOrder, type: string): number | null {
  return eventTimes(order, type)[0] ?? null;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)] * 10) / 10;
}

function buildStats(values: number[]): StageDurationStats {
  return {
    sampleSize: values.length,
    p50: percentile(values, 50),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
  };
}

function tukeyUpperFence(values: number[]): number | null {
  if (values.length < 4) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const medianOf = (items: number[]) => {
    const middle = Math.floor(items.length / 2);
    return items.length % 2 === 0 ? (items[middle - 1] + items[middle]) / 2 : items[middle];
  };
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted.slice(0, middle);
  const upper = sorted.slice(sorted.length % 2 === 0 ? middle : middle + 1);
  return medianOf(upper) + 1.5 * (medianOf(upper) - medianOf(lower));
}

export function analyzeMandadoEventQuality(orders: ObservabilityOrder[]): EventQualityReport {
  const completeTransitions = {
    assignment_to_pickup_arrival: 0,
    pickup_arrival_to_en_route: 0,
    en_route_to_destination_arrival: 0,
    destination_arrival_to_delivered: 0,
  } satisfies Record<Transition, number>;
  const missingEvents = {
    assigned: 0,
    picked_up: 0,
    en_route: 0,
    at_door: 0,
    delivered: 0,
  } satisfies EventQualityReport["missingEvents"];
  const transitionDurations: Record<Transition, number[]> = {
    assignment_to_pickup_arrival: [],
    pickup_arrival_to_en_route: [],
    en_route_to_destination_arrival: [],
    destination_arrival_to_delivered: [],
  };
  const rawTransitionDurations: Record<Transition, number[]> = {
    assignment_to_pickup_arrival: [],
    pickup_arrival_to_en_route: [],
    en_route_to_destination_arrival: [],
    destination_arrival_to_delivered: [],
  };
  const transitionQuality = {
    assignment_to_pickup_arrival: { valid: 0, suspicious: 0, invalid: 0, missing: 0, excluded: 0 },
    pickup_arrival_to_en_route: { valid: 0, suspicious: 0, invalid: 0, missing: 0, excluded: 0 },
    en_route_to_destination_arrival: { valid: 0, suspicious: 0, invalid: 0, missing: 0, excluded: 0 },
    destination_arrival_to_delivered: { valid: 0, suspicious: 0, invalid: 0, missing: 0, excluded: 0 },
  } satisfies EventQualityReport["transitionQuality"];
  const diagnostics: HistoricalOrderDiagnostic[] = [];
  let anomalousValues = 0;
  let ordersWithCompleteEvents = 0;
  let legacyOrders = 0;
  let modernOrders = 0;
  let unknownGenerationOrders = 0;
  let modernCompleteOrders = 0;
  let modernIncompleteOrders = 0;
  let modernCancelledOrders = 0;
  let modernTerminalOrders = 0;
  const modernEventCoverage = Object.fromEntries(REQUIRED_EVENTS.map((type) => [type, { present: 0, total: 0, percentage: null }])) as EventQualityReport["modernEventCoverage"];

  for (const [sequence, order] of orders.entries()) {
    const eventLists = REQUIRED_EVENTS.map((type) => eventTimes(order, type));
    const timestamps = eventLists.map((times) => times[0] ?? null);
    const complete = timestamps.every((timestamp) => timestamp !== null);
    if (complete) ordersWithCompleteEvents += 1;
    const dataGeneration: DataGeneration = order.mandadoPickupAtDoor === true && order.mandadoEnRuta == null
      ? "legacy"
      : order.mandadoEnRuta !== undefined && order.mandadoEnRuta !== null
        ? "modern"
        : "unknown";
    const classificationReason = dataGeneration === "modern"
      ? "modern_flow_marker"
      : dataGeneration === "legacy"
        ? "legacy_pickup_marker"
        : timestamps[0] === null
          ? "missing_assignment"
          : timestamps[1] === null && timestamps[2] === null
            ? "missing_modern_markers"
            : "insufficient_evidence";
    if (dataGeneration === "legacy") legacyOrders += 1;
    if (dataGeneration === "modern") modernOrders += 1;
    if (dataGeneration === "unknown") unknownGenerationOrders += 1;
    const cancelled = order.status === "cancelled" || order.orderStatus === "cancelled";
    const terminal = cancelled || ["delivered", "completed", "refunded"].includes(order.status ?? "") || ["delivered", "completed", "cancelled"].includes(order.orderStatus ?? "");
    if (dataGeneration === "modern") {
      if (terminal) modernTerminalOrders += 1;
      if (cancelled) modernCancelledOrders += 1;
      if (complete && terminal) modernCompleteOrders += 1;
      if (!complete) modernIncompleteOrders += 1;
      REQUIRED_EVENTS.forEach((type, index) => {
        modernEventCoverage[type].total += 1;
        if (eventLists[index].length > 0) modernEventCoverage[type].present += 1;
      });
    }
    const diagnostic: HistoricalOrderDiagnostic = {
      sequence: sequence + 1,
      dataGeneration,
      classificationReason,
      complete,
      cancelled,
        orderDate: order.orderDate,
        repartidorAsignadoAt: order.repartidorAsignadoAt,
        eventTimes: Object.fromEntries(REQUIRED_EVENTS.map((type, index) => [type, eventLists[index].map((timestamp) => new Date(timestamp).toISOString())])),
      missingEvents: [],
      duplicateEvents: REQUIRED_EVENTS.filter((_, index) => eventLists[index].length > 1),
      transitionDurations: {},
      transitionClassifications: {},
    };

    timestamps.forEach((timestamp, index) => {
      if (timestamp === null) {
        const missingKey = REQUIRED_EVENTS[index] === "driver_assigned" ? "assigned" : REQUIRED_EVENTS[index] as keyof typeof missingEvents;
        missingEvents[missingKey] += 1;
        diagnostic.missingEvents.push(missingKey);
      }
    });

    for (const [transition, indexes] of TRANSITIONS) {
      const start = timestamps[indexes[0]];
      const end = timestamps[indexes[1]];
      if (dataGeneration !== "modern") {
        transitionQuality[transition].excluded += 1;
        diagnostic.transitionClassifications[transition] = "INSUFFICIENT_SAMPLE";
        continue;
      }
      if (start === null || end === null) {
        transitionQuality[transition].missing += 1;
        diagnostic.transitionClassifications[transition] = "INSUFFICIENT_SAMPLE";
        continue;
      }
      const minutes = (end - start) / 60000;
      diagnostic.transitionDurations[transition] = Math.round(minutes * 10) / 10;
      const sequenceOutOfOrder = timestamps.some((timestamp, index) => index > 0 && timestamp !== null && timestamps[index - 1] !== null && timestamp < (timestamps[index - 1] as number));
      if (minutes < 0 || cancelled || sequenceOutOfOrder) {
        anomalousValues += 1;
        transitionQuality[transition].invalid += 1;
        diagnostic.transitionClassifications[transition] = "INVALID";
        continue;
      }
      rawTransitionDurations[transition].push(minutes);
      if (diagnostic.duplicateEvents.length > 0) {
        transitionQuality[transition].suspicious += 1;
        diagnostic.transitionClassifications[transition] = "SUSPICIOUS";
      }
    }
    diagnostics.push(diagnostic);
  }

  for (const [transition] of TRANSITIONS) {
    const upperFence = tukeyUpperFence(rawTransitionDurations[transition]);
    for (const diagnostic of diagnostics) {
      const value = diagnostic.transitionDurations[transition];
      if (diagnostic.dataGeneration !== "modern" || value === undefined || diagnostic.transitionClassifications[transition] === "INVALID" || diagnostic.transitionClassifications[transition] === "SUSPICIOUS") continue;
      if (upperFence !== null && value > upperFence) {
        transitionQuality[transition].suspicious += 1;
        diagnostic.transitionClassifications[transition] = "SUSPICIOUS";
      } else {
        transitionQuality[transition].valid += 1;
        completeTransitions[transition] += 1;
        transitionDurations[transition].push(value);
        diagnostic.transitionClassifications[transition] = "VALID";
      }
    }
  }

  const durations = {
    assignment_to_pickup_arrival: buildStats(transitionDurations.assignment_to_pickup_arrival),
    pickup_arrival_to_en_route: buildStats(transitionDurations.pickup_arrival_to_en_route),
    en_route_to_destination_arrival: buildStats(transitionDurations.en_route_to_destination_arrival),
    destination_arrival_to_delivered: buildStats(transitionDurations.destination_arrival_to_delivered),
  };
  for (const type of REQUIRED_EVENTS) {
    const coverage = modernEventCoverage[type];
    coverage.percentage = coverage.total === 0 ? null : Math.round((coverage.present / coverage.total) * 1000) / 10;
  }

  return {
    totalMandados: orders.length,
    ordersWithCompleteEvents,
    legacyOrders,
    modernOrders,
    modernCompleteOrders,
    modernIncompleteOrders,
    modernCancelledOrders,
    modernTerminalOrders,
    modernCompleteEventRate: modernTerminalOrders === 0 ? null : Math.round((modernCompleteOrders / modernTerminalOrders) * 1000) / 10,
    modernEventCoverage,
    unknownGenerationOrders,
    completeTransitions,
    missingEvents,
    anomalousValues,
    transitionQuality,
    durations,
    sufficientSample: Object.values(durations).every((stats) => stats.sampleSize >= 30),
    diagnostics,
  };
}

export function getOrderStage(order: ObservabilityOrder): OrderStage {
  if (order.dispatchStatus === "completed" || order.status === "delivered" || order.orderStatus === "delivered") return "delivered";
  if (order.dispatchStatus === "at_door") return "at_door";
  if (order.mandadoEnRuta === true) return "en_route";
  if (order.mandadoPickupAtDoor === true) return "pickup_arrival";
  if (order.dispatchStatus === "accepted" || order.repartidorAsignadoRef) return "assigned";
  return "unknown";
}

function estimateCandidate(driverId: string, order: ObservabilityOrder, stats: EventQualityReport, now: number): ExpectedReleaseCandidate | null {
  const estimate = estimateDriverRelease({
    driver: { _id: driverId, activeOrders: [order] },
    activeOrders: [order],
    historicalDurations: stats.durations,
    now,
  });
  if (!estimate || !estimate.stage) return null;
  return { ...estimate, stage: estimate.stage === "destination_arrival" ? "at_door" : estimate.stage, orderId: order._id, driverId };
}

function isActiveOrder(order: ObservabilityOrder): boolean {
  return order.status === "shipped" && !["delivered", "cancelled", "completed"].includes(order.orderStatus ?? "");
}

function isConnected(driver: ObservabilityDriver, now: number): boolean {
  return Boolean(driver.activo && !driver.bloqueado && driver.disponible && driver.disponibleHasta && new Date(driver.disponibleHasta).getTime() > now);
}

function mandadoAssignment(): AssignmentOrderLike {
  return { _id: "observability-mandado", orderType: "delivery", orderStatus: "pending", driverId: null, storeId: null, storeHasOwnDelivery: false, serviceKind: "mandado" };
}

function immediateCapacityFor(driver: ObservabilityDriver, config: DispatchConfig, now: number): number {
  if (!isConnected(driver, now)) return 0;
  const error = validateAssignment(mandadoAssignment(), driver, config, "manual", now);
  return error === null ? 1 : 0;
}

function capacityState(immediateCapacity: number, waitingOrders: number, oldestWaitingMinutes: number | null, expectedRelease: ExpectedReleaseCandidate[]): DispatchObservabilitySnapshot["capacityState"] {
  if (immediateCapacity > 0 && waitingOrders <= 3) return "HEALTHY";
  if (immediateCapacity > 0) return "LIMITED";
  const release = expectedRelease.length > 0 ? Math.min(...expectedRelease.map((candidate) => candidate.maxMinutes)) : null;
  if (release !== null && release <= 30 && (oldestWaitingMinutes === null || oldestWaitingMinutes <= 30)) return "SATURATED";
  return "CLOSED";
}

export function buildDispatchObservabilitySnapshot(input: {
  drivers: ObservabilityDriver[];
  orders: ObservabilityOrder[];
  waitingMandadoOrders: ObservabilityOrder[];
  config: DispatchConfig;
  now?: number;
}): DispatchObservabilitySnapshot {
  const now = input.now ?? Date.now();
  const activeOrders = input.orders.filter(isActiveOrder);
  const mandados = input.orders.filter((order) => order.serviceKind === "mandado");
  const eventQuality = analyzeMandadoEventQuality(mandados);
  const expectedRelease = input.drivers.flatMap((driver) => (driver.activeOrders ?? [])
    .filter(isActiveOrder)
    .map((order) => estimateCandidate(driver._id, order, eventQuality, now))
    .filter((candidate): candidate is ExpectedReleaseCandidate => candidate !== null));
  const waitingOrders = input.waitingMandadoOrders.length;
  const oldestWaitingMinutes = waitingOrders === 0
    ? null
    : Math.max(0, Math.round(Math.min(...input.waitingMandadoOrders.map((order) => new Date(order.orderDate ?? now).getTime())) < now
      ? (now - Math.min(...input.waitingMandadoOrders.map((order) => new Date(order.orderDate ?? now).getTime()))) / 60000
      : 0));
  const driverSessions = input.drivers.map((driver) => {
    const sessionEnd = driver.disponibleHasta ? new Date(driver.disponibleHasta).getTime() : NaN;
    return {
      driverId: driver._id,
      state: deriveDriverEstado(driver),
      sessionRemainingMinutes: Number.isFinite(sessionEnd) ? Math.round(Math.max(0, (sessionEnd - now) / 60000) * 10) / 10 : null,
      immediateCapacity: immediateCapacityFor(driver, input.config, now),
      activeOrderCount: (driver.activeOrders ?? []).filter(isActiveOrder).length,
    };
  });
  const releaseCandidates = expectedRelease.filter((candidate) => candidate.driverId);
  return {
    generatedAt: new Date(now).toISOString(),
    connectedDrivers: input.drivers.filter((driver) => isConnected(driver, now)).length,
    availableDrivers: driverSessions.filter((session) => session.state === "available" && session.immediateCapacity > 0).length,
    busyDrivers: driverSessions.filter((session) => session.state === "busy").length,
    offerPendingDrivers: driverSessions.filter((session) => session.state === "offer_pending").length,
    waitingOrders,
    activeOrders: activeOrders.length,
    immediateCapacity: driverSessions.reduce((sum, session) => sum + session.immediateCapacity, 0),
    oldestWaitingMinutes,
    capacityState: capacityState(driverSessions.reduce((sum, session) => sum + session.immediateCapacity, 0), waitingOrders, oldestWaitingMinutes, releaseCandidates),
    driverSessions,
    expectedRelease: releaseCandidates,
    orderStages: activeOrders.map((order) => ({ orderId: order._id, driverId: order.repartidorAsignadoRef ?? null, stage: getOrderStage(order) })),
    eventQuality,
  };
}

function elapsedSince(order: ObservabilityOrder, eventType: string, now: number): number {
  const startedAt = eventAt(order, eventType);
  return startedAt === null ? 0 : Math.max(0, (now - startedAt) / 60000);
}

function rangeFromStats(stats: StageDurationStats, elapsed: number, minimumOperationalMinutes: number) {
  if (stats.p50 === null || stats.p75 === null) return null;
  const minMinutes = Math.max(minimumOperationalMinutes, Math.ceil(stats.p50 - elapsed));
  const maxMinutes = Math.max(minMinutes, Math.ceil(stats.p75 - elapsed));
  const exceedsP90 = stats.p90 !== null && elapsed > stats.p90;
  return { minMinutes, maxMinutes, exceedsP90 };
}

function combineRanges(first: { minMinutes: number; maxMinutes: number }, second: { minMinutes: number; maxMinutes: number }) {
  return {
    minMinutes: first.minMinutes + second.minMinutes,
    maxMinutes: first.maxMinutes + second.maxMinutes,
  };
}

function stageStatsFor(
  historicalDurations: Record<Transition, StageDurationStats>,
  transition: Transition,
  config: EtaEngineConfig,
  fallback: { minMinutes: number; maxMinutes: number },
) {
  const stats = historicalDurations[transition];
  return { stats, fallback, enoughForConfidence: stats.sampleSize >= config.minimumSamplesForConfidence };
}

export function estimateWait(input: {
  driver?: ObservabilityDriver;
  activeOrders: ObservabilityOrder[];
  historicalDurations: Record<Transition, StageDurationStats>;
  now?: number;
  dispatchConfig?: DispatchConfig;
  etaConfig?: EtaEngineConfig;
}): EstimatedWait | null {
  const now = input.now ?? Date.now();
  const config = input.etaConfig ?? DEFAULT_ETA_ENGINE_CONFIG;
  const activeOrders = input.activeOrders.filter(isActiveOrder);
  if (activeOrders.length === 0) return null;

  const primaryOrder = activeOrders[0];
  const stage = getOrderStage(primaryOrder);
  if (stage === "delivered" || stage === "unknown") return null;

  const sessionEnd = input.driver?.disponibleHasta ? new Date(input.driver.disponibleHasta).getTime() : NaN;
  const sessionRemainingMinutes = Number.isFinite(sessionEnd) ? Math.max(0, (sessionEnd - now) / 60000) : null;
  const multipleOrders = activeOrders.length > 1;
  const sessionRisk = sessionRemainingMinutes !== null;

  const fallbackResult = (fallback: { minMinutes: number; maxMinutes: number }, reason: EtaReason, sampleSize = 0): EstimatedWait => ({
    ...fallback,
    confidence: "low",
    reason,
    stage: stage === "at_door" ? "destination_arrival" : stage,
    sampleSize,
    driverId: input.driver?._id,
  });

  let result: EstimatedWait;
  if (stage === "assigned") {
    const current = stageStatsFor(input.historicalDurations, "assignment_to_pickup_arrival", config, config.assignedFallback);
    const range = rangeFromStats(current.stats, elapsedSince(primaryOrder, "driver_assigned", now), config.minimumOperationalMinutes);
    result = range === null || (current.stats.p90 !== null && elapsedSince(primaryOrder, "driver_assigned", now) > current.stats.p90)
      ? fallbackResult(current.fallback, "insufficient_stage_history", current.stats.sampleSize)
      : { ...range, confidence: current.enoughForConfidence ? "medium" : "low", reason: "driver_assigned", stage, sampleSize: current.stats.sampleSize, driverId: input.driver?._id };
  } else if (stage === "pickup_arrival") {
    const pickup = stageStatsFor(input.historicalDurations, "pickup_arrival_to_en_route", config, config.pickupFallback);
    const route = stageStatsFor(input.historicalDurations, "en_route_to_destination_arrival", config, config.enRouteFallback);
    const pickupRange = rangeFromStats(pickup.stats, elapsedSince(primaryOrder, "picked_up", now), config.minimumOperationalMinutes);
    const routeRange = route.stats.p50 === null || route.stats.p75 === null ? route.fallback : {
      minMinutes: Math.max(config.minimumOperationalMinutes, Math.ceil(route.stats.p50)),
      maxMinutes: Math.max(config.minimumOperationalMinutes, Math.ceil(route.stats.p75)),
    };
    result = pickupRange === null
      ? fallbackResult(combineRanges(config.pickupFallback, routeRange), "insufficient_stage_history", Math.min(pickup.stats.sampleSize, route.stats.sampleSize))
      : { ...combineRanges(pickupRange, routeRange), confidence: pickup.enoughForConfidence && route.enoughForConfidence ? "medium" : "low", reason: "driver_at_pickup", stage, sampleSize: Math.min(pickup.stats.sampleSize, route.stats.sampleSize), driverId: input.driver?._id };
  } else if (stage === "en_route") {
    const current = stageStatsFor(input.historicalDurations, "en_route_to_destination_arrival", config, config.enRouteFallback);
    const range = rangeFromStats(current.stats, elapsedSince(primaryOrder, "en_route", now), config.minimumOperationalMinutes);
    result = range === null
      ? fallbackResult(current.fallback, "insufficient_stage_history", current.stats.sampleSize)
      : { ...range, confidence: current.enoughForConfidence ? "medium" : "low", reason: "driver_en_route", stage, sampleSize: current.stats.sampleSize, driverId: input.driver?._id };
    if (range?.exceedsP90) result = { ...result, confidence: "low", reason: "insufficient_stage_history" };
  } else {
    const current = stageStatsFor(input.historicalDurations, "destination_arrival_to_delivered", config, config.atDoorFallback);
    const range = rangeFromStats(current.stats, elapsedSince(primaryOrder, "at_door", now), config.minimumOperationalMinutes);
    result = range === null
      ? fallbackResult(current.fallback, "insufficient_stage_history", current.stats.sampleSize)
      : { ...range, confidence: current.enoughForConfidence ? "medium" : "low", reason: "driver_at_door", stage: "destination_arrival", sampleSize: current.stats.sampleSize, driverId: input.driver?._id };
    if (range?.exceedsP90) result = { ...result, confidence: "low", reason: "delivery_wait_extended" };
  }

  if (multipleOrders) return { ...result, confidence: "low", reason: "multiple_active_orders" };
  if (sessionRisk && sessionRemainingMinutes! < result.maxMinutes) return { ...result, confidence: "low", reason: "session_risk" };
  return result;
}

export function estimateDriverRelease(input: Parameters<typeof estimateWait>[0]): EstimatedWait | null {
  return estimateWait(input);
}

export function estimateNextAvailableDriver(inputs: Array<Parameters<typeof estimateWait>[0]>): EstimatedWait | null {
  return inputs
    .map((input) => estimateDriverRelease(input))
    .filter((estimate): estimate is EstimatedWait => estimate !== null)
    .sort((a, b) => ((a.minMinutes + a.maxMinutes) / 2) - ((b.minMinutes + b.maxMinutes) / 2))[0] ?? null;
}

export function toPublicEstimatedWait(estimate: { minMinutes: number; maxMinutes: number; confidence: EtaConfidence } | null): { minMinutes: number; maxMinutes: number } | null {
  if (!estimate || (estimate.confidence !== "medium" && estimate.confidence !== "high")) return null;
  return { minMinutes: estimate.minMinutes, maxMinutes: estimate.maxMinutes };
}