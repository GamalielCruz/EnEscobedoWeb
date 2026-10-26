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

/**
 * Extrae el heading crudo del evento de orientación del dispositivo.
 *
 * Prioridad:
 *  1. `webkitCompassHeading` (iOS Safari, true heading calibrado por el
 *     magnetazo) — ya es un heading absoluto [0,360), NO requiere corrección
 *     por screen orientation.
 *  2. `alpha` con `absolute=true` — representa la rotación respecto al norte
 *     magnético cuando el dispositivo está en su orientación portrait natural
 *     (cámara arriba). Requiere corrección por screen orientation.
 *  3. `alpha` sin absolute — valor relativo, poco fiable, ignorar.
 *
 * Devuelve null cuando no hay un heading usable.
 */
function trueHeadingFromEvent(event: DeviceOrientationEvent | null): number | null {
  if (!event) return null;
  // iOS Safari: true heading calibrado por el magnetazo (ya absoluto).
  const raw = (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading;
  if (typeof raw === "number" && isFinite(raw)) {
    return raw; // ya es absoluto, NO corregir por screen orientation
  }
  // Alpha absoluto: representa rotación respecto al norte magnético con el
  // dispositivo en portrait natural. Requiere corrección por screen orientation.
  if (event.absolute && typeof event.alpha === "number" && isFinite(event.alpha)) {
    return event.alpha;
  }
  return null;
}

/**
 * Corrige un heading alpha (no webkitCompassHeading) por el ángulo de
 * orientación de la pantalla.
 *
 * En iOS, cuando el dispositivo está en portrait natural (cámara arriba),
 * `alpha` mide la rotación respecto al norte magnético. Cuando la pantalla se
 * rota (landscape, upside-down, etc.), `alpha` se mide desde una referencia
 * diferente y hay que compensar.
 *
 * screen.orientation.angle: rotación de la pantalla respecto a la orientación
 * natural (0 = portrait natural, 90 = landscape right, 180 = upside-down,
 * 270 = landscape left).
 *
 * NOTA: esta corrección es heurística. En PWA/Safari el comportamiento puede
 * variar; si `webkitCompassHeading` está disponible, esa ruta es preferible
 * porque ya da un heading absoluto sin corrección.
 */
function screenOrientationCorrectedHeading(
  rawAlpha: number | null,
  screenAngleDeg: number
): number | null {
  if (rawAlpha == null) return null;
  // screenAngleDeg compensa la rotación de la pantalla para obtener el
  // heading absoluto del dispositivo. Signo heurístico: al rotar la pantalla
  // 90° (landscape right), el alpha medido se desplaza; compenSAR restando.
  const corrected = (rawAlpha - screenAngleDeg + 360) % 360;
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
   * El suavizado utiliza la diferencia angular más corta para evitar flips
   * de 359° → 0° (p. ej., 358° → 359° → 0° → 1° se interpreta como
   * +1° → +1° → +1°, no como una rotación de casi 360°).
   */
  const updateSmoothed = useCallback((raw: number, now: number) => {
    const prev = lastSmoothedRef.current;
    let next = raw;
    if (prev) {
      const rawDelta = shortestAngleDelta(raw, prev.heading);
      const absDelta = Math.abs(rawDelta);
      const elapsed = Math.max(1, now - prev.ts);
      // Clamp de velocidad angular: descartar lecturas imposibles (>360°/s).
      const rate = absDelta / (elapsed / 1000);
      if (rate > MAX_RATE_DEG_PER_SEC) {
        return; // lectura ruidosa, ignorar
      }
      if (absDelta <= SKIP_DEG) {
        next = prev.heading; // mantener estable si apenas cambió
      } else {
        // Suavizado: damped hacia el nuevo valor usando la diferencia más corta.
        // Esto evita que 358° → 359° → 0° → 1° cause flips de 360°.
        const factor = Math.min(1, Math.max(0.12, 20 / Math.max(20, elapsed)));
        next = normalizeDeg(prev.heading + rawDelta * factor);
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

      // Si es webkitCompassHeading (ya absoluto), no aplicar corrección de pantalla.
      const isCompassHeading =
        typeof (event as unknown as { webkitCompassHeading?: number }).webkitCompassHeading === "number";

      let corrected: number;
      if (isCompassHeading) {
        // Ya es un heading absoluto; usar directamente.
        corrected = normalizeDeg(raw);
      } else {
        // Alpha con absolute: corregir por screen orientation.
        const correctedAlpha = screenOrientationCorrectedHeading(raw, 0);
        if (correctedAlpha == null) return;
        try {
          const screen = window.screen as { orientation?: { angle: number } } | null;
          const screenAngle =
            screen?.orientation?.angle != null ? screen.orientation.angle : 0;
          corrected = screenOrientationCorrectedHeading(raw, screenAngle) ?? correctedAlpha;
        } catch {
          corrected = correctedAlpha;
        }
      }

      const now = Date.now();
      latestRawRef.current = { heading: corrected, ts: now };
      updateSmoothed(corrected, now);
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
