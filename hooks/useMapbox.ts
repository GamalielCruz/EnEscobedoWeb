"use client";

import { useEffect, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { MAPBOX_PUBLIC_TOKEN } from "@/lib/mapbox";

export type MapboxGL = typeof mapboxgl;

// El paquete se carga UNA vez (singleton a nivel módulo) y se comparte entre
// todos los mapas de la página. Sin `window`, sin callbacks globales.
let mapboxPromise: Promise<MapboxGL> | null = null;
let mapboxModule: MapboxGL | null = null;
let mapboxLoadError: string | null = null;

export function loadMapboxGL(): Promise<MapboxGL> {
  if (mapboxModule) return Promise.resolve(mapboxModule);
  if (mapboxPromise) return mapboxPromise;

  mapboxPromise = import("mapbox-gl")
    .then((imported) => {
      const gl = ((imported as unknown as { default?: MapboxGL }).default ??
        imported) as MapboxGL;
      gl.accessToken = MAPBOX_PUBLIC_TOKEN;
      mapboxModule = gl;
      mapboxLoadError = null;
      return gl;
    })
    .catch((error: unknown) => {
      mapboxLoadError =
        error instanceof Error ? error.message : "No se pudo cargar Mapbox";
      mapboxPromise = null;
      throw error;
    });

  return mapboxPromise;
}

/**
 * Hook de carga de Mapbox GL. Sustituye a useGoogleMaps: devuelve el módulo
 * `mapbox-gl` (no un global de window) cuando ya está disponible.
 */
export function useMapbox({ enabled = true }: { enabled?: boolean } = {}) {
  const [mapboxgl, setMapboxgl] = useState<MapboxGL | null>(mapboxModule);
  const [isLoaded, setIsLoaded] = useState(Boolean(mapboxModule));
  const [loadError, setLoadError] = useState<string | null>(mapboxLoadError);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (mapboxModule) {
      setMapboxgl(mapboxModule);
      setIsLoaded(true);
      return;
    }

    loadMapboxGL()
      .then((gl) => {
        if (cancelled) return;
        setMapboxgl(gl);
        setIsLoaded(true);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setIsLoaded(false);
        setLoadError(
          error instanceof Error ? error.message : "No se pudo cargar Mapbox"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { isLoaded, loadError, mapboxgl };
}
