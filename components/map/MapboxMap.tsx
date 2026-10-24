"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type {
  GeoJSONSource,
  Map as MapboxMapInstance,
  Marker as MapboxMarker,
  StyleSpecification,
} from "mapbox-gl";
import { loadMapboxGL } from "@/hooks/useMapbox";
import {
  MAPBOX_PUBLIC_TOKEN,
  MAPBOX_STYLE_LIGHT,
  type MapboxPoint,
} from "@/lib/mapbox";

export type MapboxMapMarker = {
  id: string;
  lat: number;
  lng: number;
  /** HTML personalizado (pin SVG + etiqueta). Si falta se dibuja un punto. */
  html?: string;
  color?: string;
  size?: number;
  variant?: "dot" | "pin";
  title?: string;
  draggable?: boolean;
  /** Rotación del marcador en grados (flecha del repartidor). */
  rotation?: number;
  anchor?: "center" | "bottom" | "top" | "left" | "right";
  zIndex?: number;
  onClick?: () => void;
  onDragEnd?: (point: MapboxPoint) => void;
};

export type MapboxMapLine = {
  id: string;
  points: MapboxPoint[];
  color: string;
  width?: number;
  opacity?: number;
  dashed?: boolean;
};

export type MapboxMapPolygon = {
  id: string;
  points: MapboxPoint[];
  color: string;
  fillOpacity?: number;
  strokeWidth?: number;
};

export type MapboxMapHandle = {
  map: MapboxMapInstance | null;
  marker: (id: string) => MapboxMarker | null;
};

export type MapboxMapProps = {
  center: MapboxPoint;
  zoom?: number;
  styleUrl?: string;
  /**
   * Estilo completo (JSON) en lugar de una URL. Útil para estilos de marca
   * construidos en runtime (lib/drive/map-styles.ts). Tiene prioridad sobre
   * `styleUrl`.
   */
  styleSpec?: StyleSpecification | null;
  className?: string;
  /** Rotación/pitch habilitados (navegación del repartidor). */
  rotate?: boolean;
  showControls?: boolean;
  markers?: MapboxMapMarker[];
  lines?: MapboxMapLine[];
  polygons?: MapboxMapPolygon[];
  fitPoints?: MapboxPoint[];
  fitPadding?: number;
  fitMaxZoom?: number;
  onClick?: (point: MapboxPoint) => void;
  /** Paneo o zoom iniciado por el usuario (no por la cámara del código). */
  onUserInteraction?: () => void;
  onLoad?: (map: MapboxMapInstance) => void;
  /** Se llama al desmontar el mapa (limpieza de refs del consumidor). */
  onUnmount?: () => void;
  onError?: (message: string) => void;
};

const EMPTY_MARKERS: MapboxMapMarker[] = [];
const EMPTY_LINES: MapboxMapLine[] = [];
const EMPTY_POLYGONS: MapboxMapPolygon[] = [];

function defaultMarkerHtml(marker: MapboxMapMarker): string {
  const color = marker.color ?? "#EB1902";
  const size = marker.size ?? 9;
  if (marker.variant === "pin") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${
      size * 2.6
    }" viewBox="0 0 28 36"><path fill="${color}" stroke="#fff" stroke-width="1.5" d="M14 1C7.4 1 2 6.4 2 13c0 9 12 22 12 22s12-13 12-22C26 6.4 20.6 1 14 1z"/><circle cx="14" cy="13" r="4.5" fill="#fff"/></svg>`;
  }
  return `<div style="width:${size * 2}px;height:${size * 2}px;border-radius:9999px;background:${color};border:2.5px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.35)"></div>`;
}

function markerSignature(marker: MapboxMapMarker): string {
  return [
    marker.html ?? "",
    marker.color ?? "",
    marker.size ?? "",
    marker.variant ?? "",
    marker.draggable ? "1" : "0",
    marker.anchor ?? "",
  ].join("|");
}

function toGeoJsonLine(points: MapboxPoint[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "LineString" as const,
      coordinates: points.map((point) => [point.lng, point.lat]),
    },
  };
}

function toGeoJsonPolygon(points: MapboxPoint[]) {
  return {
    type: "Feature" as const,
    properties: {},
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [...points.map((point) => [point.lng, point.lat]), [points[0]?.lng, points[0]?.lat]],
      ],
    },
  };
}

function pointsSignature(points: MapboxPoint[]): string {
  return points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join(";");
}

/**
 * Mapa declarativo sobre Mapbox GL: marcadores, líneas y polígonos se
 * actualizan por diferencia (id + firma), sin recrear el mapa. Es el
 * sustituto de <GoogleMap>/<Marker>/<Polyline>/<Polygon> del proyecto.
 */
export const MapboxMap = forwardRef<MapboxMapHandle, MapboxMapProps>(
  function MapboxMap(
    {
      center,
      zoom = 14,
      styleUrl = MAPBOX_STYLE_LIGHT,
      styleSpec,
      className,
      rotate = false,
      showControls = false,
      markers = EMPTY_MARKERS,
      lines = EMPTY_LINES,
      polygons = EMPTY_POLYGONS,
      fitPoints,
      fitPadding = 48,
      fitMaxZoom = 16,
      onClick,
      onUserInteraction,
      onLoad,
      onUnmount,
      onError,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<MapboxMapInstance | null>(null);
    const glRef = useRef<Awaited<ReturnType<typeof loadMapboxGL>> | null>(null);
    const markerRefs = useRef(
      new Map<string, { marker: MapboxMarker; signature: string }>()
    );
    const layerIdsRef = useRef(new Set<string>());
    const lastFitRef = useRef("");
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const callbacksRef = useRef({ onClick, onUserInteraction, onLoad, onUnmount, onError });
    callbacksRef.current = { onClick, onUserInteraction, onLoad, onUnmount, onError };

    // Última versión de cada marcador: los listeners se registran UNA vez al
    // crear el marcador, pero siempre llaman a los callbacks del render vivo
    // (evita closures con estado viejo, p. ej. el modo del flujo de mandados).
    const latestMarkersRef = useRef(new Map<string, MapboxMapMarker>());
    latestMarkersRef.current = new Map(markers.map((spec) => [spec.id, spec]));

    useImperativeHandle(ref, () => ({
      map: mapRef.current,
      marker: (id: string) => markerRefs.current.get(id)?.marker ?? null,
    }));

    // ── Inicialización del mapa ──
    useEffect(() => {
      let cancelled = false;
      setReady(false);
      setError(null);
      const container = containerRef.current;
      if (!container) return;

      loadMapboxGL()
        .then((gl) => {
          if (cancelled || !containerRef.current) return;
          gl.accessToken = MAPBOX_PUBLIC_TOKEN;
          glRef.current = gl;

          const map = new gl.Map({
            container: containerRef.current,
            style: styleSpec ?? styleUrl,
            center: [center.lng, center.lat],
            zoom,
            attributionControl: true,
            dragRotate: rotate,
            pitchWithRotate: rotate,
            touchPitch: rotate,
          });
          mapRef.current = map;

          if (!rotate) {
            map.touchZoomRotate.disableRotation();
            map.dragRotate.disable();
          }
          if (showControls) {
            map.addControl(
              new gl.NavigationControl({ showCompass: rotate }),
              "top-right"
            );
          }

          map.on("load", () => {
            if (cancelled) return;
            setReady(true);
            callbacksRef.current.onLoad?.(map);
          });

          map.on("click", (event) => {
            callbacksRef.current.onClick?.({
              lat: event.lngLat.lat,
              lng: event.lngLat.lng,
            });
          });

          map.on("dragstart", () => {
            callbacksRef.current.onUserInteraction?.();
          });

          map.on("zoom", (event) => {
            // Solo zoom gestual del usuario; la cámara del código no dispara
            // originalEvent y no debe desactivar el seguimiento.
            if ((event as { originalEvent?: unknown }).originalEvent) {
              callbacksRef.current.onUserInteraction?.();
            }
          });

          map.on("error", (event: { error?: { status?: number; message?: string } }) => {
            const status = event?.error?.status;
            if (status === 401 || status === 403) {
              const message =
                "No se pudo autenticar con Mapbox. Revisa el token configurado.";
              setError(message);
              callbacksRef.current.onError?.(message);
            }
          });
        })
        .catch((cause: unknown) => {
          const message =
            cause instanceof Error
              ? cause.message
              : "No se pudo cargar el mapa de Mapbox";
          setError(message);
          callbacksRef.current.onError?.(message);
        });

      return () => {
        cancelled = true;
        callbacksRef.current.onUnmount?.();
        markerRefs.current.forEach(({ marker }) => marker.remove());
        markerRefs.current.clear();
        layerIdsRef.current.clear();
        lastFitRef.current = "";
        mapRef.current?.remove();
        mapRef.current = null;
        setReady(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [styleUrl, styleSpec, rotate, showControls]);

    // ── Marcadores (diff por id) ──
    useEffect(() => {
      const map = mapRef.current;
      const gl = glRef.current;
      if (!map || !gl || !ready) return;

      const seen = new Set<string>();
      for (const spec of markers) {
        seen.add(spec.id);
        const signature = markerSignature(spec);
        const current = markerRefs.current.get(spec.id);

        if (current && current.signature !== signature) {
          current.marker.remove();
          markerRefs.current.delete(spec.id);
        }

        const existing = markerRefs.current.get(spec.id);
        if (!existing) {
          const element = document.createElement("div");
          element.style.cursor = spec.onClick ? "pointer" : "";
          element.innerHTML = spec.html ?? defaultMarkerHtml(spec);
          if (spec.title) element.setAttribute("title", spec.title);
          if (spec.zIndex != null) element.style.zIndex = String(spec.zIndex);

          const marker = new gl.Marker({
            element,
            draggable: Boolean(spec.draggable),
            rotation: spec.rotation ?? 0,
            anchor: spec.anchor ?? (spec.variant === "pin" ? "bottom" : "center"),
          })
            .setLngLat([spec.lng, spec.lat])
            .addTo(map);

          if (spec.onClick) {
            element.addEventListener("click", (event) => {
              event.stopPropagation();
              latestMarkersRef.current.get(spec.id)?.onClick?.();
            });
          }
          if (spec.draggable) {
            marker.on("dragend", () => {
              const { lat, lng } = marker.getLngLat();
              latestMarkersRef.current.get(spec.id)?.onDragEnd?.({ lat, lng });
            });
          }

          markerRefs.current.set(spec.id, { marker, signature });
        } else {
          const position = existing.marker.getLngLat();
          if (
            Math.abs(position.lat - spec.lat) > 1e-9 ||
            Math.abs(position.lng - spec.lng) > 1e-9
          ) {
            existing.marker.setLngLat([spec.lng, spec.lat]);
          }
          if (typeof spec.rotation === "number") {
            existing.marker.setRotation(spec.rotation);
          }
        }
      }

      for (const [id, entry] of markerRefs.current) {
        if (!seen.has(id)) {
          entry.marker.remove();
          markerRefs.current.delete(id);
        }
      }
    }, [ready, markers]);

    // ── Líneas (ruta de navegación, rutas de pedidos) ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;

      const seen = new Set<string>();
      for (const line of lines) {
        if (line.points.length < 2) continue;
        const sourceId = `mm-line-${line.id}`;
        const layerId = sourceId;
        seen.add(layerId);

        const data = toGeoJsonLine(line.points);
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (source) {
          source.setData(data);
        } else {
          map.addSource(sourceId, { type: "geojson", data });
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            layout: { "line-join": "round", "line-cap": "round" },
            paint: {
              "line-color": line.color,
              "line-width": line.width ?? 4,
              "line-opacity": line.opacity ?? 0.9,
              ...(line.dashed ? { "line-dasharray": [2, 1.5] } : {}),
            },
          });
        }
        map.setPaintProperty(layerId, "line-color", line.color);
        map.setPaintProperty(layerId, "line-width", line.width ?? 4);
        map.setPaintProperty(layerId, "line-opacity", line.opacity ?? 0.9);
        if (line.dashed) {
          map.setPaintProperty(layerId, "line-dasharray", [2, 1.5]);
        }
      }

      for (const layerId of Array.from(layerIdsRef.current)) {
        if (!seen.has(layerId)) {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getSource(layerId)) map.removeSource(layerId);
          layerIdsRef.current.delete(layerId);
        }
      }
      seen.forEach((id) => layerIdsRef.current.add(id));
    }, [ready, lines]);

    // ── Polígonos (zonas de reparto) ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;

      const seen = new Set<string>();
      for (const polygon of polygons) {
        if (polygon.points.length < 3) continue;
        const sourceId = `mm-polygon-${polygon.id}`;
        const fillId = `${sourceId}-fill`;
        const outlineId = `${sourceId}-outline`;
        seen.add(fillId);
        seen.add(outlineId);

        const data = toGeoJsonPolygon(polygon.points);
        const source = map.getSource(sourceId) as GeoJSONSource | undefined;
        if (source) {
          source.setData(data);
        } else {
          map.addSource(sourceId, { type: "geojson", data });
          map.addLayer({
            id: fillId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": polygon.color,
              "fill-opacity": polygon.fillOpacity ?? 0.12,
            },
          });
          map.addLayer({
            id: outlineId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": polygon.color,
              "line-opacity": 0.65,
              "line-width": polygon.strokeWidth ?? 1.5,
            },
          });
        }
        map.setPaintProperty(fillId, "fill-color", polygon.color);
        map.setPaintProperty(outlineId, "line-color", polygon.color);
      }

      for (const layerId of Array.from(layerIdsRef.current)) {
        if (!seen.has(layerId) && (layerId.endsWith("-fill") || layerId.endsWith("-outline"))) {
          const sourceId = layerId.replace(/-(fill|outline)$/, "");
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (!map.getLayer(`${sourceId}-fill`) && !map.getLayer(`${sourceId}-outline`)) {
            if (map.getSource(sourceId)) map.removeSource(sourceId);
          }
          layerIdsRef.current.delete(layerId);
        }
      }
      seen.forEach((id) => layerIdsRef.current.add(id));
    }, [ready, polygons]);

    // ── Centro/zoom controlados por props ──
    // Las props solo se aplican al crear el mapa; cuando el flujo mueve la
    // cámara por estado (panMap, elegir punto) hay que seguirla aquí.
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready) return;
      if (fitPoints && fitPoints.length > 0) return;
      map.jumpTo({ center: [center.lng, center.lat], zoom });
    }, [ready, center.lat, center.lng, zoom, fitPoints]);

    // ── Encuadre automático (ruta completa, tiendas, zonas) ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !ready || !fitPoints || fitPoints.length === 0) return;

      const signature = pointsSignature(fitPoints);
      if (signature === lastFitRef.current) return;
      lastFitRef.current = signature;

      if (fitPoints.length === 1) {
        map.easeTo({
          center: [fitPoints[0].lng, fitPoints[0].lat],
          zoom: Math.max(map.getZoom(), 15),
          duration: 0,
        });
        return;
      }

      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLng = Infinity;
      let maxLng = -Infinity;
      for (const point of fitPoints) {
        minLat = Math.min(minLat, point.lat);
        maxLat = Math.max(maxLat, point.lat);
        minLng = Math.min(minLng, point.lng);
        maxLng = Math.max(maxLng, point.lng);
      }

      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: fitPadding, maxZoom: fitMaxZoom, duration: 0 }
      );
    }, [ready, fitPoints, fitPadding, fitMaxZoom]);

    return (
      <div className={className} style={{ position: "relative", overflow: "hidden" }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 p-4 text-center text-sm text-slate-600">
            {error}
          </div>
        ) : null}
      </div>
    );
  }
);
