"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, AlertCircle } from "lucide-react";

interface RobustAddressAutocompleteProps {
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

export default function RobustAddressAutocomplete({
  onAddressSelected,
  placeholder = "Escribe tu dirección y selecciona una opción de la lista",
  disabled = false,
  apiKey,
}: RobustAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [useManualInput, setUseManualInput] = useState(false);

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
      setError('Error procesando la dirección seleccionada');
    }
  }, [onAddressSelected]);

  // Función para manejar entrada manual
  const handleManualInput = useCallback((value: string) => {
    if (value.length > 10) {
      // Geocodificación básica simulada
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

  // Verificar si Google Maps ya está disponible
  const checkGoogleMapsAvailability = useCallback(() => {
    return !!(window.google && window.google.maps && window.google.maps.places);
  }, []);

  // Cargar Google Maps de forma más segura
  useEffect(() => {
    if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
      setUseManualInput(true);
      return;
    }

    // Si ya está disponible, usarlo directamente
    if (checkGoogleMapsAvailability()) {
      setIsLoaded(true);
      return;
    }

    // Si ya hay un script cargándose, esperar
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      setLoading(true);
      
      // Polling para verificar cuando esté listo
      const checkInterval = setInterval(() => {
        if (checkGoogleMapsAvailability()) {
          clearInterval(checkInterval);
          setIsLoaded(true);
          setLoading(false);
        }
      }, 500);

      // Timeout después de 10 segundos
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!checkGoogleMapsAvailability()) {
          setError('Timeout cargando Google Maps');
          setLoading(false);
          setUseManualInput(true);
        }
      }, 10000);

      return;
    }

    // Cargar nuevo script
    setLoading(true);
    
    const script = document.createElement('script');
    const uniqueCallback = `googleMapsCallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    (window as any)[uniqueCallback] = () => {
      setIsLoaded(true);
      setLoading(false);
      delete (window as any)[uniqueCallback];
    };

    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${uniqueCallback}`;
    script.async = true;
    script.defer = true;
    
    script.onerror = () => {
      setError('Error cargando Google Maps API');
      setLoading(false);
      setUseManualInput(true);
      delete (window as any)[uniqueCallback];
    };

    document.head.appendChild(script);
  }, [apiKey, checkGoogleMapsAvailability]);

  // Inicializar Autocomplete
  useEffect(() => {
    if (isLoaded && inputRef.current && !autocompleteRef.current && !useManualInput) {
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
        setError(null);
      } catch (error) {
        console.error('Error inicializando Autocomplete:', error);
        setError('Error inicializando autocompletado');
        setUseManualInput(true);
      }
    }
  }, [isLoaded, processPlace, useManualInput]);

  // Si hay error o no hay API key, usar input manual
  if (useManualInput || error || !apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
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
            onChange={(e) => {
              setInputValue(e.target.value);
              handleManualInput(e.target.value);
            }}
            value={inputValue}
          />
        </div>
        
        {error && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="h-4 w-4" />
            <span>Usando entrada manual (Google Maps no disponible)</span>
          </div>
        )}
        
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
      
      {loading && (
        <div className="text-xs text-gray-500">
          🔄 Cargando autocompletado de Google Maps...
        </div>
      )}
      
      {!loading && isLoaded && (
        <div className="text-xs text-gray-500">
          💡 Escribe tu dirección y selecciona una opción de la lista
        </div>
      )}
    </div>
  );
}