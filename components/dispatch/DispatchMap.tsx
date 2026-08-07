"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DirectionsRenderer, GoogleMap, Marker, Polyline, Polygon, useJsApiLoader } from "@react-google-maps/api";
import { AlertTriangle, Loader2, MapPin, Store, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { estimateEtaMinutes, shortOrderCode } from "@/lib/dispatch/dispatch-format";
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

const darkMapStyles: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0d1526" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1526" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#64748b" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0b1220" }],
  },
  {
    featureType: "poi",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#334155" }],
  },
];

const lightMapStyles: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi.business",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
];

const driverColors: Record<DispatchDriverCard["estado"], string> = {
  available: "#10b981",
  busy: "#f59e0b",
  offer_pending: "#0ea5e9",
  paused: "#64748b",
  offline: "#94a3b8",
  blocked: "#ef4444",
};

function buildMapOptions(dark: boolean): google.maps.MapOptions {
  return {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: true,
    styles: dark ? darkMapStyles : lightMapStyles,
  };
}

function hasLocation(driver: DispatchDriverCard): boolean {
  return Number.isFinite(driver.lastLocation?.lat) && Number.isFinite(driver.lastLocation?.lng);
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
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "dispatch-center-map",
    googleMapsApiKey: apiKey,
  });
  const mapRef = useRef<google.maps.Map | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [routeMeta, setRouteMeta] = useState<{ distanceText?: string; durationText?: string } | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);

  // Reajustar el encuadre solo cuando cambian los CONTADOS (no cada poll),
  // para no pelear con el paneo manual del operador.
  useEffect(() => {
    setFitKey((k) => k + 1);
  }, [orders.length, stores.length, drivers.length]);

  const bounds = useMemo(() => {
    if (typeof window === "undefined" || !window.google?.maps) return null;
    const mapBounds = new window.google.maps.LatLngBounds();
    let hasPoint = false;
    for (const order of orders) {
      if (order.storeLat != null && order.storeLng != null) {
        mapBounds.extend({ lat: order.storeLat, lng: order.storeLng });
        hasPoint = true;
      }
      if (order.destLat != null && order.destLng != null) {
        mapBounds.extend({ lat: order.destLat, lng: order.destLng });
        hasPoint = true;
      }
    }
    for (const store of stores) {
      if (store.lat != null && store.lng != null) {
        mapBounds.extend({ lat: store.lat, lng: store.lng });
        hasPoint = true;
      }
    }
    for (const driver of drivers) {
      if (hasLocation(driver) && driver.lastLocation) {
        mapBounds.extend({ lat: driver.lastLocation.lat!, lng: driver.lastLocation.lng! });
        hasPoint = true;
      }
    }
    return hasPoint ? mapBounds : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, isLoaded]);

  useEffect(() => {
    if (isLoaded && mapRef.current && bounds) {
      mapRef.current.fitBounds(bounds as unknown as google.maps.LatLngBounds);
    }
  }, [isLoaded, bounds]);

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
    setDirections(null);
    setRouteMeta(null);
    if (!isLoaded || !selectedOrder) return;
    if (selectedOrder.storeLat == null || selectedOrder.storeLng == null || selectedOrder.destLat == null || selectedOrder.destLng == null) {
      return; // sin coordenadas → la UI muestra "Sin estimar"
    }
    const origin = { lat: selectedOrder.storeLat, lng: selectedOrder.storeLng };
    const destination = { lat: selectedOrder.destLat, lng: selectedOrder.destLng };
    const driverLoc = selectedDriver?.lastLocation;
    const useDriver = driverLoc && Number.isFinite(driverLoc.lat) && Number.isFinite(driverLoc.lng);
    const request: google.maps.DirectionsRequest = {
      origin: useDriver ? { lat: driverLoc.lat!, lng: driverLoc.lng! } : origin,
      destination,
      travelMode: google.maps.TravelMode.DRIVING,
      ...(useDriver ? { waypoints: [{ location: origin, stopover: true }] } : {}),
    };
    let cancelled = false;
    new google.maps.DirectionsService().route(request, (result, status) => {
      if (cancelled) return;
      if (status === "OK" && result) {
        setDirections(result);
        const leg = result.routes[0]?.legs[0];
        if (leg) {
          setRouteMeta({ distanceText: leg.distance?.text, durationText: leg.duration?.text });
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, routeKey]);

  const eta = estimateEtaMinutes(selectedOrder?.routeKm ?? null);
  const routeLabel =
    routeMeta?.distanceText && routeMeta.durationText
      ? `${routeMeta.distanceText} · ${routeMeta.durationText}`
      : selectedOrder?.routeKm != null
        ? `~${selectedOrder.routeKm} km · ~${eta ?? "—"} min (estimado)`
        : "Sin estimar";

  const topRecDriverId = recommendations[0]?.driver._id;

  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl border border-black/6 bg-slate-100 shadow-[0_1px_3px_rgba(9,25,59,0.06)] dark:border-white/10 dark:bg-[#0d1526]">
      {loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No se pudo cargar el mapa.</p>
          <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">
            Revisa la clave <code className="rounded bg-slate-200 px-1 dark:bg-white/10">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>.
          </p>
        </div>
      ) : !isLoaded ? (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Cargando mapa de operaciones…</p>
        </div>
      ) : (
        <GoogleMap
          mapContainerStyle={{ width: "100%", height: "100%" }}
          center={DEFAULT_CENTER}
          zoom={13}
          options={buildMapOptions(dark)}
          onLoad={onLoad}
          onUnmount={onUnmount}
        >
          {/* Zonas de reparto */}
          {zones.map((zone) => (
            <Polygon
              key={zone.id}
              paths={zone.coordinates.map((c) => ({ lat: c.lat, lng: c.lng }))}
              options={{
                fillColor: zone.color ?? "#EB1902",
                fillOpacity: 0.08,
                strokeColor: zone.color ?? "#EB1902",
                strokeOpacity: 0.6,
                strokeWeight: 1.5,
                clickable: false,
              }}
            />
          ))}

          {/* Repartidores (solo si reportaron ubicación; datos reales) */}
          {drivers.map((driver) => {
            if (!hasLocation(driver) || !driver.lastLocation) return null;
            const isSelected = driver._id === selectedDriverId;
            const isTopRec = driver._id === topRecDriverId;
            const color = driverColors[driver.estado];
            const size = isSelected ? 15 : isTopRec ? 13 : 10;
            return (
              <Marker
                key={`driver-${driver._id}`}
                position={{ lat: driver.lastLocation.lat!, lng: driver.lastLocation.lng! }}
                onClick={() => onSelectDriver(driver._id)}
                title={`${driver.name} (${driver.estado})`}
                icon={{
                  url:
                    "data:image/svg+xml;charset=UTF-8," +
                    encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="${size}" fill="${color}" stroke="white" stroke-width="${isSelected ? 4 : 2.5}"/></svg>`
                    ),
                  anchor: { x: 17, y: 17 } as google.maps.Point,
                }}
                zIndex={isSelected ? 45 : isTopRec ? 35 : 25}
              />
            );
          })}

          {/* Ruta sugerida (Google Directions cuando hay datos; si no, línea recta) */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: true,
                polylineOptions: {
                  strokeColor: "#EB1902",
                  strokeWeight: 5,
                  strokeOpacity: 0.85,
                  zIndex: 50,
                },
              }}
            />
          )}

          {/* Rutas de pedidos (línea recta de referencia) */}
          {orders.map((order) => {
            if (order.storeLat == null || order.storeLng == null || order.destLat == null || order.destLng == null) return null;
            const isSelected = order._id === selectedOrderId;
            const color = isSelected
              ? "#EB1902"
              : order.priority === "urgent"
                ? "#ef4444"
                : order.priority === "high"
                  ? "#f59e0b"
                  : "#0ea5e9";
            return (
              <Polyline
                key={`route-${order._id}`}
                path={[
                  { lat: order.storeLat, lng: order.storeLng },
                  { lat: order.destLat, lng: order.destLng },
                ]}
                options={{
                  strokeColor: color,
                  strokeOpacity: isSelected ? 0.4 : 0.45,
                  strokeWeight: isSelected ? 3.5 : 2,
                  zIndex: isSelected ? 20 : 5,
                }}
              />
            );
          })}

          {/* Restaurantes / puntos de origen */}
          {stores.map((store) => (
            <Marker
              key={store._id}
              position={{ lat: store.lat!, lng: store.lng! }}
              icon={{
                url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="#EB1902" stroke="white" stroke-width="2.5"/></svg>`
                ),
                anchor: { x: 14, y: 14 } as google.maps.Point,
              }}
              title={store.name}
              zIndex={30}
            />
          ))}

          {/* Ordenes: destino del cliente */}
          {orders.map((order) => {
            if (order.destLat == null || order.destLng == null) return null;
            const isSelected = order._id === selectedOrderId;
            const color =
              order.serviceKind === "mandado" ? "#8b5cf6" : order.priority === "urgent" ? "#ef4444" : order.priority === "high" ? "#f59e0b" : "#0ea5e9";
            return (
              <Marker
                key={order._id}
                position={{ lat: order.destLat, lng: order.destLng }}
                onClick={() => onSelectOrder(order._id)}
                icon={{
                  url:
                    "data:image/svg+xml;charset=UTF-8," +
                    encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><circle cx="15" cy="15" r="${isSelected ? 11 : 8}" fill="${color}" stroke="white" stroke-width="${isSelected ? 3 : 2}"/></svg>`
                    ),
                  anchor: { x: 15, y: 15 } as google.maps.Point,
                }}
                zIndex={isSelected ? 40 : 20}
              />
            );
          })}

          {/* Punto de origen de mandados (siempre que exista y no haya tienda marcada) */}
          {orders
            .filter((o) => o.serviceKind === "mandado" && o.storeLat != null && o.storeLng != null)
            .map((order) => (
              <Marker
                key={`origin-${order._id}`}
                position={{ lat: order.storeLat!, lng: order.storeLng! }}
                onClick={() => onSelectOrder(order._id)}
                icon={{
                  url:
                    "data:image/svg+xml;charset=UTF-8," +
                    encodeURIComponent(
                      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z" fill="#8b5cf6" stroke="white" stroke-width="1.5"/></svg>`
                    ),
                  anchor: { x: 12, y: 22 } as google.maps.Point,
                }}
                zIndex={15}
              />
            ))}
        </GoogleMap>
      )}

      {/* Overlay superior: leyenda y conteo */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-1.5">
        <div className="pointer-events-auto rounded-lg border border-black/6 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0d1526]/95">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-[#09193B] dark:text-white">
            <MapPin className="h-3.5 w-3.5 text-[#EB1902]" />
            {orders.length} pedidos activos
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-[#EB1902]" /> Restaurante
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" /> Mandado
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-[#10b981]" /> Repartidor
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-[#ef4444]" /> Urgente
            </span>
            <span className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Alta
            </span>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-black/6 bg-white/95 px-2.5 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0d1526]/95 dark:text-slate-400">
          <Store className="h-3 w-3 text-[#EB1902]" />
          {stores.length} tiendas
        </div>
        {drivers.some((d) => hasLocation(d)) && (
          <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-black/6 bg-white/95 px-2.5 py-1.5 text-[10px] font-medium text-slate-500 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#0d1526]/95 dark:text-slate-400">
            <Truck className="h-3 w-3 text-[#10b981]" />
            {drivers.filter((d) => hasLocation(d)).length} con ubicación
          </div>
        )}
      </div>

      {/* Detalle del pedido seleccionado */}
      {selectedOrder && (
        <div className="absolute bottom-3 left-3 z-10 max-w-xs rounded-xl border border-black/6 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#0d1526]/95">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[#EB1902]">Pedido #{shortOrderCode(selectedOrder.orderNumber)}</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                selectedOrder.serviceKind === "mandado"
                  ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"
                  : "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"
              )}
            >
              {selectedOrder.serviceKind === "mandado" ? "Mandado" : "Restaurante"}
            </span>
            <button
              type="button"
              onClick={() => onSelectOrder("")}
              className="ml-auto text-[10px] font-semibold text-slate-400 hover:text-slate-600"
            >
              Cerrar
            </button>
          </div>
          <p className="mt-1.5 text-xs font-semibold text-[#09193B] dark:text-white">{selectedOrder.storeName}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{selectedOrder.destLabel}</p>
          <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
            Ruta: {routeLabel} · ${selectedOrder.totalPrice.toFixed(2)} · {selectedOrder.paymentLabel}
          </p>
          {selectedDriver && (
            <p className="mt-1 flex items-center gap-1.5 rounded-md bg-[#EB1902]/[0.07] px-2 py-1 text-[10px] font-semibold text-[#EB1902]">
              <Truck className="h-3 w-3 shrink-0" />
              Repartidor: {selectedDriver.name}
              {hasLocation(selectedDriver) ? " (ubicación marcada)" : " · Ubicación no disponible"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
