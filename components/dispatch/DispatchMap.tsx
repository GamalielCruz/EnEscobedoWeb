"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Loader2, MapPin, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MapboxMap,
  type MapboxMapLine,
  type MapboxMapMarker,
} from "@/components/map/MapboxMap";
import {
  MAPBOX_STYLE_DARK,
  MAPBOX_STYLE_LIGHT,
  mapboxDirections,
  type MapboxPoint,
} from "@/lib/mapbox";
import type {
  DispatchDriverCard,
  DispatchOrderCard,
  DriverRecommendation,
} from "@/lib/dispatch/dispatch-core";

type Zone = { id: string; name: string; color?: string; coordinates: Array<{ lat: number; lng: number }> };
type Store = { _id: string; name: string; lat?: number; lng?: number; address?: string };

type Props = {
  orders: DispatchOrderCard[];
  stores: Store[];
  zones: Zone[];
  drivers: DispatchDriverCard[];
  recommendations: DriverRecommendation[];
  selectedOrderId: string | null;
  selectedDriverId: string | null;
  onSelectOrder: (id: string) => void;
  onSelectDriver: (id: string) => void;
  dark: boolean;
};

const DEFAULT_CENTER = { lat: 20.502, lng: -100.145 };

const driverColors: Record<DispatchDriverCard["estado"], string> = {
  available: "#10b981",
  busy: "#f59e0b",
  offer_pending: "#0ea5e9",
  paused: "#64748b",
  offline: "#94a3b8",
  blocked: "#ef4444",
};

function hasLocation(driver: DispatchDriverCard): boolean {
  return Number.isFinite(driver.lastLocation?.lat) && Number.isFinite(driver.lastLocation?.lng);
}

/** Círculo de color como HTML del marcador (mismo trazo que en Google Maps). */
function circleHtml(color: string, radius: number, strokeWidth: number, box: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${box}" height="${box}" viewBox="0 0 ${box} ${box}"><circle cx="${box / 2}" cy="${box / 2}" r="${radius}" fill="${color}" stroke="white" stroke-width="${strokeWidth}"/></svg>`;
  return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" width="${box}" height="${box}" alt="" style="display:block" />`;
}

export function DispatchMap({
  orders,
  stores,
  zones,
  drivers,
  recommendations,
  selectedOrderId,
  selectedDriverId,
  onSelectOrder,
  onSelectDriver,
  dark,
}: Props) {
  const [fitKey, setFitKey] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);
  const [routePath, setRoutePath] = useState<MapboxPoint[] | null>(null);
  const [available, setAvailable] = useState(true);

  // Reajustar el encuadre solo cuando cambian los CONTADOS (no cada poll),
  // para no pelear con el paneo manual del operador.
  useEffect(() => {
    setFitKey((k) => k + 1);
  }, [orders.length, stores.length, drivers.length]);

  const fitPoints = useMemo<MapboxPoint[]>(() => {
    void fitKey;
    const points: MapboxPoint[] = [];
    for (const order of orders) {
      if (order.storeLat != null && order.storeLng != null) {
        points.push({ lat: order.storeLat, lng: order.storeLng });
      }
      if (order.destLat != null && order.destLng != null) {
        points.push({ lat: order.destLat, lng: order.destLng });
      }
    }
    for (const store of stores) {
      if (store.lat != null && store.lng != null) points.push({ lat: store.lat, lng: store.lng });
    }
    for (const driver of drivers) {
      if (hasLocation(driver) && driver.lastLocation) {
        points.push({ lat: driver.lastLocation.lat!, lng: driver.lastLocation.lng! });
      }
    }
    return points;
  }, [fitKey, orders, stores, drivers]);

  const selectedOrder = orders.find((o) => o._id === selectedOrderId) ?? null;
  const selectedDriver = drivers.find((d) => d._id === selectedDriverId) ?? null;

  // Firma estable de la ruta: solo cambia si cambian el pedido, el repartidor
  // o sus coordenadas. Evita re-consultar Directions en cada poll (12 s).
  const routeKey = selectedOrder
    ? [
        selectedOrder._id,
        selectedDriver?._id ?? "none",
        selectedOrder.storeLat ?? "",
        selectedOrder.storeLng ?? "",
        selectedOrder.destLat ?? "",
        selectedOrder.destLng ?? "",
        selectedDriver?.lastLocation?.lat ?? "",
        selectedDriver?.lastLocation?.lng ?? "",
      ].join(":")
    : "";

  // ── Ruta sugerida: repartidor → origen → destino (si hay datos reales) ──
  useEffect(() => {
    setRoutePath(null);
    if (!selectedOrder) return;
    if (selectedOrder.storeLat == null || selectedOrder.storeLng == null || selectedOrder.destLat == null || selectedOrder.destLng == null) {
      return; // sin coordenadas → la UI muestra "Sin estimar"
    }
    const origin = { lat: selectedOrder.storeLat, lng: selectedOrder.storeLng };
    const destination = { lat: selectedOrder.destLat, lng: selectedOrder.destLng };
    const driverLoc = selectedDriver?.lastLocation;
    const useDriver = driverLoc && Number.isFinite(driverLoc.lat) && Number.isFinite(driverLoc.lng);

    let cancelled = false;
    mapboxDirections(
      useDriver ? { lat: driverLoc.lat!, lng: driverLoc.lng! } : origin,
      destination,
      {
        profile: "driving-traffic",
        language: "es",
        steps: false,
        waypoints: useDriver ? [origin] : undefined,
      }
    ).then((route) => {
      if (cancelled) return;
      setRoutePath(route?.path ?? null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  const topRecDriverId = recommendations[0]?.driver._id;

  const markers = useMemo<MapboxMapMarker[]>(() => {
    const list: MapboxMapMarker[] = [];

    for (const driver of drivers) {
      if (!hasLocation(driver) || !driver.lastLocation) continue;
      const isSelected = driver._id === selectedDriverId;
      const isTopRec = driver._id === topRecDriverId;
      const size = isSelected ? 15 : isTopRec ? 13 : 10;
      list.push({
        id: `driver-${driver._id}`,
        lat: driver.lastLocation.lat!,
        lng: driver.lastLocation.lng!,
        html: circleHtml(driverColors[driver.estado], size, isSelected ? 4 : 2.5, 34),
        title: `${driver.name} (${driver.estado})`,
        zIndex: isSelected ? 45 : isTopRec ? 35 : 25,
        onClick: () => onSelectDriver(driver._id),
      });
    }

    for (const store of stores) {
      if (store.lat == null || store.lng == null) continue;
      list.push({
        id: `store-${store._id}`,
        lat: store.lat,
        lng: store.lng,
        html: circleHtml("#EB1902", 11, 2.5, 28),
        title: store.name,
        zIndex: 30,
      });
    }

    for (const order of orders) {
      if (order.destLat == null || order.destLng == null) continue;
      const isSelected = order._id === selectedOrderId;
      const color =
        order.serviceKind === "mandado" ? "#8b5cf6" : order.priority === "urgent" ? "#ef4444" : order.priority === "high" ? "#f59e0b" : "#0ea5e9";
      list.push({
        id: order._id,
        lat: order.destLat,
        lng: order.destLng,
        html: circleHtml(color, isSelected ? 11 : 8, isSelected ? 3 : 2, 30),
        zIndex: isSelected ? 40 : 20,
        onClick: () => onSelectOrder(order._id),
      });
    }

    // Punto de origen de mandados (siempre que exista y no haya tienda marcada)
    for (const order of orders) {
      if (order.serviceKind !== "mandado" || order.storeLat == null || order.storeLng == null) continue;
      const pin = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="#8b5cf6" stroke="white" stroke-width="1.5"/></svg>`;
      list.push({
        id: `origin-${order._id}`,
        lat: order.storeLat,
        lng: order.storeLng,
        html: `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(pin)}" width="24" height="24" alt="" style="display:block" />`,
        anchor: "bottom",
        zIndex: 15,
        onClick: () => onSelectOrder(order._id),
      });
    }

    return list;
  }, [
    drivers,
    stores,
    orders,
    selectedDriverId,
    selectedOrderId,
    topRecDriverId,
    onSelectDriver,
    onSelectOrder,
  ]);

  const lines = useMemo<MapboxMapLine[]>(() => {
    const list: MapboxMapLine[] = [];
    if (routePath?.length) {
      list.push({ id: "dispatch-route", points: routePath, color: "#EB1902", width: 5, opacity: 0.85 });
    }
    for (const order of orders) {
      if (order.storeLat == null || order.storeLng == null || order.destLat == null || order.destLng == null) continue;
      const isSelected = order._id === selectedOrderId;
      const color = isSelected
        ? "#EB1902"
        : order.priority === "urgent"
          ? "#ef4444"
          : order.priority === "high"
            ? "#f59e0b"
            : "#0ea5e9";
      list.push({
        id: `route-${order._id}`,
        points: [
          { lat: order.storeLat, lng: order.storeLng },
          { lat: order.destLat, lng: order.destLng },
        ],
        color,
        width: isSelected ? 3.5 : 2,
        opacity: isSelected ? 0.4 : 0.45,
      });
    }
    return list;
  }, [orders, selectedOrderId, routePath]);

  const polygons = useMemo(
    () =>
      zones.map((zone) => ({
        id: zone.id,
        points: zone.coordinates,
        color: zone.color ?? "#EB1902",
        fillOpacity: 0.08,
        strokeWidth: 1.5,
      })),
    [zones]
  );

  return (
    <div className="relative h-full min-h-[180px] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[#0d1526]">
      <MapboxMap
        className="h-full w-full"
        center={DEFAULT_CENTER}
        zoom={13}
        styleUrl={dark ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT}
        markers={markers}
        lines={lines}
        polygons={polygons}
        fitPoints={fitPoints.length ? fitPoints : undefined}
        fitPadding={56}
        fitMaxZoom={14}
        onError={() => setAvailable(false)}
      />

      {!available ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-100/95 p-6 text-center dark:bg-[#0d1526]/95">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No se pudo cargar el mapa.</p>
          <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">
            Revisa la conexión y el token <code className="rounded bg-slate-200 px-1 dark:bg-white/10">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
          </p>
        </div>
      ) : null}

      {!fitPoints.length ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-500 shadow-sm dark:bg-[#0d1526]/95 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando ubicaciones en vivo…
          </span>
        </div>
      ) : null}

      {/* Overlay compacto: una sola píldora de estado. La leyenda y los
          conteos secundarios se agrupan detrás de un toggle para no competir
          con los datos operativos del mapa. */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          aria-expanded={legendOpen}
          className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white/95 px-2.5 py-1.5 text-[11px] font-bold text-[#09193B] shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0d1526]/95 dark:text-white"
        >
          <MapPin className="h-3.5 w-3.5 text-[#EB1902]" />
          {orders.length} pedidos · {drivers.filter((d) => hasLocation(d)).length} repartidores
          <ChevronDown className={cn("h-3 w-3 transition-transform", legendOpen && "rotate-180")} />
        </button>
        {legendOpen && (
          <div className="pointer-events-auto rounded-lg border border-black/[0.06] bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0d1526]/95">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {[
                { color: "bg-[#EB1902]", label: "Restaurante" },
                { color: "bg-[#8b5cf6]", label: "Mandado" },
                { color: "bg-[#10b981]", label: "Repartidor" },
                { color: "bg-[#ef4444]", label: "Urgente" },
                { color: "bg-[#f59e0b]", label: "Alta" },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span className={`h-2 w-2 rounded-full ${item.color}`} /> {item.label}
                </span>
              ))}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[10px] font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
              <Store className="h-3 w-3 text-[#EB1902]" /> {stores.length} tiendas
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
