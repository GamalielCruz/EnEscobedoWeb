"use client";

import { CustomerAddress } from "@/lib/customer-address";
import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };
type RouteMode = "DRIVING" | "WALKING" | "TWO_WHEELER";
type RouteResult = { path: any[]; mode: RouteMode };

const point = (value: any): Point | null => {
  const latitude = Number(value?.latitude ?? value?.lat);
  const longitude = Number(value?.longitude ?? value?.lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude !== 0 && longitude !== 0
    ? { lat: latitude, lng: longitude }
    : null;
};

const loadMaps = () =>
  new Promise<void>((resolve, reject) => {
    if (window.google?.maps) return resolve();
    const existing = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existing) {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (window.google?.maps) {
          window.clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 10000) {
          window.clearInterval(timer);
          reject(new Error("Google Maps no respondió"));
        }
      }, 100);
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return reject(new Error("Google Maps no está configurado"));
    const callback = `initFulfillmentMap_${Date.now()}`;
    (window as any)[callback] = () => {
      delete (window as any)[callback];
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&callback=${callback}`;
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  });

const geocode = (address: string) =>
  new Promise<Point | null>((resolve) => {
    new window.google.maps.Geocoder().geocode({ address }, (results, status) => {
      const location = status === "OK" ? results?.[0]?.geometry.location : null;
      resolve(location ? { lat: location.lat(), lng: location.lng() } : null);
    });
  });

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

const directionsPath = (origin: Point, destination: Point, mode: "DRIVING" | "WALKING") =>
  new Promise<any[] | null>((resolve) => {
    const maps: any = window.google.maps;
    new maps.DirectionsService().route(
      { origin, destination, travelMode: maps.TravelMode[mode] },
      (result: any, status: string) => {
        const path = status === "OK" ? result?.routes?.[0]?.overview_path : null;
        resolve(Array.isArray(path) && path.length > 1 ? path : null);
      }
    );
  });

const motorcyclePath = async (origin: Point, destination: Point) => {
  const { Route } = await window.google.maps.importLibrary("routes") as any;
  const { routes } = await Route.computeRoutes({
    origin,
    destination,
    travelMode: "TWO_WHEELER",
    fields: ["path"],
  });
  const path = routes?.[0]?.path;
  return Array.isArray(path) && path.length > 1 ? path : null;
};

const openStreetMapPath = async (origin: Point, destination: Point) => {
  // ponytail: respaldo vial mientras la clave de Google no tenga Routes API autorizada.
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`
  );
  if (!response.ok) return null;
  const data = await response.json();
  const coordinates = data?.routes?.[0]?.geometry?.coordinates;
  return Array.isArray(coordinates) && coordinates.length > 1
    ? coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }))
    : null;
};

const routePath = async (origin: Point, destination: Point): Promise<RouteResult | null> => {
  const driving = await withTimeout(directionsPath(origin, destination, "DRIVING"), 2500).catch(() => null);
  if (driving) return { path: driving, mode: "DRIVING" };

  const roadPath = await withTimeout(openStreetMapPath(origin, destination), 5000).catch(() => null);
  if (roadPath) return { path: roadPath, mode: "DRIVING" };

  const walking = await withTimeout(directionsPath(origin, destination, "WALKING"), 3500).catch(() => null);
  if (walking) return { path: walking, mode: "WALKING" };

  const motorcycle = await withTimeout(motorcyclePath(origin, destination), 3500).catch(() => null);
  return motorcycle ? { path: motorcycle, mode: "TWO_WHEELER" } : null;
};

export function FulfillmentMap({
  type,
  customerAddress,
  store,
}: {
  type: "delivery" | "pickup";
  customerAddress: CustomerAddress | null;
  store: any;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [routeStatus, setRouteStatus] = useState<"loading" | "ready" | "external">(
    type === "pickup" ? "loading" : "ready"
  );
  const [routeMode, setRouteMode] = useState<RouteMode>("DRIVING");
  const [routeHref, setRouteHref] = useState("");

  useEffect(() => {
    let cancelled = false;
    let animation = 0;
    let route: any;
    let markers: any[] = [];

    const render = async () => {
      try {
        setError("");
        setRouteStatus(type === "pickup" ? "loading" : "ready");
        setRouteHref("");
        await loadMaps();
        if (cancelled || !container.current) return;
        if (type === "delivery" && !customerAddress) throw new Error("Sin dirección de entrega");

        const customerPoint =
          type === "pickup"
            ? await currentLocation()
            : point(customerAddress) ||
              (await withTimeout(geocode(customerAddress!.formattedAddress), 5000).catch(() => null));
        if (!customerPoint || cancelled) throw new Error("Sin coordenadas");

        const maps: any = window.google.maps;
        const map = new maps.Map(container.current, {
          center: customerPoint,
          zoom: 16,
          disableDefaultUI: true,
          gestureHandling: "cooperative",
        });

        markers.push(new maps.Marker({
          position: customerPoint,
          map,
          title: type === "delivery" ? "Punto de entrega" : "Tu ubicación",
          icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
        }));

        if (type === "pickup") {
          const storeAddress = [
            store?.storeAddress,
            store?.summary?.address,
            store?.store?.address?.street,
            store?.store?.address?.city,
          ].filter(Boolean).join(", ");
          const storePoint =
            point(store?.store?.coordinates) ||
            point(store?.coordinates) ||
            (storeAddress
              ? await withTimeout(geocode(storeAddress), 5000).catch(() => null)
              : null);

          if (storeAddress) {
            const directionsUrl = new URL("https://www.google.com/maps/dir/");
            directionsUrl.searchParams.set("api", "1");
            directionsUrl.searchParams.set("origin", `${customerPoint.lat},${customerPoint.lng}`);
            directionsUrl.searchParams.set("destination", storeAddress);
            directionsUrl.searchParams.set("travelmode", "driving");
            setRouteHref(directionsUrl.toString());
          }

          if (storePoint && !cancelled) {
            const directionsUrl = new URL("https://www.google.com/maps/dir/");
            directionsUrl.searchParams.set("api", "1");
            directionsUrl.searchParams.set("origin", `${customerPoint.lat},${customerPoint.lng}`);
            directionsUrl.searchParams.set("destination", `${storePoint.lat},${storePoint.lng}`);
            directionsUrl.searchParams.set("travelmode", "driving");
            setRouteHref(directionsUrl.toString());

            markers.push(new maps.Marker({
              position: storePoint,
              map,
              title: "Sucursal de retiro",
              icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
            }));

            const result = await withTimeout(routePath(customerPoint, storePoint), 9000).catch(() => null);
            const bounds = new maps.LatLngBounds();
            (result?.path ?? [customerPoint, storePoint]).forEach((location: Point) => bounds.extend(location));
            map.fitBounds(bounds, 42);

            if (!result || cancelled) {
              if (!cancelled) setRouteStatus("external");
              return;
            }

            route = new maps.Polyline({
              path: result.path,
              strokeOpacity: 0,
              icons: [{
                icon: {
                  path: maps.SymbolPath.CIRCLE,
                  scale: 3,
                  fillColor: "#111827",
                  fillOpacity: 1,
                  strokeOpacity: 0,
                },
                offset: "0%",
                repeat: "18px",
              }],
              map,
            });
            setRouteMode(result.mode);
            setRouteStatus("ready");
            let offset = 0;
            animation = window.setInterval(() => {
              offset = (offset + 1) % 100;
              const icons = route.get("icons");
              icons[0].offset = `${offset}%`;
              route.set("icons", icons);
            }, 45);
          } else if (!cancelled) {
            setRouteStatus("external");
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Vista del mapa no disponible");
        }
      }
    };

    render();
    return () => {
      cancelled = true;
      window.clearInterval(animation);
      route?.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
      markers = [];
    };
  }, [customerAddress, store, type]);

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
      <div ref={container} className="relative h-full w-full" />
      <div className="absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow">
        {type === "pickup"
          ? routeStatus === "ready"
            ? routeMode === "DRIVING"
              ? "Ruta en auto hacia la sucursal"
              : routeMode === "WALKING"
                ? "Ruta a pie · verifica banquetas"
                : "Ruta en moto · verifica el trayecto"
            : routeStatus === "loading"
              ? "Calculando ruta por calles…"
              : routeHref
                ? <a href={routeHref} target="_blank" rel="noreferrer" className="text-[#eb1902] underline">
                    Abrir ruta en Google Maps
                  </a>
                : "Selecciona una dirección para trazar la ruta"
          : "Entregaremos en este punto"}
      </div>
    </div>
  );
}
