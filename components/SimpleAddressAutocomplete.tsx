"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface SimpleAddressAutocompleteProps {
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
  apiKey: string;
}

// Variable global para controlar la carga de Google Maps
let googleMapsLoading = false;
let googleMapsLoaded = false;
const loadingCallbacks: (() => void)[] = [];

export default function SimpleAddressAutocomplete({
  onAddressSelected,
  placeholder = "Escribe tu dirección y selecciona una opción de la lista",
  disabled = false,
  apiKey,
}: SimpleAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const processPlace = useCallback((place: any) => {
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
  }, [onAddressSelected]);

  // Función para cargar Google Maps de forma segura
  const loadGoogleMaps = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      // Si ya está cargado, resolver inmediatamente
      if (googleMapsLoaded && window.google && window.google.maps && window.google.maps.places) {
        resolve();
        return;
      }

      // Si ya se está cargando, agregar callback a la cola
      if (googleMapsLoading) {
        loadingCallbacks.push(resolve);
        return;
      }

      // Iniciar carga
      googleMapsLoading = true;
      
      const script = document.createElement('script');
      const callbackName = `initGoogleMaps_${Date.now()}`;
      
      // Callback único para esta carga
      (window as any)[callbackName] = () => {
        googleMapsLoaded = true;
        googleMapsLoading = false;
        
        // Resolver todas las promesas pendientes
        resolve();
        loadingCallbacks.forEach(callback => callback());
        loadingCallbacks.length = 0;
        
        // Limpiar callback
        delete (window as any)[callbackName];
      };

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      
      script.onerror = () => {
        googleMapsLoading = false;
        reject(new Error('Error cargando Google Maps API'));
      };

      document.head.appendChild(script);
    });
  }, [apiKey]);

  // Cargar Google Maps API
  useEffect(() => {
    if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
      return;
    }

    // Verificar si ya está cargada
    if (window.google && window.google.maps && window.google.maps.places) {
      setIsLoaded(true);
      return;
    }

    setLoading(true);
    
    loadGoogleMaps()
      .then(() => {
        setIsLoaded(true);
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error cargando Google Maps:', error);
        setLoading(false);
      });
  }, [apiKey, loadGoogleMaps]);

  // Inicializar Autocomplete
  useEffect(() => {
    if (isLoaded && inputRef.current && !autocompleteRef.current) {
      try {
        const google = (window as any).google;
        
        const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'mx' },
          fields: ['formatted_address', 'address_components', 'geometry', 'place_id']
        });

        const handlePlaceChanged = () => {
          const place = autocomplete.getPlace();
          
          if (place && place.geometry && place.geometry.location) {
            processPlace(place);
          }
        };

        autocomplete.addListener('place_changed', handlePlaceChanged);
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

  // Si no hay API key, mostrar input simple
  if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
    return (
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
          <MapPin className="h-4 w-4 text-gray-400" />
        </div>
        <input
          type="text"
          placeholder="Ingresa tu dirección manualmente"
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={disabled}
          onChange={(e) => {
            const value = e.target.value;
            if (value.length > 10) {
              // Simular geocodificación básica
              const mockAddress = {
                formatted_address: value,
                address: value,
                city: 'Pedro Escobedo',
                state: 'Querétaro',
                postal_code: '76240',
                country: 'México',
                latitude: 20.5089 + (Math.random() - 0.5) * 0.01,
                longitude: -100.1456 + (Math.random() - 0.5) * 0.01,
              };
              onAddressSelected(mockAddress);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 z-10">
        {loading ? (
          <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
        ) : (
          <MapPin className="h-4 w-4 text-gray-400" />
        )}
      </div>
      
      <input
        ref={inputRef}
        type="text"
        placeholder={loading ? "Cargando autocompletado..." : placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        disabled={disabled || loading || !isLoaded}
        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
      />
      
      {!loading && isLoaded && (
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
          <span className="text-xs text-gray-400">powered by Google</span>
        </div>
      )}
    </div>
  );
}