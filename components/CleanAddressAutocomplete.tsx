"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, AlertCircle } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsLoader";

interface CleanAddressAutocompleteProps {
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
}

export default function CleanAddressAutocomplete({
  onAddressSelected,
  placeholder = "Escribe tu dirección y selecciona una opción de la lista",
  disabled = false,
}: CleanAddressAutocompleteProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [inputValue, setInputValue] = useState("");

  const processPlace = useCallback((place: any) => {
    try {
      const addressComponents = place.address_components || [];
      let street = '';
      let city = '';
      let state = '';
      let postal_code = '';
      let country = 'México';

      addressComponents.forEach((component: any) => {
        const types = component.types;
        
        if (types.includes('street_number') || types.includes('route')) {
          street += component.long_name + ' ';
        }
        if (types.includes('locality') || types.includes('administrative_area_level_2')) {
          city = component.long_name;
        }
        if (types.includes('administrative_area_level_1')) {
          state = component.long_name;
        }
        if (types.includes('postal_code')) {
          postal_code = component.long_name;
        }
        if (types.includes('country')) {
          country = component.long_name;
        }
      });

      const addressData = {
        formatted_address: place.formatted_address || '',
        address: street.trim() || place.formatted_address || '',
        city: city || 'Pedro Escobedo',
        state: state || 'Querétaro',
        postal_code: postal_code || '76240',
        country: country,
        latitude: place.geometry?.location?.lat() || 0,
        longitude: place.geometry?.location?.lng() || 0,
      };

      setInputValue(place.formatted_address || '');
      onAddressSelected(addressData);
    } catch (error) {
      console.error('Error procesando lugar:', error);
    }
  }, [onAddressSelected]);

  // Inicializar Autocomplete cuando Google Maps esté listo
  useEffect(() => {
    if (isLoaded && inputRef.current && !autocompleteRef.current) {
      try {
        const google = (window as any).google;
        
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'mx' },
          fields: ['formatted_address', 'address_components', 'geometry', 'place_id']
        });

        autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          
          if (place && place.geometry && place.geometry.location) {
            processPlace(place);
          }
        });

        autocompleteRef.current = autocomplete;
      } catch (error) {
        console.error('Error inicializando Autocomplete:', error);
      }
    }
  }, [isLoaded, processPlace]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (autocompleteRef.current && window.google?.maps?.event) {
        try {
          window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        } catch (error) {
          console.warn('Error limpiando listeners:', error);
        }
      }
    };
  }, []);

  // Manejar entrada manual si hay error
  const handleManualInput = useCallback((value: string) => {
    if (value.length > 10) {
      const addressData = {
        formatted_address: value,
        address: value,
        city: 'Pedro Escobedo',
        state: 'Querétaro',
        postal_code: '76240',
        country: 'México',
        latitude: 20.5089 + (Math.random() - 0.5) * 0.01,
        longitude: -100.1456 + (Math.random() - 0.5) * 0.01,
      };
      onAddressSelected(addressData);
    }
  }, [onAddressSelected]);

  // Si hay error de carga, usar entrada manual
  if (loadError) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            <MapPin className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            placeholder="Ingresa tu dirección completa"
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={disabled}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              handleManualInput(e.target.value);
            }}
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm text-amber-600">
          <AlertCircle className="h-4 w-4" />
          <span>Entrada manual (Google Maps no disponible)</span>
        </div>
        
        <div className="text-xs text-gray-500">
          💡 Ejemplo: Calle Hidalgo 123, Pedro Escobedo, Querétaro
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
          {!isLoaded ? (
            <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
          ) : (
            <MapPin className="h-4 w-4 text-gray-400" />
          )}
        </div>
        
        <input
          ref={inputRef}
          type="text"
          placeholder={!isLoaded ? "Cargando autocompletado..." : placeholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={disabled || !isLoaded}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
        />
        
        {isLoaded && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <span className="text-xs text-gray-400">powered by Google</span>
          </div>
        )}
      </div>
      
      {!isLoaded && !loadError && (
        <div className="text-xs text-gray-500">
          🔄 Cargando autocompletado de Google Maps...
        </div>
      )}
      
      {isLoaded && (
        <div className="text-xs text-gray-500">
          💡 Escribe tu dirección y selecciona una opción de la lista
        </div>
      )}
    </div>
  );
}