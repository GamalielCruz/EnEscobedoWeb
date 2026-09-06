"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { MandadoAddressPoint } from "@/lib/mandado";

type AddressSuggestion = MandadoAddressPoint;

const defaultCenter = { lat: 20.502, lng: -100.145 };

export default function MandadoLocationPicker({
  label,
  initialValue,
  onChange,
}: {
  label: string;
  initialValue?: MandadoAddressPoint | null;
  onChange: (point: MandadoAddressPoint) => void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "mandado-google-maps",
    googleMapsApiKey: apiKey,
  });
  const [input, setInput] = useState(initialValue?.label || "");
  const [point, setPoint] = useState<MandadoAddressPoint | null>(initialValue || null);
  const [predictions, setPredictions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const skipPrediction = useRef(false);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  useEffect(() => {
    if (!isLoaded || input.trim().length < 3 || skipPrediction.current) {
      skipPrediction.current = false;
      setPredictions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(input)}`, { signal: controller.signal });
        setPredictions(response.ok ? await response.json() : []);
      } catch {
        if (!controller.signal.aborted) setPredictions([]);
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [input, isLoaded]);

  const choosePoint = (position: google.maps.LatLngLiteral, address?: string) => {
    const fallback = address || "Punto seleccionado en el mapa";
    const next = { label: fallback, ...position };
    setPoint(next);
    setInput(fallback);
    setPredictions([]);
    setError("");
    onChange(next);

    new google.maps.Geocoder().geocode({ location: position }, (results, status) => {
      if (!mounted.current) return;
      const resolved = status === "OK" ? results?.[0]?.formatted_address : null;
      if (!resolved) return;
      skipPrediction.current = true;
      const resolvedPoint = { ...next, label: resolved };
      setPoint(resolvedPoint);
      setInput(resolved);
      onChange(resolvedPoint);
    });
  };

  const choosePrediction = (prediction: AddressSuggestion) => choosePoint(prediction, prediction.label);

  const searchAddress = (event: FormEvent) => {
    event.preventDefault();
    if (!isLoaded || !input.trim()) return;
    setSearching(true);
    new google.maps.Geocoder().geocode({ address: input, region: "mx" }, (results, status) => {
      if (!mounted.current) return;
      setSearching(false);
      const result = status === "OK" ? results?.[0] : null;
      const location = result?.geometry.location;
      if (!location) return setError("No encontramos esa dirección. Agrega calle, número y colonia.");
      choosePoint({ lat: location.lat(), lng: location.lng() }, result.formatted_address);
    });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError("Tu dispositivo no permite compartir la ubicación.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        choosePoint({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        setLocating(false);
        setError("Activa el permiso de ubicación o selecciona el punto directamente en el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  if (loadError || !apiKey) {
    return <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">No pudimos cargar el mapa. Intenta de nuevo en unos minutos.</p>;
  }

  return (
    <div className="space-y-4">
      <form onSubmit={searchAddress} className="relative space-y-2">
        <Label htmlFor="mandado-address">{label}</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <MapPin className="absolute left-3 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              id="mandado-address"
              value={input}
              onChange={(event) => {
                skipPrediction.current = false;
                setInput(event.target.value);
                setError("");
              }}
              placeholder="Calle, número y colonia"
              autoComplete="off"
              className="h-12 rounded-xl pl-10 text-base"
              disabled={!isLoaded}
            />
          </div>
          <Button type="submit" size="icon" aria-label="Buscar dirección" disabled={!isLoaded || searching || !input.trim()} className="h-12 w-12 rounded-xl bg-[#09193B] hover:bg-[#162d5c]">
            {searching ? <Loader2 className="animate-spin" /> : <Search />}
          </Button>
        </div>

        {predictions.length ? (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            {predictions.slice(0, 5).map((prediction) => (
              <button
                key={`${prediction.lat}-${prediction.lng}`}
                type="button"
                onClick={() => choosePrediction(prediction)}
                className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 hover:bg-rose-50"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#eb1901]" />
                <span>{prediction.label}</span>
              </button>
            ))}
          </div>
        ) : null}
      </form>

      <Button type="button" variant="outline" onClick={useMyLocation} disabled={!isLoaded || locating} className="h-11 w-full rounded-xl border-[#eb1901] text-[#eb1901] hover:bg-rose-50 hover:text-[#eb1901]">
        {locating ? <Loader2 className="animate-spin" /> : <Crosshair />} Usar mi ubicación
      </Button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "300px" }}
            center={point || defaultCenter}
            zoom={point ? 17 : 14}
            onClick={(event) => {
              const lat = event.latLng?.lat();
              const lng = event.latLng?.lng();
              if (lat != null && lng != null) choosePoint({ lat, lng });
            }}
            options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: "greedy", clickableIcons: false }}
          >
            {point ? (
              <Marker
                position={point}
                draggable
                onDragEnd={(event) => {
                  const lat = event.latLng?.lat();
                  const lng = event.latLng?.lng();
                  if (lat != null && lng != null) choosePoint({ lat, lng });
                }}
              />
            ) : null}
          </GoogleMap>
        ) : (
          <div className="flex h-[300px] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="animate-spin" /> Cargando mapa…</div>
        )}
      </div>

      <p className="text-center text-xs text-slate-500">Toca el mapa o arrastra el pin para ajustar el punto exacto.</p>
      {point ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {point.label}</p> : null}
      {error ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
    </div>
  );
}
