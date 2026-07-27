"use client";

import { CustomerAddress } from "@/lib/customer-address";
import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Point = { lat: number; lng: number };

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callback}`;
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
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let animation = 0;
    let route: any;
    let markers: any[] = [];

    const render = async () => {
      try {
        await loadMaps();
        if (cancelled || !container.current || !customerAddress) return;

        const destination =
          point(customerAddress) || (await geocode(customerAddress.formattedAddress));
        if (!destination || cancelled) throw new Error("Sin coordenadas");

        const maps: any = window.google.maps;
        const map = new maps.Map(container.current, {
          center: destination,
          zoom: 16,
          disableDefaultUI: true,
          gestureHandling: "cooperative",
        });

        markers.push(new maps.Marker({
          position: destination,
          map,
          title: type === "delivery" ? "Punto de entrega" : "Tu ubicación",
          icon: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
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
            (storeAddress ? await geocode(storeAddress) : null);

          if (storePoint && !cancelled) {
            markers.push(new maps.Marker({
              position: storePoint,
              map,
              title: "Sucursal de retiro",
              icon: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            }));
            const bounds = new maps.LatLngBounds();
            bounds.extend(destination);
            bounds.extend(storePoint);
            map.fitBounds(bounds, 42);

            route = new maps.Polyline({
              path: [destination, storePoint],
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
            let offset = 0;
            animation = window.setInterval(() => {
              offset = (offset + 1) % 100;
              const icons = route.get("icons");
              icons[0].offset = `${offset}%`;
              route.set("icons", icons);
            }, 45);
          }
        }
      } catch {
        if (!cancelled) setError(true);
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
        <MapPin className="h-4 w-4" /> Vista del mapa no disponible
      </div>
    );
  }

  return (
    <div
      className="relative h-36 overflow-hidden rounded-xl bg-gray-100"
      aria-label={type === "pickup" ? "Ruta hacia la sucursal" : "Punto de entrega"}
    >
      <Loader2 className="absolute left-1/2 top-1/2 h-5 w-5 animate-spin text-gray-400" />
      <div ref={container} className="relative h-full w-full" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow">
        {type === "pickup" ? "Tú pasarás por tu pedido" : "Entregaremos en este punto"}
      </div>
    </div>
  );
}
