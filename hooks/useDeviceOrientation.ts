"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Orientación física del dispositivo (brújula) para uso en navegación GPS.
 *
 * Distinción clave:
 *  - deviceHeading = hacia donde apunta FÍSICAMENTE el teléfono (brújula).
 *  - gpsHeading/course = hacia donde se desplaza el VEHÍCULO (GPS motion).
 *
 * Esta hook solo expone heading del dispositivo; la fusión GPS+brújula se
 * hace en la página (navigationHeading()). Así se puede actualizar la lógica
 * de fusión sin tocar esta capa de sensores.
 *
 * Compatibilidad:
 *  - iOS Safari / PWA: usa DeviceOrientationEvent (alpha) corregido por
 *    screen orientation; requiere permiso explícito en iOS 13+.
 *  - Android Chrome: normalmente no requiere permiso, DeviceOrientationEvent
 *    disponible con true heading cuando hay magnetazo calibrado, falla a alpha.
 *  - Desktop / sin sensores: heading=nulo, navegación continúa con GPS.
 *
 * Coordenadas normalizadas: 0° = Norte, 90° = Este, 180° = Sur, 270° = Oeste.
 */

export type SensorAvailability = "unavailable" | "available" | "permission_required";

export type PermissionState = "unknown" | "prompt" | "granted" | "denied";

export type DeviceHeadingRecord = {
  /** Heading normalizado [0,360). */
  heading: number;
  /** Calidad estimada (0..1). */
  confidence: number;
  /** Estado del permiso en iOS. */
  permission: PermissionState;
  /** Disponibilidad del sensor. */
  available: SensorAvailability;
};

const SKIP_DEG = 2.5; // anti-jitter: ignorar variaciones menores
const MAX_RATE_DEG_PER_SEC = 120; // filtro de velocidad angular máxima razonable

function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function shortestAngleDelta(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

/** True heading (magnetazo calibrado) o null cuando no está disponible. */
function trueHeadingFromEvent(event: DeviceOrientationEvent | null): number | null {
  if (!event) return null;
  // iOS Safari a veces expone webkitCompassHeading (true heading calibrado).
  // Precedence: webkitCompassHeading > absolute true heading > alpha.
  // Usamos construcción anulable para evitar error de tipo en TS.
  const raw = (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof raw === "number" && isFinite(raw)) {
    return raw;
  }
  // Evento absoluto: alpha representa rotación respecto al norte magnético
  // cuando el dispositivo está en orientation portrait natural (cámara arriba).
  // Hay que corregir por screen orientation (ver uso en hook).
  if (event.absolute && typeof event.alpha === "number" && isFinite(event.alpha)) {
    return event.alpha;
  }
  return null;
}

/**
 * Corrección de alpha por screen orientation (portrait natural = referencia).
 *
 * En iOS, DeviceOrientationEvent.alpha mide la rotación del dispositivo
 * respecto al norte MAGNÉTICO con la pantalla en su orientación "natural"
 * (habitualmente portrait con cámara arriba). Cuando el usuario rota la
 * pantalla (o el navegador la rota internamente), el valor base cambia y hay
 * que compensar.
 *
 * screen.orientation.angle: rotación de la pantalla respecto a la orientación
 * natural (0 = portrait natural).
 *
 * Estrategia: compensar para que el heading expresado siempre sea el rumbo
 * absoluto del dispositivo, independientemente de cómo esté girada la pantalla.
 *
 * Nota: esta corrección es aproximada; iPhone en PWA puede reportar valores
 * que requieren ajuste fino según cómo el navegador exponga los eventos. El
 * consumo posterior (navigationHeading) aplica fusión/suavizado y tolera
 * heading imperfecto mientras el GPS course es dominante en movimiento.
 */
function screenOrientationCorrectedHeading(
  rawHeading: number | null,
  screenAngleDeg: number
): number | null {
  if (rawHeading == null) return null;
  // Ajuste por rotación de pantalla: compensar el ángulo de la pantalla para
  // obtener el rumbo absoluto del dispositivo. El signo/corrección exacto es
  // heurístico y puede requerir ajuste por dispositivo; aquí se compensa
  // rotando el heading por el ángulo de pantalla (sentido horario positivo).
  const corrected = (rawHeading + screenAngleDeg) % 360;
  return normalizeDeg(corrected);
}

export function useDeviceOrientation() {
  const [state, setState] = useState<DeviceHeadingRecord>({
    heading: 0,
    confidence: 0,
    permission: "unknown",
    available: "unavailable",
  });

  const latestRawRef = useRef<{ heading: number; ts: number } | null>(null);
  const lastSmoothedRef = useRef<{ heading: number; ts: number } | null>(null);
  const mountedRef = useRef(true);
  const permissionAttemptedRef = useRef(false);

  /**
   * Actualiza el heading suavizado a partir de lecturas crudas del sensor.
   * Aplica anti-jitter (skip angular) y clamp de velocidad angular.
   */
  const updateSmoothed = useCallback((raw: number, now: number) => {
    const prev = lastSmoothedRef.current;
    let next = raw;
    if (prev) {
      const delta = shortestAngleDelta(raw, prev.heading);
      const elapsed = Math.max(1, now - prev.ts);
      // Clamp de velocidad angular: descartar/saltar lecturas imposibles.
      const rate = Math.abs(delta) / (elapsed / 1000);
      if (rate > MAX_RATE_DEG_PER_SEC) {
        return; // lectura ruidosa, ignorar
      }
      if (Math.abs(delta) <= SKIP_DEG) {
        next = prev.heading; // mantener estable si apenas cambió
      } else {
        // Suavizado simple: damped hacia el nuevo valor.
        const factor = Math.min(1, Math.max(0.15, 16 / Math.max(16, elapsed)));
        next = normalizeDeg(prev.heading + delta * factor);
      }
    }
    lastSmoothedRef.current = { heading: next, ts: now };
    if (mountedRef.current) {
      setState((s) => ({
        ...s,
        heading: next,
        confidence: s.confidence < 1 ? Math.min(1, s.confidence + 0.08) : 1,
      }));
    }
  }, []);

  const handleOrientation = useCallback(
    (event: DeviceOrientationEvent) => {
      if (!mountedRef.current) return;
      const raw = trueHeadingFromEvent(event);
      if (raw == null) return;
      let corrected = screenOrientationCorrectedHeading(raw, 0);
      if (corrected == null) return;

      // Screen orientation puede llegar asíncrono; compensar con el ángulo
      // más reciente disponible. Se lee directamente de window.screen para
      // no depender de state.
      try {
        const screen = window.screen as { orientation?: { angle: number } } | null;
        const screenAngle =
          screen?.orientation?.angle != null ? screen.orientation.angle : 0;
        corrected = screenOrientationCorrectedHeading(raw, screenAngle);
      } catch {
        // Fallback sin corrección de pantalla.
      }

      const now = Date.now();
      if (corrected != null) {
        latestRawRef.current = { heading: corrected, ts: now };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        updateSmoothed(corrected as any, now);
      }
    },
    [updateSmoothed]
  );

  // Permiso iOS 13+ para DeviceOrientationEvent.
  const requestPermission = useCallback(async (): Promise<PermissionState> => {
    if (typeof window === "undefined") return "unknown";
    // iOS 13+: requiere llamar a DeviceOrientationEvent.requestPermission().
    // En Android/otros, la función no existe y se puede suscribir directamente.
    if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission !== "function") {
      // Sin requestPermission: el evento suele estar disponible sin prompt.
      return "granted";
    }
    try {
      const result = await (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
      const map: Record<string, PermissionState> = {
        granted: "granted",
        denied: "denied",
        prompt: "prompt",
        undetermined: "prompt",
      };
      return map[result?.toLowerCase()] ?? "prompt";
    } catch {
      return "prompt";
    }
  }, []);

  // Iniciar escucha de sensores.
  const start = useCallback(async () => {
    if (!mountedRef.current) return;
    if (typeof window === "undefined") {
      setState((s) => ({ ...s, available: "unavailable" }));
      return;
    }

    const isOrientationAvailable =
      typeof window.DeviceOrientationEvent !== "undefined" &&
      typeof window.addEventListener === "function";
    const motionAvailable =
      typeof window.DeviceMotionEvent !== "undefined";

    if (!isOrientationAvailable && !motionAvailable) {
      setState((s) => ({ ...s, available: "unavailable" }));
      return;
    }

    // Determinar estado de permiso inicial en iOS.
    let willRequirePermission = false;
    if (typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission === "function") {
      willRequirePermission = true;
    }

    if (!willRequirePermission) {
      // Suscribir directamente (Android/otros).
      setState((s) => ({
        ...s,
        available: "available",
        permission: "granted",
        confidence: s.confidence < 1 ? Math.min(1, s.confidence + 0.2) : s.confidence,
      }));
      if (window.addEventListener) {
        window.addEventListener("deviceorientation", handleOrientation, true);
      }
      return;
    }

    // iOS: primero marcar disponibilidad y esperar permiso.
    setState((s) => ({
      ...s,
      available: "permission_required",
      permission: "prompt",
    }));

    // No solicitar permiso automáticamente: se pide solo cuando la página
    // lo solicita explícitamente (p. ej. al iniciar navegación).
  }, [handleOrientation]);

  const setPermission = useCallback((permission: PermissionState) => {
    setState((s) => ({
      ...s,
      permission,
      available:
        permission === "granted"
          ? (s.available === "unavailable" ? "unavailable" : "available")
          : s.available,
    }));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    start();
    return () => {
      mountedRef.current = false;
      if (window.removeEventListener) {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      }
    };
  }, [start, handleOrientation]);

  /**
   * Solicitar permiso de orientación (iOS) y activar la escucha.
   * Puede llamarse varias veces con idempotencia (solo pide permiso una vez).
   */
  const enable = useCallback(async (): Promise<DeviceHeadingRecord> => {
    if (!mountedRef.current) {
      return state;
    }
    if (state.available === "unavailable") {
      return state;
    }

    // Si ya está activo y tiene heading, no hacer nada.
    if (state.available === "available" && state.permission === "granted") {
      return state;
    }

    // Si hay que pedir permiso y aún no se intentó.
    if (state.available === "permission_required" && state.permission === "prompt" && !permissionAttemptedRef.current) {
      permissionAttemptedRef.current = true;
      // Antes de pedir, asegurar que el listener esté suscrito (iOS lo requiere después del permission prompt).
      if (window.addEventListener) {
        window.addEventListener("deviceorientation", handleOrientation, true);
      }
      const permission = await requestPermission();
      setPermission(permission);
      if (permission === "granted") {
        setState((s) => ({
          ...s,
          available: "available",
          confidence: s.confidence < 1 ? Math.min(1, s.confidence + 0.3) : s.confidence,
        }));
      }
      return state;
    }

    // Si el permiso ya fue denegado, no insisti.
    if (state.permission === "denied") return state;

    return state;
  }, [state, requestPermission, setPermission, handleOrientation]);

  return {
    state,
    enable,
  };
}
