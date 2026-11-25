"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { mapboxForwardGeocode } from "@/lib/mapbox";

interface SimpleAddressInputFixedProps {
  onAddressSelected: (addressData: {
    formatted_address: string;
    address: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude: number;
    longitude: number;
  }) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Compatibilidad: ya no se usa (Mapbox usa el token público del proyecto). */
  apiKey?: string;
}

type Suggestion = {
  formatted_address: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  latitude: number;
  longitude: number;
};

export default function SimpleAddressInputFixed({
  onAddressSelected,
  placeholder = "Escribe tu dirección",
  disabled = false,
}: SimpleAddressInputFixedProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const skipPrediction = useRef(false);

  // Sugerencias de Mapbox (México) con retardo para no consultar por tecla.
  useEffect(() => {
    const text = inputValue.trim();
    if (skipPrediction.current) {
      skipPrediction.current = false;
      return;
    }
    if (text.length < 3) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const results = await mapboxForwardGeocode(text, {
        limit: 5,
        country: "mx",
        language: "es",
      });
      if (cancelled) return;
      setSuggestions(
        results.map((result) => ({
          formatted_address: result.fullAddress || result.label,
          address: result.street || result.fullAddress,
          city: result.city,
          state: result.state,
          postal_code: result.postalCode,
          country: result.country || "México",
          latitude: result.latitude,
          longitude: result.longitude,
        }))
      );
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [inputValue]);

  const choose = (suggestion: Suggestion) => {
    skipPrediction.current = true;
    setInputValue(suggestion.formatted_address);
    setSuggestions([]);
    onAddressSelected(suggestion);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = inputValue.trim();
    if (text.length < 3) return;
    if (suggestions[0]) {
      choose(suggestions[0]);
      return;
    }
    setLoading(true);
    const [match] = await mapboxForwardGeocode(text, {
      limit: 1,
      country: "mx",
      language: "es",
    });
    setLoading(false);
    if (!match) return;
    choose({
      formatted_address: match.fullAddress || match.label,
      address: match.street || match.fullAddress,
      city: match.city,
      state: match.state,
      postal_code: match.postalCode,
      country: match.country || "México",
      latitude: match.latitude,
      longitude: match.longitude,
    });
  };

  return (
    <div className="relative">
      <form onSubmit={submit} className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
      </form>

      {suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl">
          {suggestions.map((suggestion) => (
            <button
              key={`${suggestion.latitude}-${suggestion.longitude}`}
              type="button"
              onClick={() => choose(suggestion)}
              className="flex w-full items-start gap-2 border-b border-gray-100 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-blue-50"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              <span>{suggestion.formatted_address}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
