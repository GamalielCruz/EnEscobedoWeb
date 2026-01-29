"use client";

/// <reference path="../types/google-maps.d.ts" />

import { useEffect, useRef, useState, useCallback } from "react";
import { MapPin, Navigation, Edit3, Check, X } from "lucide-react";
import { useGoogleMaps } from "./GoogleMapsLoader";

interface InteractiveDeliveryMapProps {
  onLocationConfirmed: (locationData: {
    formatted_address: string;
    address: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
    latitude: number;
    longitude: number;
  }) => void;
  initialLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  disabled?: boolean;
}

export default function InteractiveDeliveryMap({
  onLocationConfirmed,
  initialLocation,
  disabled = false,
}: InteractiveDeliveryMapProps) {
  const { isLoaded, loadError } = useGoogleMaps();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  
  const [currentLocation, setCurrentLocation] = useState(initialLocation || null);
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [addressText, setAddressText] = useState(initialLocation?.address || '');
  const [gettingLocation, setGettingLocation] = useState(false);

  const reverseGeocode = useCallback((lat: number, lng: number) => {
    if (!geocoderRef.current) return;

    const latlng = { lat, lng };
    
    geocoderRef.current.geocode({ location: latlng }, (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
      if (status === 'OK' && results && results[0]) {
        const address = results[0].formatted_address;
        setAddressText(address);
      } else {
        setAddressText(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    });
  }, []);

  const updateMapLocation = useCallback((lat: number, lng: number) => {
    if (mapInstanceRef.current && markerRef.current) {
      const position = { lat, lng };
      mapInstanceRef.current.setCenter(position);
      markerRef.current.setPosition(position);
    }
  }, []);

  // Inicializar mapa cuando Google Maps esté listo
  const initializeMap = useCallback(() => {
    if (!mapRef.current) return;

    const google = (window as any).google;
    
    // Coordenadas por defecto (Pedro Escobedo)
    const defaultLat = initialLocation?.latitude || 20.5089;
    const defaultLng = initialLocation?.longitude || -100.1456;

    // Crear mapa
    const map = new google.maps.Map(mapRef.current, {
      center: { lat: defaultLat, lng: defaultLng },
      zoom: 16,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
      gestureHandling: 'cooperative',
    });

    // Crear marcador
    const marker = new google.maps.Marker({
      position: { lat: defaultLat, lng: defaultLng },
      map: map,
      draggable: true,
      title: 'Ubicación de entrega',
      icon: {
        url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
        scaledSize: new google.maps.Size(32, 32),
      },
    });

    // Crear geocoder
    const geocoder = new google.maps.Geocoder();

    // Listener para cuando se arrastra el marcador
    marker.addListener('dragend', () => {
      const position = marker.getPosition();
      if (position) {
        const lat = position.lat();
        const lng = position.lng();
        
        setCurrentLocation({ latitude: lat, longitude: lng });
        reverseGeocode(lat, lng);
      }
    });

    // Listener para hacer clic en el mapa
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (isAdjusting && event.latLng) {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        
        marker.setPosition({ lat, lng });
        setCurrentLocation({ latitude: lat, longitude: lng });
        reverseGeocode(lat, lng);
      }
    });

    mapInstanceRef.current = map;
    markerRef.current = marker;
    geocoderRef.current = geocoder;

    // Geocodificar ubicación inicial si existe
    if (initialLocation && !initialLocation.address) {
      reverseGeocode(defaultLat, defaultLng);
    }
  }, [initialLocation, isAdjusting, reverseGeocode]);

  useEffect(() => {
    if (isLoaded && mapRef.current && !mapInstanceRef.current) {
      initializeMap();
    }
  }, [isLoaded, initializeMap]);

  // Actualizar mapa cuando cambie la ubicación inicial
  useEffect(() => {
    if (initialLocation && mapInstanceRef.current) {
      updateMapLocation(initialLocation.latitude, initialLocation.longitude);
      setCurrentLocation(initialLocation);
      setAddressText(initialLocation.address || '');
    }
  }, [initialLocation, updateMapLocation]);

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    setGettingLocation(true);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ latitude, longitude });
        updateMapLocation(latitude, longitude);
        reverseGeocode(latitude, longitude);
        setGettingLocation(false);
      },
      (error) => {
        console.error('Error obteniendo ubicación:', error);
        setGettingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [updateMapLocation, reverseGeocode]);

  const confirmLocation = useCallback(() => {
    if (!currentLocation) return;

    // Extraer componentes de la dirección
    const addressParts = addressText.split(',').map(part => part.trim());
    
    const locationData = {
      formatted_address: addressText,
      address: addressParts[0] || addressText,
      city: addressParts[1] || 'Pedro Escobedo',
      state: addressParts[2] || 'Querétaro',
      postal_code: '76240',
      country: 'México',
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
    };

    onLocationConfirmed(locationData);
    setIsAdjusting(false);
  }, [currentLocation, addressText, onLocationConfirmed]);

  if (loadError) {
    return (
      <div className="p-4 border border-red-200 rounded-lg bg-red-50">
        <p className="text-red-700 text-sm">
          No se pudo cargar el mapa. Verifica tu conexión a internet.
        </p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-2"></div>
          <span className="text-gray-600">Cargando mapa...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controles superiores */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={getCurrentLocation}
          disabled={disabled || gettingLocation}
          className="flex items-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 text-sm"
        >
          <Navigation className="h-4 w-4" />
          {gettingLocation ? 'Detectando...' : 'Mi ubicación'}
        </button>
        
        <button
          onClick={() => setIsAdjusting(!isAdjusting)}
          disabled={disabled}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            isAdjusting 
              ? 'bg-orange-500 text-white hover:bg-orange-600' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <Edit3 className="h-4 w-4" />
          {isAdjusting ? 'Ajustando...' : 'Ajustar'}
        </button>

        {isAdjusting && (
          <>
            <button
              onClick={confirmLocation}
              disabled={!currentLocation}
              className="flex items-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 text-sm"
            >
              <Check className="h-4 w-4" />
              Confirmar
            </button>
            
            <button
              onClick={() => setIsAdjusting(false)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          </>
        )}
      </div>

      {/* Mapa */}
      <div className="relative">
        <div
          ref={mapRef}
          className="w-full h-64 rounded-lg border-2 border-gray-200"
          style={{ minHeight: '256px' }}
        />
        
        {isAdjusting && (
          <div className="absolute top-2 left-2 right-2 bg-orange-100 border border-orange-300 rounded-lg p-2">
            <p className="text-orange-800 text-sm font-medium">
              🎯 Modo de ajuste activo
            </p>
            <p className="text-orange-700 text-xs">
              Arrastra el marcador o haz clic en el mapa para cambiar la ubicación
            </p>
          </div>
        )}
      </div>

      {/* Información de la dirección */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">Dirección de entrega:</p>
            <p className="text-sm text-gray-600 break-words">{addressText || 'Detectando dirección...'}</p>
            {currentLocation && (
              <p className="text-xs text-gray-500 mt-1">
                Coordenadas: {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Instrucciones */}
      <div className="text-xs text-gray-500 space-y-1">
        <p>💡 <strong>Cómo usar:</strong></p>
        <p>• Haz clic en &quot;Mi ubicación&quot; para detectar tu posición actual</p>
        <p>• Haz clic en &quot;Ajustar&quot; para modificar la ubicación manualmente</p>
        <p>• Arrastra el marcador rojo o haz clic en el mapa para cambiar la posición</p>
        <p>• Haz clic en &quot;Confirmar&quot; cuando la ubicación sea correcta</p>
      </div>
    </div>
  );
}