"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Loader2, Navigation, Edit3 } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsLoader";
import InteractiveDeliveryMap from "./InteractiveDeliveryMap";

interface LocationAwareAddressInputProps {
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

export default function LocationAwareAddressInput({
  onAddressSelected,
  placeholder = "Escribe tu dirección y selecciona una opción de la lista",
  disabled = false,
}: LocationAwareAddressInputProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [inputValue, setInputValue] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);
  const [detectedLocation, setDetectedLocation] = useState<{
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);
  const [showMap, setShowMap] = useState(false);

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

  // Función para obtener ubicación del usuario
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationDenied(true);
      return;
    }

    setGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Usar geocodificación inversa de Google Maps si está disponible
          if (window.google && window.google.maps) {
            const google = (window as any).google;
            const geocoder = new google.maps.Geocoder();
            const latlng = { lat: latitude, lng: longitude };
            
            geocoder.geocode({ location: latlng }, (results: any, status: any) => {
              if (status === 'OK' && results[0]) {
                const place = results[0];
                const address = place.formatted_address;
                setInputValue(address);
                
                // Guardar ubicación detectada para el mapa
                setDetectedLocation({
                  latitude,
                  longitude,
                  address: address
                });
                
                // Mostrar el mapa para confirmación
                setShowMap(true);
                
                processPlace(place);
              } else {
                // Fallback a coordenadas
                const addressData = {
                  formatted_address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                  address: `Ubicación detectada`,
                  city: 'Pedro Escobedo',
                  state: 'Querétaro',
                  postal_code: '76240',
                  country: 'México',
                  latitude,
                  longitude,
                };
                
                setDetectedLocation({
                  latitude,
                  longitude,
                  address: addressData.formatted_address
                });
                
                setShowMap(true);
                setInputValue(addressData.formatted_address);
                onAddressSelected(addressData);
              }
            });
          } else {
            // Fallback sin Google Maps
            const addressData = {
              formatted_address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
              address: `Ubicación detectada`,
              city: 'Pedro Escobedo',
              state: 'Querétaro',
              postal_code: '76240',
              country: 'México',
              latitude,
              longitude,
            };
            
            setDetectedLocation({
              latitude,
              longitude,
              address: addressData.formatted_address
            });
            
            setShowMap(true);
            setInputValue(addressData.formatted_address);
            onAddressSelected(addressData);
          }
        } catch (error) {
          console.error('Error con geocodificación:', error);
        } finally {
          setGettingLocation(false);
        }
      },
      (error) => {
        console.error('Error obteniendo ubicación:', error);
        setLocationDenied(true);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [onAddressSelected, processPlace]);

  // Inicializar Autocomplete cuando Google Maps esté listo
  useEffect(() => {
    if (isLoaded && inputRef.current && !autocompleteRef.current && !showManualInput) {
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
        setShowManualInput(true);
      }
    }
  }, [isLoaded, processPlace, showManualInput]);

  // Manejar entrada manual
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

  // Si hay error de carga o entrada manual seleccionada
  if (loadError || showManualInput) {
    return (
      <div className="space-y-4">
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
        
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500">
            💡 Ejemplo: Calle Hidalgo 123, Pedro Escobedo, Querétaro
          </div>
          
          {!loadError && (
            <button
              onClick={() => setShowManualInput(false)}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Usar autocompletado
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Botones de acción */}
      <div className="flex gap-2">
        <button
          onClick={getCurrentLocation}
          disabled={disabled || gettingLocation || locationDenied}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {gettingLocation ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Navigation className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">
            {gettingLocation ? 'Detectando...' : 'Usar mi ubicación'}
          </span>
        </button>
        
        <button
          onClick={() => setShowManualInput(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Edit3 className="h-4 w-4" />
          <span className="text-sm font-medium">Manual</span>
        </button>
      </div>

      {/* Input de dirección */}
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
      
      {/* Estados y mensajes */}
      {!isLoaded && !loadError && (
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando autocompletado de Google Maps...
        </div>
      )}
      
      {locationDenied && (
        <div className="text-xs text-amber-600 bg-amber-50 p-2 rounded">
          ⚠️ Ubicación no disponible. Usa el campo de arriba para escribir tu dirección.
        </div>
      )}
      
      {isLoaded && (
        <div className="text-xs text-gray-500">
          💡 Escribe tu dirección y selecciona una opción de la lista
        </div>
      )}
      
      {/* Mapa interactivo cuando se detecta ubicación */}
      {showMap && detectedLocation && (
        <div className="mt-4 p-4 border-2 border-blue-200 rounded-xl bg-blue-50">
          <div className="mb-3">
            <h4 className="font-medium text-blue-900 mb-1">📍 Confirma tu Ubicación de Entrega</h4>
            <p className="text-sm text-blue-700">
              Verifica que la ubicación sea correcta o ajústala si es necesario
            </p>
          </div>
          
          <InteractiveDeliveryMap
            initialLocation={detectedLocation}
            onLocationConfirmed={(locationData) => {
              setInputValue(locationData.formatted_address);
              onAddressSelected(locationData);
              setShowMap(false);
            }}
            disabled={disabled}
          />
          
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setShowMap(false);
                // Mantener la ubicación original si no se confirma
              }}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Usar ubicación original
            </button>
          </div>
        </div>
      )}
    </div>
  );
}