"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Search } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { MapboxMap, type MapboxMapMarker } from "./map/MapboxMap";
import { mapboxReverseGeocode } from "@/lib/mapbox";
import type { MandadoAddressPoint } from "@/lib/mandado";

type AddressSuggestion = MandadoAddressPoint;

const defaultCenter = { lat: 20.502, lng: -100.145 };

/** Pin negro del proyecto (mismo trazo que usa el flujo de mandados). */
const PICKER_PIN = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24"><path fill="#09193B" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="3.2" fill="none" stroke="#ffffff" stroke-width="1.5"/></svg>'
)}`;

export default function MandadoLocationPicker({
  label,
  initialValue,
  onChange,
}: {
  label: string;
  initialValue?: MandadoAddressPoint | null;
  onChange: (point: MandadoAddressPoint) => void;
}) {
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
    if (input.trim().length < 3 || skipPrediction.current) {
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
  }, [input]);

  // Punto elegido en el mapa: se pinta al instante y la dirección exacta se
  // resuelve con geocodificación inversa de Mapbox (no bloquea la UI).
  const choosePoint = useCallback(async (position: { lat: number; lng: number }, address?: string) => {
    const fallback = address || "Punto seleccionado en el mapa";
    const next = { label: fallback, ...position };
    setPoint(next);
    setInput(fallback);
    setPredictions([]);
    setError("");
    onChange(next);

    if (address) return;

    const resolved = await mapboxReverseGeocode(position.lat, position.lng);
    if (!mounted.current || !resolved?.fullAddress) return;
    skipPrediction.current = true;
    const resolvedPoint = { ...next, label: resolved.fullAddress };
    setPoint(resolvedPoint);
    setInput(resolved.fullAddress);
    onChange(resolvedPoint);
  }, [onChange]);

  const choosePrediction = (prediction: AddressSuggestion) => {
    void choosePoint(prediction, prediction.label);
  };

  const searchAddress = async (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(input)}`);
      const results: AddressSuggestion[] = response.ok ? await response.json() : [];
      const match = results[0];
      if (!match) {
        setError("No encontramos esa dirección. Agrega calle, número y colonia.");
        return;
      }
      await choosePoint(match, match.label);
    } catch {
      setError("No pudimos buscar la dirección. Intenta de nuevo.");
    } finally {
      if (mounted.current) setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError("Tu dispositivo no permite compartir la ubicación.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        void choosePoint({ lat: coords.latitude, lng: coords.longitude });
      },
      () => {
        setLocating(false);
        setError("Activa el permiso de ubicación o selecciona el punto directamente en el mapa.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const center = point ? { lat: point.lat, lng: point.lng } : defaultCenter;

  const markers = useMemo<MapboxMapMarker[]>(
    () =>
      point
        ? [
            {
              id: "mandado-picker",
              lat: point.lat,
              lng: point.lng,
              html: `<img src="${PICKER_PIN}" width="42" height="42" alt="" style="display:block" />`,
              draggable: true,
              anchor: "bottom",
              onDragEnd: (next) => void choosePoint(next),
            },
          ]
        : [],
    [point, choosePoint]
  );

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
            />
          </div>
          <Button type="submit" size="icon" aria-label="Buscar dirección" disabled={searching || !input.trim()} className="h-12 w-12 rounded-xl bg-[#09193B] hover:bg-[#162d5c]">
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

      <Button type="button" variant="outline" onClick={useMyLocation} disabled={locating} className="h-11 w-full rounded-xl border-[#eb1901] text-[#eb1901] hover:bg-rose-50 hover:text-[#eb1901]">
        {locating ? <Loader2 className="animate-spin" /> : <Crosshair />} Usar mi ubicación
      </Button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <MapboxMap
          className="h-[300px] w-full"
          center={center}
          zoom={point ? 17 : 14}
          markers={markers}
          onClick={(next) => void choosePoint(next)}
        />
      </div>

      <p className="text-center text-xs text-slate-500">Toca el mapa o arrastra el pin para ajustar el punto exacto.</p>
      {point ? <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">✓ {point.label}</p> : null}
      {error ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p> : null}
    </div>
  );
}
