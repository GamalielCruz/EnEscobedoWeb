"use client";

import { useState, useCallback, useRef } from 'react';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { MapPin, Navigation, Check, X } from 'lucide-react';

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
  apiKey: string;
  initialLocation?: LocationData;
  onLocationConfirmed: (location: LocationData) => void;
  onCancel: () => void;
}

const mapContainerStyle = {
  width: '100%',
  height: '300px'
};

const defaultCenter = {
  lat: 20.5888, // Querétaro
  lng: -100.3899
};

export default function InteractiveLocationPicker({
  apiKey,
  initialLocation,
  onLocationConfirmed,
  onCancel
}: InteractiveLocationPickerProps) {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries: ['places']
  });

  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(initialLocation || null);
  const [markerPosition, setMarkerPosition] = useState(
    initialLocation?.latitude && initialLocation?.longitude
      ? { lat: initialLocation.latitude, lng: initialLocation.longitude }
      : defaultCenter
  );
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [mapCenter, setMapCenter] = useState(markerPosition);
  const [isDragging, setIsDragging] = useState(false);
  
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    geocoderRef.current = new google.maps.Geocoder();
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
    geocoderRef.current = null;
  }, []);

  // Función para obtener la dirección desde coordenadas
  const getAddressFromCoordinates = async (lat: number, lng: number) => {
    if (!geocoderRef.current) return null;

    setIsLoadingAddress(true);
    
    try {
      const response = await new Promise<google.maps.GeocoderResponse>((resolve, reject) => {
        geocoderRef.current!.geocode(
          { location: { lat, lng } },
          (results, status) => {
            if (status === 'OK') {
              resolve({ results: results || [] } as google.maps.GeocoderResponse);
            } else {
              reject(new Error(`Geocoding failed: ${status}`));
            }
          }
        );
      });

      if (response.results && response.results.length > 0) {
        const result = response.results[0];
        const addressComponents = result.address_components;
        
        let address = '';
        let city = '';
        let state = '';
        let postal_code = '';
        let country = '';

        // Extraer componentes de la dirección
        addressComponents?.forEach((component) => {
          const types = component.types;
          
          if (types.includes('street_number') || types.includes('route')) {
            address += component.long_name + ' ';
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

        const locationData: LocationData = {
          formatted_address: result.formatted_address,
          address: address.trim(),
          city,
          state,
          postal_code,
          country,
          latitude: lat,
          longitude: lng
        };

        setSelectedLocation(locationData);
        return locationData;
      }
    } catch (error) {
      console.error('Error getting address:', error);
    } finally {
      setIsLoadingAddress(false);
    }
    
    return null;
  };

  // Manejar click en el mapa
  const handleMapClick = useCallback((event: google.maps.MapMouseEvent) => {
    if (event.latLng) {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      
      setMarkerPosition({ lat, lng });
      getAddressFromCoordinates(lat, lng);
    }
  }, []);

  // Manejar arrastre del marcador
  const handleMarkerDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMarkerDragEnd = useCallback((event: google.maps.MapMouseEvent) => {
    setIsDragging(false);
    if (event.latLng) {
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      
      setMarkerPosition({ lat, lng });
      getAddressFromCoordinates(lat, lng);
    }
  }, []);

  // Obtener ubicación actual del usuario
  const getCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          setMarkerPosition({ lat, lng });
          setMapCenter({ lat, lng });
          getAddressFromCoordinates(lat, lng);
          
          // Centrar el mapa en la nueva ubicación
          if (mapRef.current) {
            mapRef.current.panTo({ lat, lng });
            mapRef.current.setZoom(16);
          }
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('No se pudo obtener tu ubicación. Por favor, selecciona manualmente en el mapa.');
        }
      );
    } else {
      alert('Tu navegador no soporta geolocalización.');
    }
  };

  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationConfirmed(selectedLocation);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-100 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Cargando mapa...</p>
        </div>
      </div>
    );
  }

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
              • Haz clic en cualquier lugar del mapa<br/>
              • O arrastra el marcador rojo a la ubicación exacta
            </p>
          </div>
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden border-2 border-gray-200">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={mapCenter}
          zoom={15}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onClick={handleMapClick}
          options={{
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          }}
        >
          <Marker
            position={markerPosition}
            draggable={true}
            onDragStart={handleMarkerDragStart}
            onDragEnd={handleMarkerDragEnd}
            icon={{
              url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 50 20 50S40 35 40 20C40 8.95 31.05 0 20 0Z" fill="#EF4444"/>
                  <path d="M20 0C8.95 0 0 8.95 0 20C0 35 20 50 20 50S40 35 40 20C40 8.95 31.05 0 20 0Z" fill="url(#gradient)"/>
                  <circle cx="20" cy="20" r="8" fill="white"/>
                  <circle cx="20" cy="20" r="4" fill="#EF4444"/>
                  <defs>
                    <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" style="stop-color:#EF4444;stop-opacity:1" />
                      <stop offset="100%" style="stop-color:#DC2626;stop-opacity:1" />
                    </linearGradient>
                  </defs>
                </svg>
              `),
              scaledSize: new google.maps.Size(40, 50),
              anchor: new google.maps.Point(20, 50),
            }}
            animation={isDragging ? undefined : google.maps.Animation.DROP}
          />
        </GoogleMap>

        {(isLoadingAddress || isDragging) && (
          <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
            <div className="bg-white rounded-lg p-3 flex items-center gap-2">
              {isDragging ? (
                <>
                  <MapPin className="h-4 w-4 text-red-500" />
                  <span className="text-sm">Arrastra para ajustar ubicación...</span>
                </>
              ) : (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                  <span className="text-sm">Obteniendo dirección...</span>
                </>
              )}
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