"use client";

/**
 * Simulador de viaje del repartidor (SOLO desarrollo/staging).
 *
 * Todo vive en estado local del cliente: NO toca dispatch, Sanity, WhatsApp,
 * pagos ni el estado real del pedido. La posición simulada se entrega al
 * mismo consumidor que usa el GPS real (`currentLocation` en la página), por
 * lo que cámara, ruta, indicaciones, distancia y la barra inferior funcionan
 * idéntico a como lo harían con un GPS real.
 *
 * El movimiento NO interpola en línea recta: avanza por la geometría REAL de
 * `roadRoute.path` (la misma que dibuja la Polyline), interpolando suavemente
 * entre puntos consecutivos con requestAnimationFrame.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  haversineMeters,
  pathLengthMeters,
  pointAtDistance,
  routeTargets,
  type RoadRoute,
  type RoutePoint,
} from "@/lib/dispatch/routing";

export type DriveSimStage = "to_pickup" | "at_pickup" | "to_delivery" | "at_delivery" | "done";

export const SIM_SPEEDS = [1, 2, 5, 10] as const;

/** Velocidad base (m/s) a 1× — ≈ 58 km/h urbano. */
const SIM_BASE_METERS_PER_SECOND = 16;
/** Pausa al llegar a recolección/entrega antes de seguir (ms). */
const SIM_ARRIVAL_HOLD_MS = 2_600;
/** No actualizar la posición si se movió menos que esto (evita re-renders). */
const SIM_MIN_STEP_METERS = 0.6;

const STAGE_LABELS: Record<DriveSimStage, string> = {
  to_pickup: "Camino a recolección",
  at_pickup: "Llegada a recolección",
  to_delivery: "Camino a entrega",
  at_delivery: "Llegada a entrega",
  done: "Viaje completado",
};

export type UseDriveSimulatorParams = {
  /** Solo true fuera de producción (dev local o preview/staging). */
  enabled: boolean;
  /** Ubicación real del repartidor (origen del viaje simulado). */
  origin: RoutePoint | null;
  /** Coordenadas de recolección (store) y entrega (dest). */
  pickup: RoutePoint | null;
  delivery: RoutePoint | null;
  /** Ruta vial actual en manos de la página. */
  route: RoadRoute | null;
};

export function useDriveSimulator({
  enabled,
  origin,
  pickup,
  delivery,
  route,
}: UseDriveSimulatorParams) {
  const [stage, setStage] = useState<DriveSimStage>("to_pickup");
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(false);
  const [speed, setSpeed] = useState<(typeof SIM_SPEEDS)[number]>(5);
  const [simLocation, setSimLocation] = useState<RoutePoint | null>(null);

  const startOriginRef = useRef<RoutePoint | null>(null);
  const progressRef = useRef(0);
  const arrivalHandledRef = useRef(false);
  const lastEmittedPosRef = useRef<RoutePoint | null>(null);
  const rafRef = useRef<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs espejo para leer valores frescos dentro del loop de animación sin
  // re-suscribirlo en cada frame.
  const stageRef = useRef(stage);
  const runningRef = useRef(running);
  const speedRef = useRef(speed);
  const routeRef = useRef<RoadRoute | null>(route);
  const routeLengthRef = useRef<{ route: RoadRoute; total: number } | null>(null);

  useEffect(() => void (stageRef.current = stage), [stage]);
  useEffect(() => void (runningRef.current = running), [running]);
  useEffect(() => void (speedRef.current = speed), [speed]);
  useEffect(() => void (routeRef.current = route), [route]);

  const canStart = useMemo(
    () => enabled && !active && origin !== null && pickup !== null && delivery !== null,
    [enabled, active, origin, pickup, delivery]
  );

  const cancelAnimation = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  // Limpieza al desmontar.
  useEffect(() => cancelAnimation, [cancelAnimation]);

  const goToStage = useCallback((next: DriveSimStage, resetProgress: boolean) => {
    if (resetProgress) progressRef.current = 0;
    arrivalHandledRef.current = false;
    stageRef.current = next;
    setStage(next);
  }, []);

  const scheduleHold = useCallback(
    (next: DriveSimStage) => {
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current);
      holdTimerRef.current = setTimeout(() => {
        holdTimerRef.current = null;
        goToStage(next, true);
      }, SIM_ARRIVAL_HOLD_MS);
    },
    [goToStage]
  );

  /** Destino según la etapa actual (para saber si la ruta en mano corresponde). */
  const targetForStage = useCallback(
    (s: DriveSimStage): RoutePoint | null => {
      if (s === "to_pickup" || s === "at_pickup") return pickup;
      if (s === "to_delivery" || s === "at_delivery" || s === "done") return delivery;
      return null;
    },
    [pickup, delivery]
  );

  // Ruta que aplica a la etapa actual (puede estar cargando → null).
  const legRoute = useMemo(() => {
    if (!active) return null;
    const target = targetForStage(stageRef.current);
    if (!target) return null;
    return routeTargets(routeRef.current, target) ? routeRef.current : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stage, route, pickup, delivery]);

  // Loop de movimiento sobre la geometría REAL de la ruta (nunca línea recta).
  useEffect(() => {
    if (!enabled || !active || !running) return;
    if (stage !== "to_pickup" && stage !== "to_delivery") return;
    if (!legRoute || legRoute.path.length < 2) return;

    if (!routeLengthRef.current || routeLengthRef.current.route !== legRoute) {
      routeLengthRef.current = { route: legRoute, total: pathLengthMeters(legRoute.path) };
    }
    const total = routeLengthRef.current.total;
    if (total <= 0) return;

    let rafId = 0;
    let lastTs = 0;

    const step = (ts: number) => {
      rafId = requestAnimationFrame(step);
      if (lastTs === 0) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.25);
      lastTs = ts;

      if (!runningRef.current || !routeRef.current) return;

      progressRef.current = Math.min(
        total,
        progressRef.current + dt * SIM_BASE_METERS_PER_SECOND * speedRef.current
      );

      const next = pointAtDistance(routeRef.current.path, progressRef.current);
      const lastEmitted = lastEmittedPosRef.current;
      if (
        !lastEmitted ||
        haversineMeters(lastEmitted, next) >= SIM_MIN_STEP_METERS ||
        progressRef.current >= total
      ) {
        lastEmittedPosRef.current = next;
        setSimLocation(next);
      }

      if (progressRef.current >= total) {
        const s = stageRef.current;
        if (s === "to_pickup" && !arrivalHandledRef.current) {
          arrivalHandledRef.current = true;
          goToStage("at_pickup", false);
          scheduleHold("to_delivery");
        } else if (s === "to_delivery" && !arrivalHandledRef.current) {
          arrivalHandledRef.current = true;
          goToStage("at_delivery", false);
          scheduleHold("done");
          // Al llegar al destino final se congela la posición y se detiene.
          setRunning(false);
          runningRef.current = false;
        }
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [enabled, active, running, stage, legRoute, goToStage, scheduleHold]);

  const start = useCallback(() => {
    if (!canStart || !origin || !pickup || !delivery) return;
    cancelAnimation();
    startOriginRef.current = origin;
    progressRef.current = 0;
    arrivalHandledRef.current = false;
    lastEmittedPosRef.current = null;
    routeLengthRef.current = null;
    setActive(true);
    setSimLocation(origin);
    goToStage("to_pickup", true);
    setRunning(true);
  }, [canStart, origin, pickup, delivery, cancelAnimation, goToStage]);

  const pause = useCallback(() => {
    cancelAnimation();
    setRunning(false);
  }, [cancelAnimation]);

  const resume = useCallback(() => {
    if (!active) return;
    cancelAnimation();
    lastEmittedPosRef.current = null;
    setRunning(true);
  }, [active, cancelAnimation]);

  const restart = useCallback(() => {
    if (!active || !startOriginRef.current) return;
    cancelAnimation();
    progressRef.current = 0;
    arrivalHandledRef.current = false;
    lastEmittedPosRef.current = null;
    routeLengthRef.current = null;
    setSimLocation(startOriginRef.current);
    goToStage("to_pickup", true);
    setRunning(true);
  }, [active, cancelAnimation, goToStage]);

  const stop = useCallback(() => {
    cancelAnimation();
    progressRef.current = 0;
    arrivalHandledRef.current = false;
    lastEmittedPosRef.current = null;
    routeLengthRef.current = null;
    stageRef.current = "to_pickup";
    setStage("to_pickup");
    setActive(false);
    setRunning(false);
    setSimLocation(null);
  }, [cancelAnimation]);

  const stageLabel = STAGE_LABELS[stage];
  const finished = active && stage === "done";

  return {
    enabled,
    canStart,
    active,
    running,
    paused: active && !running && stage !== "done",
    finished,
    stage,
    stageLabel,
    speed,
    setSpeed,
    simLocation,
    /** true mientras se espera a que llegue la ruta de la etapa actual. */
    waitingForRoute:
      active &&
      (stage === "to_pickup" || stage === "to_delivery") &&
      !legRoute,
    start,
    pause,
    resume,
    restart,
    stop,
  };
}
