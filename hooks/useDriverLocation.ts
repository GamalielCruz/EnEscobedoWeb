"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_DISTANCE_METERS = 20;
const MIN_INTERVAL_MS = 10_000;
const GPS_LOCATION_MIN_INTERVAL_MS = 250;
const GPS_LOCATION_MIN_DISTANCE_METERS = 1.5;
const MAX_FIX_AGE_MS = 5_000;
// Fase 1-D: descartar fixes con antigüedad > 5 s (position.timestamp vs el
// reloj del dispositivo). En la traza T1 el primer fix tenía 21.7 s de
// antigüedad pese a maximumAge:0 (la caché del SO puede mentir).

function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type RawGpsSample = {
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  deviceT: number | null;
  accepted: boolean;
  rejectedReason?: "accuracy" | "dedupe" | "stale";
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
  const lastVisualLocationRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  const reportLocation = useCallback(
    async (lat: number, lng: number) => {
      // Filter: significant change or enough time elapsed
      const last = lastReportRef.current;
      if (last) {
        const dist = haversineDistance(last.lat, last.lng, lat, lng);
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
      const emitRawSample = (accepted: boolean, rejectedReason?: "accuracy" | "dedupe" | "stale") => {
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
      // Skip if accuracy is poor (> 100m)
      if (accuracy > 100) {
        emitRawSample(false, "accuracy");
        return;
      }
      const now = Date.now();
      const previous = lastVisualLocationRef.current;
      if (previous) {
        const distance = haversineDistance(previous.lat, previous.lng, latitude, longitude);
        const elapsed = now - previous.time;
        if (
          elapsed < GPS_LOCATION_MIN_INTERVAL_MS &&
          distance < GPS_LOCATION_MIN_DISTANCE_METERS
        ) {
          emitRawSample(false, "dedupe");
          return;
        }
      }
      // Antigüedad del fix: si el SO entregó una posición vieja, se
      // descarta (no mueve marcador ni cámara).
      const fixAgeMs = typeof pos.timestamp === "number" ? now - pos.timestamp : 0;
      if (fixAgeMs > MAX_FIX_AGE_MS) {
        emitRawSample(false, "stale");
        return;
      }
      emitRawSample(true);
      lastVisualLocationRef.current = { lat: latitude, lng: longitude, time: now };
      setLocation({ lat: latitude, lng: longitude });
      setAccuracy(accuracy);
      setSpeed(
        typeof rawSpeed === "number" && Number.isFinite(rawSpeed) && rawSpeed >= 0
          ? rawSpeed
          : null
      );
      // heading solo es válido mientras el dispositivo se mueve; el resto del
      // sistema lo usa solo cuando viene como número dentro de [0, 360).
      // Solo setState si cambió de forma relevante: cada setState re-renderiza
      // la página del repartidor completa (árbol grande) y compite con el
      // render del mapa en el hilo principal.
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
      reportLocation(latitude, longitude);
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
