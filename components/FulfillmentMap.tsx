"use client";

import { CustomerAddress } from "@/lib/customer-address";
import { MapPin } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MapboxMap, type MapboxMapLine, type MapboxMapMarker } from "./map/MapboxMap";
import {
  mapboxDirections,
  mapboxForwardGeocode,
  type MapboxPoint,
} from "@/lib/mapbox";

type Point = MapboxPoint;
type RouteMode = "DRIVING" | "WALKING";
type RouteResult = { path: Point[]; mode: RouteMode };

const point = (value: any): Point | null => {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
    ? { lat: latitude, lng: longitude }
    : null;
};

const geocode = async (address: string): Promise<Point | null> => {
  const [match] = await mapboxForwardGeocode(address, { limit: 1, country: "mx", language: "es" });
  return match ? { lat: match.latitude, lng: match.longitude } : null;
};

const currentLocation = () =>
  new Promise<Point>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Tu dispositivo no permite obtener la ubicación"));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      () => reject(new Error("Permite tu ubicación para mostrar la ruta hacia la sucursal")),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
    );
  });

const withTimeout = <T,>(promise: Promise<T>, milliseconds: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Tiempo de espera agotado")), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });

const routePath = async (origin: Point, destination: Point): Promise<RouteResult | null> => {
  const driving = await withTimeout(
    mapboxDirections(origin, destination, { profile: "driving-traffic", language: "es", steps: false }),
    6000
  ).catch(() => null);
  if (driving?.path.length) return { path: driving.path, mode: "DRIVING" };

  const walking = await withTimeout(
    mapboxDirections(origin, destination, { profile: "walking", language: "es", steps: false }),
    5000
  ).catch(() => null);
  return walking?.path.length ? { path: walking.path, mode: "WALKING" } : null;
};

/** Enlace externo de ruta (OpenStreetMap, sin API key) para el respaldo. */
const externalRoute = (origin: Point, destination: Point) =>
  `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${origin.lat}%2C${origin.lng}%3B${destination.lat}%2C${destination.lng}`;

export function FulfillmentMap({
  type,
  customerAddress,
  store,
}: {
  type: "delivery" | "pickup";
  customerAddress: CustomerAddress | null;
  store: any;
}) {
  const [error, setError] = useState("");
  const [routeStatus, setRouteStatus] = useState<"loading" | "ready" | "external">(
    type === "pickup" ? "loading" : "ready"
  );
  const [routeMode, setRouteMode] = useState<RouteMode>("DRIVING");
  const [routeHref, setRouteHref] = useState("");
  const [customerPoint, setCustomerPoint] = useState<Point | null>(null);
  const [storePoint, setStorePoint] = useState<Point | null>(null);
  const [routeLine, setRouteLine] = useState<Point[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const render = async () => {
      try {
        setError("");
        setRouteLine(null);
        setStorePoint(null);
        setRouteHref("");
        setRouteStatus(type === "pickup" ? "loading" : "ready");
        if (type === "delivery" && !customerAddress) throw new Error("Sin dirección de entrega");

        const start =
          type === "pickup"
            ? await currentLocation()
            : point(customerAddress) ||
              (await withTimeout(geocode(customerAddress!.formattedAddress), 5000).catch(() => null));
        if (!start || cancelled) throw new Error("Sin coordenadas");
        setCustomerPoint(start);

        if (type !== "pickup") return;

        const storeAddress = [
          store?.storeAddress,
          store?.summary?.address,
          store?.store?.address?.street,
          store?.store?.address?.city,
        ].filter(Boolean).join(", ");
        const target =
          point(store?.store?.coordinates) ||
          point(store?.coordinates) ||
          (storeAddress ? await withTimeout(geocode(storeAddress), 5000).catch(() => null) : null);

        if (cancelled) return;
        if (!target) {
          setRouteStatus("external");
          setRouteHref(storeAddress ? externalRoute(start, { lat: start.lat, lng: start.lng }) : "");
          return;
        }

        setStorePoint(target);
        setRouteHref(externalRoute(start, target));

        const result = await withTimeout(routePath(start, target), 9000).catch(() => null);
        if (cancelled) return;
        if (!result) {
          setRouteStatus("external");
          return;
        }
        setRouteMode(result.mode);
        setRouteLine(result.path);
        setRouteStatus("ready");
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Vista del mapa no disponible");
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [customerAddress, store, type]);

  const markers = useMemo<MapboxMapMarker[]>(() => {
    const list: MapboxMapMarker[] = [];
    if (customerPoint) {
      list.push({
        id: "customer",
        lat: customerPoint.lat,
        lng: customerPoint.lng,
        color: "#2563EB",
        title: type === "delivery" ? "Punto de entrega" : "Tu ubicación",
      });
    }
    if (storePoint) {
      list.push({
        id: "store",
        lat: storePoint.lat,
        lng: storePoint.lng,
        color: "#EF4444",
        title: "Sucursal de retiro",
      });
    }
    return list;
  }, [customerPoint, storePoint, type]);

  const lines = useMemo<MapboxMapLine[]>(
    () =>
      routeLine
        ? [{ id: "fulfillment-route", points: routeLine, color: "#111827", width: 3, dashed: true }]
        : [],
    [routeLine]
  );

  const fitPoints = useMemo(
    () => [customerPoint, storePoint].filter((value): value is Point => Boolean(value)),
    [customerPoint, storePoint]
  );

  if (error) {
    return (
      <div className="flex h-36 items-center justify-center gap-2 rounded-xl bg-gray-100 text-sm text-gray-500">
        <MapPin className="h-4 w-4" /> {error}
      </div>
    );
  }

  return (
    <div
      className="relative h-36 overflow-hidden rounded-xl bg-gray-100"
      aria-label={type === "pickup" ? "Ruta hacia la sucursal" : "Punto de entrega"}
    >
      <MapboxMap
        className="h-full w-full"
        center={customerPoint ?? { lat: 20.502, lng: -100.145 }}
        zoom={16}
        markers={markers}
        lines={lines}
        fitPoints={fitPoints.length > 1 ? fitPoints : undefined}
        fitPadding={42}
      />
      <div className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow">
        {type === "pickup"
          ? routeStatus === "ready"
            ? routeMode === "DRIVING"
              ? "Ruta en auto hacia la sucursal"
              : "Ruta a pie · verifica banquetas"
            : routeStatus === "loading"
              ? "Calculando ruta por calles…"
              : routeHref
                ? <a href={routeHref} target="_blank" rel="noreferrer" className="text-[#eb1902] underline">
                    Abrir ruta en el mapa
                  </a>
                : "Selecciona una dirección para trazar la ruta"
          : "Entregaremos en este punto"}
      </div>
    </div>
  );
}
