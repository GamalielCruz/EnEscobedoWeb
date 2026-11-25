"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { haversineMeters } from "@/lib/dispatch/routing";
import {
  createFixGateState,
  evaluateGpsFix,
  type FixRejectionReason,
} from "@/lib/drive/fix-gate";

const MIN_DISTANCE_METERS = 20;
const MIN_INTERVAL_MS = 10_000;
// Fase 3.1-B: la política de aceptación (antigüedad, accuracy, coordenadas
// repetidas, dedupe, regla >30 m vs ≤20 m fresco y escape de «sin fix
// bueno») vive en lib/drive/fix-gate.ts para poder reproducirla con trazas
// reales en Node. Aquí solo se aplica la decisión.

export type RawGpsSample = {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  deviceT: number | null;
  accepted: boolean;
  rejectedReason?: FixRejectionReason;
};

export function useDriverLocation(
  enabled: boolean,
  options?: { onRawSample?: (sample: RawGpsSample) => void }
) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  /** Precisión horizontal estimada del último fix aceptado (metros). */
  const [accuracy, setAccuracy] = useState<number | null>(null);
  /** Rumbo del GPS (0-360°, válido solo mientras el dispositivo se mueve). */
  const [heading, setHeading] = useState<number | null>(null);
  /** `coords.speed` normalizada (m/s, null si el SO no la entrega). */
  const [speed, setSpeed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastReportRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  // Fase 3.1: estado de la puerta de fixes (coordenadas vistas, último bueno,
  // candidato pobre para el escape). Misma política que el arnés de Node.
  const fixGateRef = useRef(createFixGateState());

  const reportLocation = useCallback(
    async (lat: number, lng: number) => {
      // Filter: significant change or enough time elapsed
      const last = lastReportRef.current;
      if (last) {
        const dist = haversineMeters(
          { lat: last.lat, lng: last.lng },
          { lat, lng }
        );
        const elapsed = Date.now() - last.time;
        if (dist < MIN_DISTANCE_METERS && elapsed < MIN_INTERVAL_MS) {
          return; // Skip — not significant enough
        }
      }

      lastReportRef.current = { lat, lng, time: Date.now() };

      try {
        await fetch("/api/driver/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat, lng }),
        });
      } catch {
        // Non-critical — GPS will try again next position
      }
    },
    []
  );

  useEffect(() => {
    if (!enabled || !navigator.geolocation) {
      setHeading(null);
      if (!navigator.geolocation) {
        setError("Tu dispositivo no permite obtener la ubicación.");
      }
      return;
    }

    mountedRef.current = true;

    const onSuccess = (pos: GeolocationPosition) => {
      if (!mountedRef.current) return;
      const { latitude, longitude, accuracy, heading: rawHeading, speed: rawSpeed } = pos.coords;
      // Instrumentación (Fase 0, staging): expone la muestra CRUDA antes de
      // los filtros para el grabador de trazas. No altera la lógica: los
      // filtros de abajo se aplican exactamente igual.
      const emitRawSample = (accepted: boolean, rejectedReason?: FixRejectionReason) => {
        options?.onRawSample?.({
          lat: latitude,
          lng: longitude,
          accuracy,
          speed: typeof rawSpeed === "number" && Number.isFinite(rawSpeed) ? rawSpeed : null,
          heading: typeof rawHeading === "number" && Number.isFinite(rawHeading) ? rawHeading : null,
          deviceT: typeof pos.timestamp === "number" ? pos.timestamp : null,
          accepted,
          ...(rejectedReason ? { rejectedReason } : {}),
        });
      };
      const now = Date.now();
      // Fase 3.1-B: decisión pura (accuracy, coordenadas repetidas, antigüedad,
      // dedupe, fix pobre vs bueno fresco y escape de 10 s sin fix bueno).
      const decision = evaluateGpsFix(fixGateRef.current, {
        lat: latitude,
        lng: longitude,
        accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
        deviceT: typeof pos.timestamp === "number" ? pos.timestamp : null,
        arrivedAt: now,
      });
      if (!decision.accepted) {
        emitRawSample(false, decision.reason);
        return;
      }
      emitRawSample(true);
      const acceptedLat = decision.lat;
      const acceptedLng = decision.lng;
      setLocation({ lat: acceptedLat, lng: acceptedLng });
      setAccuracy(decision.accuracy);
      // Un fix aceptado por el escape con un candidato PREVIO no aporta
      // velocidad ni rumbo nuevos: se conservan los del último fix.
      if (decision.useCurrent) {
        setSpeed(
          typeof rawSpeed === "number" && Number.isFinite(rawSpeed) && rawSpeed >= 0
            ? rawSpeed
            : null
        );
      }
      // heading solo es válido mientras el dispositivo se mueve; el resto del
      // sistema lo usa solo cuando viene como número dentro de [0, 360).
      // Solo setState si cambió de forma relevante: cada setState re-renderiza
      // la página del repartidor completa (árbol grande) y compite con el
      // render del mapa en el hilo principal.
      if (decision.useCurrent) {
        const nextHeading =
          typeof rawHeading === "number" && Number.isFinite(rawHeading)
            ? ((rawHeading % 360) + 360) % 360
            : null;
        setHeading((prev) => {
          if (prev === nextHeading) return prev;
          if (prev != null && nextHeading != null) {
            const diff = Math.abs(((nextHeading - prev + 540) % 360) - 180);
            if (diff < 1) return prev;
          }
          return nextHeading;
        });
      }
      reportLocation(acceptedLat, acceptedLng);
    };

    const onError = (err: GeolocationPositionError) => {
      if (!mountedRef.current) return;
      if (err.code === err.PERMISSION_DENIED) {
        setError("Permiso de ubicación denegado.");
      } else if (err.code === err.POSITION_UNAVAILABLE) {
        setError("Ubicación no disponible.");
      }
      // TIMEOUT: just wait for next watch callback
    };

    // Try to get initial position
    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 15_000,
      // 0: la primera posición también debe ser fresca (T1: venía con
      // 21.7 s de antigüedad con maximumAge 30 s).
      maximumAge: 0,
    });

    // Start watching
    // maximumAge: 0 — en Safari iOS un maximumAge alto (antes 10 s) hace que
    // el navegador entregue posiciones cacheadas de hasta 10 segundos de
    // antigüedad: el mapa y las instrucciones se ven "desfasados" respecto
    // al movimiento real del vehículo. 0 = siempre posición fresca.
    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      }
    );

    return () => {
      mountedRef.current = false;
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, reportLocation]);

  return { location, heading, accuracy, speed, error };
}
