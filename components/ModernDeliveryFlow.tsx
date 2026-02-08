"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { MapPin, Navigation, Loader2, CheckCircle, Store, AlertCircle, ChevronRight, Clock } from "lucide-react";
import { CustomerAddressWithCoords } from "@/lib/clickCollect";
import { calculateDistance } from "@/lib/clickCollect";

interface ModernDeliveryFlowProps {
  onComplete: (data: {
    customerAddress: CustomerAddressWithCoords;
    selectedStore: any;
    shippingCost: number;
    distanceKm: number;
  }) => void;
  filterStoreId?: string;
}

type FlowStep = 'address' | 'validating' | 'map-confirm' | 'finding-stores' | 'store-selection' | 'complete';

export default function ModernDeliveryFlow({ onComplete, filterStoreId }: ModernDeliveryFlowProps) {
  // Estados del flujo
  const [currentStep, setCurrentStep] = useState<FlowStep>('address');
  const [addressInput, setAddressInput] = useState("");
  const [customerAddress, setCustomerAddress] = useState<CustomerAddressWithCoords | null>(null);
  const [nearbyStores, setNearbyStores] = useState<any[]>([]);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<boolean>(false);

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  // Cargar Google Maps si no está cargado
  const loadGoogleMaps = useCallback(() => {
    if (window.google && window.google.maps) {
      setIsGoogleMapsLoaded(true);
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      
      if (existingScript) {
        const checkLoaded = () => {
          if (window.google && window.google.maps) {
            setIsGoogleMapsLoaded(true);
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }

      const script = document.createElement('script');
      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
      
      if (!apiKey) {
        reject(new Error('API Key no configurada'));
        return;
      }

      const callbackName = 'initGoogleMapsModernFlow';
      (window as any)[callbackName] = () => {
        setIsGoogleMapsLoaded(true);
        resolve();
        setTimeout(() => delete (window as any)[callbackName], 1000);
      };

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Error cargando Google Maps'));
      
      document.head.appendChild(script);
    });
  }, []);

  // Cargar Google Maps al montar
  useEffect(() => {
    loadGoogleMaps().catch(() => setLoadError(true));
  }, [loadGoogleMaps]);

  // Inicializar mapa cuando estamos en el paso map-confirm
  useEffect(() => {
    if (currentStep === 'map-confirm' && isGoogleMapsLoaded && customerAddress && mapRef.current && !mapInstanceRef.current) {
      const map = new google.maps.Map(mapRef.current, {
        center: { lat: customerAddress.latitude!, lng: customerAddress.longitude! },
        zoom: 17,
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      });

      const marker = new google.maps.Marker({
        position: { lat: customerAddress.latitude!, lng: customerAddress.longitude! },
        map: map,
        draggable: true,
        animation: google.maps.Animation.DROP,
      });

      // Actualizar posición al arrastrar
      marker.addListener('dragend', () => {
        const position = marker.getPosition();
        if (position) {
          const lat = position.lat();
          const lng = position.lng();
          
          setCustomerAddress(prev => prev ? ({
            ...prev,
            latitude: lat,
            longitude: lng
          }) : null);
          
          // Opcional: Reverse geocoding aquí para actualizar la dirección de texto
        }
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
    }

    // Cleanup al salir del paso
    return () => {
      if (currentStep !== 'map-confirm') {
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [currentStep, isGoogleMapsLoaded, customerAddress]);

  // Geocodificar dirección usando Google Maps
  const geocodeAddress = useCallback(async (address: string): Promise<CustomerAddressWithCoords | null> => {
    // Cargar Google Maps si no está cargado
    try {
      await loadGoogleMaps();
    } catch (err) {
      console.error('Error cargando Google Maps:', err);
      return null;
    }

    if (!window.google || !window.google.maps) {
      return null;
    }

    const geocoder = new google.maps.Geocoder();
    
    return new Promise((resolve) => {
      geocoder.geocode({ address, componentRestrictions: { country: 'MX' } }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          const place = results[0];
          const components = place.address_components || [];
          
          let street = '';
          let city = '';
          let state = '';
          let postalCode = '';
          
          components.forEach((component: any) => {
            const types = component.types;
            if (types.includes('street_number') || types.includes('route')) {
              street += component.long_name + ' ';
            }
            if (types.includes('locality')) {
              city = component.long_name;
            }
            if (types.includes('administrative_area_level_1')) {
              state = component.long_name;
            }
            if (types.includes('postal_code')) {
              postalCode = component.long_name;
            }
          });

          resolve({
            street: street.trim() || place.formatted_address || address,
            city: city || '',
            state: state || '',
            country: 'México',
            postalCode: postalCode || '',
            latitude: place.geometry?.location?.lat() || 0,
            longitude: place.geometry?.location?.lng() || 0,
          });
        } else {
          resolve(null);
        }
      });
    });
  }, [loadGoogleMaps]);

  // Buscar tiendas cercanas
  const findNearbyStores = useCallback(async (address: CustomerAddressWithCoords) => {
    try {
      const response = await fetch('/api/nearest-store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: address.latitude,
          longitude: address.longitude,
          filterStoreId: filterStoreId,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data.stores) {
          return data.data.stores.slice(0, 3); // Top 3 tiendas más cercanas
        }
      }
      return [];
    } catch (error) {
      console.error('Error buscando tiendas:', error);
      return [];
    }
  }, [filterStoreId]);

  // Manejar detección de ubicación
  const handleDetectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización");
      return;
    }

    setIsLoadingLocation(true);
    setError(null);

    // Asegurarse de que Google Maps esté cargado
    if (!isGoogleMapsLoaded) {
      try {
        await loadGoogleMaps();
      } catch (err) {
        setError("Error cargando el sistema de mapas. Intenta con entrada manual.");
        setIsLoadingLocation(false);
        return;
      }
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Geocodificar coordenadas a dirección
          if (window.google && window.google.maps) {
            const geocoder = new google.maps.Geocoder();
            const latlng = { lat: latitude, lng: longitude };
            
            geocoder.geocode({ location: latlng }, async (results, status) => {
              if (status === 'OK' && results && results[0]) {
                const place = results[0];
                const components = place.address_components || [];
                
                let street = '';
                let city = '';
                let state = '';
                let postalCode = '';
                
                components.forEach((component: any) => {
                  const types = component.types;
                  if (types.includes('street_number') || types.includes('route')) {
                    street += component.long_name + ' ';
                  }
                  if (types.includes('locality')) {
                    const longName = component.long_name;
                    if (!city || longName === 'Pedro Escobedo') {
                         city = longName;
                    }
                  }
                  if (types.includes('administrative_area_level_1')) {
                    state = component.long_name;
                  }
                  if (types.includes('postal_code')) {
                    postalCode = component.long_name;
                  }
                });

                const address: CustomerAddressWithCoords = {
                  street: street.trim() || place.formatted_address || 'Ubicación detectada',
                  city: city || '',
                  state: state || '',
                  country: 'México',
                  postalCode: postalCode || '',
                  latitude,
                  longitude,
                };

                setAddressInput(place.formatted_address || `${latitude}, ${longitude}`);
                setCustomerAddress(address);
                // Ir a confirmar mapa en lugar de validar directamente
                setCurrentStep('map-confirm');
              } else {
                 setError("No se pudo obtener la dirección exacta.");
                 setCurrentStep('address');
              }
            });
          }
        } catch (err) {
          setError("Error al obtener tu dirección");
        } finally {
          setIsLoadingLocation(false);
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        setError("No pudimos acceder a tu ubicación. Por favor ingresa tu dirección manualmente.");
        setIsLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [loadGoogleMaps, isGoogleMapsLoaded]);

  // Manejar envío de dirección manual
  const handleAddressSubmit = useCallback(async () => {
    if (!addressInput.trim()) {
      setError("Por favor ingresa una dirección");
      return;
    }

    setError(null);
    setCurrentStep('validating');

    try {
      const address = await geocodeAddress(addressInput);
      
      if (!address) {
        setError("No pudimos encontrar esa dirección. Intenta ser más específico.");
        setCurrentStep('address');
        return;
      }

      setCustomerAddress(address);
      // Ir a confirmar mapa
      setCurrentStep('map-confirm');
    } catch (err) {
      setError("Error al validar tu dirección. Por favor intenta de nuevo.");
      setCurrentStep('address');
    }
  }, [addressInput, geocodeAddress]);

  // Confirmar ubicación en mapa y buscar tiendas
  const handleConfirmLocation = useCallback(async () => {
    if (!customerAddress) return;

    setCurrentStep('finding-stores');
    
    // Buscar tiendas cercanas
    const stores = await findNearbyStores(customerAddress);
    
    if (stores.length === 0) {
      setError("No encontramos tiendas cercanas a tu dirección. Intenta con otra ubicación.");
      setCurrentStep('map-confirm'); // Regresar al mapa
      return;
    }

    setNearbyStores(stores);
    setCurrentStep('store-selection');
  }, [customerAddress, findNearbyStores]);

  // Manejar selección de tienda
  const handleStoreSelection = useCallback((store: any) => {
    if (!customerAddress) return;

    const distance = calculateDistance(
      customerAddress.latitude!,
      customerAddress.longitude!,
      store.coordinates.latitude,
      store.coordinates.longitude
    );

    const costPerKm = 6;
    const minCharge = 30;
    const shippingCost = Math.max(minCharge, Math.round(distance * costPerKm));

    setSelectedStore(store);
    setCurrentStep('complete');

    onComplete({
      customerAddress,
      selectedStore: store,
      shippingCost,
      distanceKm: distance,
    });
  }, [customerAddress, onComplete]);

  // Renderizar paso de dirección
  if (currentStep === 'address') {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
            <MapPin className="w-8 h-8 text-blue-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">¿Dónde entregaremos tu pedido?</h3>
          <p className="text-sm text-gray-600">
            Necesitamos tu dirección para calcular el costo de envío
          </p>
        </div>

        {/* Botón de ubicación */}
        <button
          onClick={handleDetectLocation}
          disabled={isLoadingLocation || !isGoogleMapsLoaded}
          className="w-full flex items-center justify-center gap-3 px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 transition-all shadow-md hover:shadow-lg"
        >
          {isLoadingLocation ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-medium">Detectando ubicación...</span>
            </>
          ) : (
            <>
              <Navigation className="w-5 h-5" />
              <span className="font-medium">Detectar mi ubicación</span>
            </>
          )}
        </button>

        {/* Separador */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">o escribe tu dirección</span>
          </div>
        </div>

        {/* Input manual */}
        <div className="space-y-3">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddressSubmit()}
              placeholder="Ej: Calle Hidalgo 123, Pedro Escobedo"
              className="w-full pl-11 pr-4 py-4 border-2 border-gray-300 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              disabled={!isGoogleMapsLoaded}
            />
          </div>
          
          <button
            onClick={handleAddressSubmit}
            disabled={!addressInput.trim() || !isGoogleMapsLoaded}
            className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-white border-2 border-blue-600 text-blue-600 rounded-xl hover:bg-blue-50 disabled:border-gray-300 disabled:text-gray-400 disabled:hover:bg-white transition-all font-medium"
          >
            <span>Continuar</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Loader de Google Maps */}
        {!isGoogleMapsLoaded && !loadError && (
          <div className="flex items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl">
            <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
            <span className="text-sm text-gray-600">Cargando sistema de direcciones...</span>
          </div>
        )}
      </div>
    );
  }

  // Renderizar validación / geocoding
  if (currentStep === 'validating') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Validando dirección...</h3>
      </div>
    );
  }

  // Renderizar confirmación de mapa
  if (currentStep === 'map-confirm') {
    return (
        <div className="space-y-4">
            <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold text-gray-900">Confirma tu ubicación</h3>
                <p className="text-sm text-gray-600">
                    Arrastra el marcador rojo al punto exacto de entrega
                </p>
            </div>

            <div className="relative w-full h-64 bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-300">
                <div ref={mapRef} className="w-full h-full" />
                {/* Botón para volver a centrar si existiera, pero el usuario puede arrastrar */}
            </div>

            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
                <span className="font-semibold block mb-1">Dirección detectada:</span>
                {customerAddress?.street}, {customerAddress?.city}
            </div>

            {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                    {error}
                </div>
            )}

            <div className="flex gap-3">
                <button
                    onClick={() => setCurrentStep('address')}
                    className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                >
                    Atrás
                </button>
                <button
                    onClick={handleConfirmLocation}
                    className="flex-[2] py-3 px-4 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                    Confirmar Ubicación
                </button>
            </div>
        </div>
    );
  }

  // Renderizar buscando tiendas
  if (currentStep === 'finding-stores') {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
            <Store className="w-8 h-8 text-green-600 animate-bounce" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Buscando tiendas cercanas...</h3>
        </div>
      );
  }

  // Renderizar selección de tienda
  if (currentStep === 'store-selection' && customerAddress) {
    return (
      <div className="space-y-4">
        {/* Header con dirección confirmada */}
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 overflow-hidden">
                <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <p className="text-sm text-gray-700 truncate">
                    {customerAddress.street}, {customerAddress.city}
                </p>
            </div>
            <button
                onClick={() => setCurrentStep('map-confirm')}
                className="text-xs text-blue-600 font-medium hover:underline ml-2 flex-shrink-0"
            >
                Editar
            </button>
        </div>

        {/* Título simplificado */}
        <h3 className="text-md font-semibold text-gray-900 px-1">
            Tiendas disponibles
        </h3>

        {/* Lista de tiendas simplificada */}
        <div className="space-y-3">
          {nearbyStores.map((store, index) => {
            const distance = calculateDistance(
              customerAddress.latitude!,
              customerAddress.longitude!,
              store.coordinates.latitude,
              store.coordinates.longitude
            );
            const shippingCost = Math.max(30, Math.round(distance * 6));
            // Estimación simple: 20 min base + 3 min por km
            const estimatedTime = Math.round(20 + (distance * 3));

            return (
              <button
                key={store._id}
                onClick={() => handleStoreSelection(store)}
                className="w-full p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="font-bold text-gray-900 text-lg group-hover:text-blue-600 transition-colors">
                            {store.name}
                        </h4>
                        <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                             <div className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                <span>~{estimatedTime} min</span>
                             </div>
                             <div className="flex items-center gap-1">
                                <MapPin className="w-4 h-4" />
                                <span>{distance.toFixed(1)} km</span>
                             </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <span className="block text-lg font-bold text-blue-600">
                            ${shippingCost}
                        </span>
                        <span className="text-xs text-gray-500">
                            envío
                        </span>
                    </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Renderizar estado completo
  if (currentStep === 'complete' && selectedStore && customerAddress) {
    const distance = calculateDistance(
      customerAddress.latitude!,
      customerAddress.longitude!,
      selectedStore.coordinates.latitude,
      selectedStore.coordinates.longitude
    );
    const shippingCost = Math.max(30, Math.round(distance * 6));

    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">¡Todo listo!</h3>
          <p className="text-sm text-gray-600">
            Tu pedido será preparado y enviado desde:
          </p>
        </div>

        <div className="p-4 bg-white border-2 border-green-200 rounded-xl">
          <div className="flex items-start gap-3">
            <Store className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-gray-900">{selectedStore.name}</p>
              <p className="text-sm text-gray-600 mt-1">
                {selectedStore.address?.street}, {selectedStore.address?.city}
              </p>
              <div className="flex items-center gap-4 mt-2 text-sm">
                <span className="text-gray-700">📍 {distance.toFixed(1)} km</span>
                <span className="text-green-600 font-semibold">Envío: ${shippingCost} MXN</span>
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setCurrentStep('address');
            setAddressInput("");
            setCustomerAddress(null);
            setNearbyStores([]);
            setSelectedStore(null);
            setError(null);
          }}
          className="w-full text-sm text-blue-600 hover:text-blue-800 underline"
        >
          Cambiar dirección o tienda
        </button>
      </div>
    );
  }

  return null;
}
