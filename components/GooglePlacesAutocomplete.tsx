"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GooglePlacesAutocompleteProps {
  onPlaceSelected: (place: {
    address: string;
    coordinates: { lat: number; lng: number };
    components: {
      street?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  }) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export default function GooglePlacesAutocomplete({
  onPlaceSelected,
  placeholder = "Ingresa tu dirección...",
  label = "Dirección",
  disabled = false,
}: GooglePlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [inputValue, setInputValue] = useState("");
  const [isGooglePlacesReady, setIsGooglePlacesReady] = useState(false);

  useEffect(() => {
    // Función para inicializar Google Places
    const initializeGooglePlaces = () => {
      if (!inputRef.current || !(window as any).google?.maps?.places || autocompleteRef.current) {
        console.log('Google Places no está disponible aún:', {
          inputRef: !!inputRef.current,
          google: !!(window as any).google,
          places: !!(window as any).google?.maps?.places,
          autocomplete: !!autocompleteRef.current
        });
        return false;
      }

      // Inicializar Google Places Autocomplete solo una vez
      const google = (window as any).google;
      console.log('✅ Inicializando Google Places Autocomplete...');
      
      try {
        autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'mx' }, // Restringir a México
          fields: ['address_components', 'formatted_address', 'geometry', 'name']
        });

        // Listener para cuando se selecciona un lugar
        const placeChangedListener = () => {
          console.log('🎯 Place changed event triggered');
          const place = autocompleteRef.current.getPlace();
          console.log('📍 Place object:', place);
          
          if (!place.geometry || !place.geometry.location) {
            console.warn('❌ No se encontraron detalles para el lugar seleccionado:', place);
            return;
          }
          
          console.log('✅ Lugar válido encontrado, procesando...');

          // Extraer componentes de la dirección
          const components = {
            street: '',
            city: '',
            state: '',
            postalCode: '',
            country: '',
          };

          place.address_components?.forEach((component: any) => {
            const types = component.types;
            
            if (types.includes('street_number')) {
              components.street = component.long_name + ' ';
            }
            if (types.includes('route')) {
              components.street += component.long_name;
            }
            if (types.includes('locality') || types.includes('administrative_area_level_2')) {
              components.city = component.long_name;
            }
            if (types.includes('administrative_area_level_1')) {
              components.state = component.long_name;
            }
            if (types.includes('postal_code')) {
              components.postalCode = component.long_name;
            }
            if (types.includes('country')) {
              components.country = component.long_name;
            }
          });

          // Limpiar street si está vacío
          components.street = components.street.trim();

          const placeData = {
            address: place.formatted_address || place.name || inputRef.current?.value || '',
            coordinates: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
            components,
          };

          console.log('🎉 Lugar seleccionado desde Google Places:', placeData);
          console.log('📍 Coordenadas obtenidas:', placeData.coordinates);
          onPlaceSelected(placeData);
          
          // Actualizar el valor del input
          setInputValue(placeData.address);
        };

        autocompleteRef.current.addListener('place_changed', placeChangedListener);
        console.log('✅ Google Places Autocomplete inicializado correctamente');
        setIsGooglePlacesReady(true);
        return true;
        
      } catch (error) {
        console.error('❌ Error inicializando Google Places:', error);
        return false;
      }
    };

    // Intentar inicializar inmediatamente
    if (!initializeGooglePlaces()) {
      // Si falla, intentar de nuevo después de un pequeño delay
      const timer = setTimeout(() => {
        console.log('🔄 Reintentando inicialización de Google Places...');
        initializeGooglePlaces();
      }, 1000);
      
      return () => clearTimeout(timer);
    }

    return () => {
      if (autocompleteRef.current) {
        const google = (window as any).google;
        if (google?.maps?.event) {
          google.maps.event.clearInstanceListeners(autocompleteRef.current);
        }
      }
    };
  }, [onPlaceSelected]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo actualizar el estado si no es una selección de Google Places
    const newValue = e.target.value;
    setInputValue(newValue);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="google-places-input">{label}</Label>
      <Input
        ref={inputRef}
        id="google-places-input"
        type="text"
        placeholder={placeholder}
        value={inputValue}
        onChange={handleInputChange}
        disabled={disabled}
        className="w-full"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Comienza a escribir tu dirección y selecciona una opción de la lista
        </p>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${isGooglePlacesReady ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
          <span className="text-xs text-gray-400">
            {isGooglePlacesReady ? 'Listo' : 'Cargando...'}
          </span>
        </div>
      </div>
    </div>
  );
}