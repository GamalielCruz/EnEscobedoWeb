"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";

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
  apiKey: string;
}

export default function SimpleAddressInputFixed({
  onAddressSelected,
  placeholder = "Escribe tu dirección",
  disabled = false,
  apiKey
}: SimpleAddressInputFixedProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Verificar que onAddressSelected sea una función
  useEffect(() => {
    if (typeof onAddressSelected !== 'function') {
      console.error('SimpleAddressInputFixed: onAddressSelected must be a function');
      return;
    }
    console.log('SimpleAddressInputFixed: onAddressSelected is valid function');
  }, [onAddressSelected]);

  // Cargar Google Maps API
  useEffect(() => {
    if (!apiKey) {
      console.error('SimpleAddressInputFixed: API key is required');
      return;
    }

    if (window.google?.maps?.places) {
      setIsLoaded(true);
      return;
    }

    const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (existingScript) {
      const checkLoaded = () => {
        if (window.google?.maps?.places) {
          setIsLoaded(true);
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
      return;
    }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initGoogleMapsGlobal`;
    script.async = true;
    script.defer = true;
    
    window.initGoogleMapsGlobal = () => {
      setIsLoaded(true);
    };
    
    script.onerror = () => {
      console.error('Failed to load Google Maps API');
    };
    
    document.head.appendChild(script);

    return () => {
      delete window.initGoogleMapsGlobal;
    };
  }, [apiKey]);

  // Inicializar autocomplete
  useEffect(() => {
    if (!isLoaded || !inputRef.current || isInitialized) {
      return;
    }

    try {
      console.log('Initializing Google Places Autocomplete...');
      
      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'mx' },
        fields: ['address_components', 'formatted_address', 'geometry', 'name'],
        types: ['address']
      });

      const handlePlaceChanged = () => {
        try {
          const place = autocomplete.getPlace();
          console.log('Place selected:', place);

          if (!place.geometry?.location) {
            console.warn('No geometry in selected place');
            return;
          }

          if (typeof onAddressSelected !== 'function') {
            console.error('onAddressSelected is not a function at call time');
            return;
          }

          // Procesar componentes de dirección
          const addressComponents = place.address_components || [];
          let street = '';
          let city = '';
          let state = '';
          let postal_code = '';
          let country = 'México';

          addressComponents.forEach((component) => {
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
            address: street.trim() || place.name || '',
            city: city || '',
            state: state || '',
            postal_code: postal_code || '',
            country: country,
            latitude: place.geometry.location.lat(),
            longitude: place.geometry.location.lng()
          };

          console.log('Calling onAddressSelected with:', addressData);
          onAddressSelected(addressData);

        } catch (error) {
          console.error('Error in handlePlaceChanged:', error);
        }
      };

      autocomplete.addListener('place_changed', handlePlaceChanged);
      autocompleteRef.current = autocomplete;
      setIsInitialized(true);
      
      console.log('Google Places Autocomplete initialized successfully');

    } catch (error) {
      console.error('Error initializing autocomplete:', error);
    }
  }, [isLoaded, onAddressSelected, isInitialized]);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled || !isLoaded}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {!isLoaded && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>
      {!isLoaded && (
        <p className="text-xs text-gray-500 mt-1">Cargando Google Maps...</p>
      )}
    </div>
  );
}

// Declarar el tipo global para TypeScript
declare global {
  interface Window {
    initGoogleMapsGlobal?: () => void;
  }
}