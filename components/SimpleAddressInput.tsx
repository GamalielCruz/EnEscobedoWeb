"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin } from "lucide-react";

interface SimpleAddressInputProps {
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

export default function SimpleAddressInput({
  onAddressSelected,
  placeholder = "Escribe tu dirección",
  disabled = false,
  apiKey
}: SimpleAddressInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);

  // Validación temprana de props
  useEffect(() => {
    if (typeof onAddressSelected !== 'function') {
      console.error('SimpleAddressInput: onAddressSelected prop must be a function, received:', typeof onAddressSelected);
    }
  }, [onAddressSelected]);

  const processPlace = useCallback((place: google.maps.places.PlaceResult) => {
    try {
      console.log('Processing place:', place); // Debug log
      console.log('onAddressSelected type:', typeof onAddressSelected); // Debug log
      
      if (!place.geometry?.location) {
        console.warn('No geometry or location in place');
        return;
      }
      
      if (typeof onAddressSelected !== 'function') {
        console.error('onAddressSelected is not a function:', onAddressSelected);
        return;
      }
      
      const addressComponents = place.address_components || [];
      let street = '';
      let city = '';
      let state = '';
      let postal_code = '';
      let country = 'México';

      addressComponents.forEach((component: google.maps.GeocoderAddressComponent) => {
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

      console.log('Calling onAddressSelected with:', addressData); // Debug log
      
      // Verificación de seguridad adicional
      if (onAddressSelected && typeof onAddressSelected === 'function') {
        onAddressSelected(addressData);
      } else {
        console.error('onAddressSelected is not available or not a function at call time');
      }
    } catch (error) {
      console.error('Error processing place:', error);
    }
  }, [onAddressSelected]);

  useEffect(() => {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      script.onload = () => setIsLoaded(true);
      document.head.appendChild(script);
    } else {
      setIsLoaded(true);
    }
  }, [apiKey]);

  useEffect(() => {
    if (isLoaded && inputRef.current && !autocompleteRef.current) {
      try {
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: 'mx' },
          fields: ['address_components', 'formatted_address', 'geometry', 'name'],
          types: ['address']
        });

        autocompleteRef.current.addListener('place_changed', () => {
          try {
            const place = autocompleteRef.current?.getPlace();
            console.log('Place changed event triggered:', place); // Debug log
            
            if (place && place.geometry && place.geometry.location) {
              processPlace(place);
            } else {
              console.warn('Invalid place data:', place);
            }
          } catch (error) {
            console.error('Error in place_changed listener:', error);
          }
        });
      } catch (error) {
        console.error('Error setting up autocomplete:', error);
      }
    }
  }, [isLoaded, processPlace]);

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
          disabled={disabled}
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
        />
      </div>
    </div>
  );
}