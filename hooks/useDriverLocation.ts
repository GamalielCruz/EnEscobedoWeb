"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MIN_DISTANCE_METERS = 20;
const MIN_INTERVAL_MS = 10_000;

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

export function useDriverLocation(enabled: boolean) {
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastReportRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

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
      if (!navigator.geolocation) {
        setError("Tu dispositivo no permite obtener la ubicación.");
      }
      return;
    }

    mountedRef.current = true;

    const onSuccess = (pos: GeolocationPosition) => {
      if (!mountedRef.current) return;
      const { latitude, longitude, accuracy } = pos.coords;
      // Skip if accuracy is poor (> 100m)
      if (accuracy > 100) return;
      setLocation({ lat: latitude, lng: longitude });
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
      maximumAge: 30_000,
    });

    // Start watching
    watchIdRef.current = navigator.geolocation.watchPosition(
      onSuccess,
      onError,
      {
        enableHighAccuracy: true,
        timeout: 30_000,
        maximumAge: 10_000,
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

  return { location, error };
}
