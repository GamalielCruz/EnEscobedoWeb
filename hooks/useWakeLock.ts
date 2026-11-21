"use client";

import { useEffect, useRef } from "react";

/**
 * Mantiene la pantalla encendida mientras `enabled` sea true (navegación
 * activa), como hacen Waze/Google Maps. Safari iOS 16.4+ expone
 * `navigator.wakeLock.request("screen")`; en navegadores sin soporte es
 * no-op. El sistema lo libera automáticamente al ocultar la pestaña, por
 * eso se re-solicita al volver a visible.
 */
export function useWakeLock(enabled: boolean) {
  const sentinelRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };
    if (!nav.wakeLock) return;

    let cancelled = false;
    const request = async () => {
      if (document.hidden) return;
      try {
        const sentinel = await nav.wakeLock!.request("screen");
        if (cancelled) {
          await sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Sin permiso / sin soporte: navegación normal, sin wake lock.
      }
    };

    void request();
    const onVisibility = () => {
      if (!document.hidden) void request();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [enabled]);
}
