"use client";

import { useCallback, useMemo, useState } from "react";
import { MapPin, Navigation, Check, X } from "lucide-react";
import { MapboxMap, type MapboxMapMarker } from "./map/MapboxMap";
import { mapboxReverseGeocode } from "@/lib/mapbox";

interface LocationData {
  formatted_address?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

interface InteractiveLocationPickerProps {
  /** Compatibilidad: ya no se usa (Mapbox usa el token público del proyecto). */
  apiKey?: string;
  initialLocation?: LocationData;
  onLocationConfirmed: (location: LocationData) => void;
  onCancel: () => void;
}

const defaultCenter = {
  lat: 20.5888, // Querétaro
  lng: -100.3899,
};

// Pin rojo con degradado (mismo trazo que la versión de Google Maps).
const PICKER_PIN = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="pinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#EF4444"/><stop offset="100%" stop-color="#DC2626"/>
    </linearGradient></defs>
    <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 50 20 50S40 35 40 20C40 8.95 31.05 0 20 0Z" fill="url(#pinGradient)"/>
    <circle cx="20" cy="20" r="8" fill="white"/>
    <circle cx="20" cy="20" r="4" fill="#EF4444"/>
  </svg>`
)}" width="40" height="50" alt="" style="display:block" />`;

export default function InteractiveLocationPicker({
  initialLocation,
  onLocationConfirmed,
  onCancel,
}: InteractiveLocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(initialLocation || null);
  const [markerPosition, setMarkerPosition] = useState(
    initialLocation?.latitude != null && initialLocation?.longitude != null
      ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
      : defaultCenter
  );
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);

  // Dirección a partir de coordenadas (Geocoding inverso de Mapbox).
  const getAddressFromCoordinates = useCallback(async (lat: number, lng: number) => {
    setIsLoadingAddress(true);
    try {
      const result = await mapboxReverseGeocode(lat, lng, { language: "es" });
      if (result) {
        const locationData: LocationData = {
          formatted_address: result.fullAddress || result.label,
          address: result.street,
          city: result.city,
          state: result.state,
          postal_code: result.postalCode,
          country: result.country,
          latitude: lat,
          longitude: lng,
        };
        setSelectedLocation(locationData);
        return locationData;
      }
    } finally {
      setIsLoadingAddress(false);
    }
    return null;
  }, []);

  const handleMapClick = (point: { lat: number; lng: number }) => {
    setMarkerPosition(point);
    void getAddressFromCoordinates(point.lat, point.lng);
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Tu navegador no soporta geolocalización.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        setMarkerPosition(point);
        void getAddressFromCoordinates(point.lat, point.lng);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("No se pudo obtener tu ubicación. Por favor, selecciona manualmente en el mapa.");
      }
    );
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationConfirmed(selectedLocation);
    }
  };

  const markers = useMemo<MapboxMapMarker[]>(
    () => [
      {
        id: "location-picker",
        lat: markerPosition.lat,
        lng: markerPosition.lng,
        html: PICKER_PIN,
        anchor: "bottom",
        draggable: true,
        onDragEnd: (next) => {
          setMarkerPosition(next);
          void getAddressFromCoordinates(next.lat, next.lng);
        },
      },
    ],
    [markerPosition, getAddressFromCoordinates]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">📍 Ajusta tu Ubicación</h3>
        <div className="flex gap-2">
          <button
            onClick={getCurrentLocation}
            className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
          >
            <Navigation className="h-4 w-4" />
            Mi Ubicación
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-start gap-2">
          <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <MapPin className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-medium text-blue-800">¿Cómo ajustar tu ubicación?</p>
            <p className="text-xs text-blue-700 mt-1">
              • Haz clic en cualquier lugar del mapa<br />
              • O arrastra el marcador rojo a la ubicación exacta
            </p>
          </div>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border-2 border-gray-200">
        <MapboxMap
          className="h-[300px] w-full"
          center={markerPosition}
          zoom={15}
          markers={markers}
          onClick={handleMapClick}
        />

        {isLoadingAddress && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="bg-white rounded-lg p-3 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span className="text-sm">Obteniendo dirección...</span>
            </div>
          </div>
        )}
      </div>

      {selectedLocation && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <MapPin className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-green-800 mb-1">Ubicación Seleccionada</h4>
              <p className="text-sm text-green-700">
                {selectedLocation.formatted_address ||
                  `${selectedLocation.address}, ${selectedLocation.city}, ${selectedLocation.state}`}
              </p>
              <p className="text-xs text-green-600 mt-1">
                Coordenadas: {selectedLocation.latitude?.toFixed(6)}, {selectedLocation.longitude?.toFixed(6)}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="h-4 w-4" />
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={!selectedLocation || isLoadingAddress}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <Check className="h-4 w-4" />
          Confirmar Ubicación
        </button>
      </div>
    </div>
  );
}
