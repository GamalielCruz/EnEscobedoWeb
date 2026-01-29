"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MapPin, Loader2 } from "lucide-react";

interface GooglePlacesAutocompleteProps {
  onPlaceSelected: (place: {
    formatted_address: string;
    address_components: google.maps.GeocoderAddressComponent[];
    geometry: {
      location: {
        lat: () => number;
        lng: () => number;
      };
    };
    place_id: string;
  }) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  apiKey: string;
  className?: string;
}

export default function GooglePlacesAutocomplete({
  onPlaceSelected,
  placeholder = "Buscar dirección...",
  label = "Dirección",
  disabled = false,
  apiKey,
  className = "",
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");

  // Cargar Google Maps API si no está cargada
  useEffect(() => {
    const loadGoogleMapsAPI = async () => {
      // Verificar si ya está cargada
      if (window.google && window.google.maps && window.google.maps.places) {
        setIsLoaded(true);
        return;
      }

      try {
        setLoading(true);
        
        // Crear script para cargar Google Maps API
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGooglePlaces`;
        script.async = true;
        script.defer = true;

        // Función callback global
        (window as any).initGooglePlaces = () => {
          setIsLoaded(true);
          setLoading(false);
        };

        script.onerror = () => {
          setError('Error cargando Google Maps API');
          setLoading(false);
        };

        document.head.appendChild(script);
      } catch {
        setError('Error inicializando Google Places');
        setLoading(false);
      }
    };

    if (apiKey && apiKey !== 'undefined' && apiKey.trim() !== '') {
      loadGoogleMapsAPI();
    } else {
      setError('API Key de Google Maps no disponible');
    }
  }, [apiKey]);

  // Inicializar Autocomplete cuando Google Maps esté cargado
  useEffect(() => {
    if (isLoaded && inputRef.current && !autocompleteRef.current) {
      try {
        const google = (window as any).google;
        
        // Configurar Autocomplete con restricciones para México
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'mx' }, // Restringir a México
          fields: ['formatted_address', 'address_components', 'geometry', 'place_id']
        });

        // Listener para cuando se selecciona un lugar
        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          
          if (place && place.geometry && place.geometry.location) {
            console.log('🗺️ Lugar seleccionado:', place);
            onPlaceSelected(place);
            setInputValue(place.formatted_address || '');
          } else {
            console.warn('⚠️ Lugar seleccionado sin geometría válida');
          }
        });

        autocompleteRef.current = autocomplete;
      } catch {
        console.error('Error inicializando Autocomplete');
        setError('Error inicializando autocompletado');
      }
    }
  }, [isLoaded, onPlaceSelected]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (autocompleteRef.current && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Label>{label}</Label>
        <div className="flex items-center gap-2 p-3 border rounded-md bg-gray-50">
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          <span className="text-sm text-gray-600">Cargando autocompletado...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <Label>{label}</Label>
        <div className="p-3 border border-red-200 rounded-md bg-red-50">
          <p className="text-sm text-red-600">{error}</p>
          <p className="text-xs text-red-500 mt-1">
            Verifica tu conexión a internet y la configuración de Google Maps API
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <Label htmlFor="google-places-input">{label}</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id="google-places-input"
          type="text"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={disabled || !isLoaded}
          className="pl-10"
        />
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>
      <p className="text-xs text-gray-500">
        Escribe tu dirección y selecciona una opción de la lista
      </p>
    </div>
  );
}