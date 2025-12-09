"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Navigation, Loader2, AlertCircle, MapPin, Edit3, Store } from "lucide-react";
import SimpleAddressInput from "./SimpleAddressInput";
import { CustomerAddress } from "@/lib/clickCollect";
import { useGoogleMaps } from "@/hooks/useGoogleMaps";

interface Store {
  _id: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  contact: {
    phone: string;
  };
  operatingHours: Record<string, string>;
  distanceKm: number;
  estimatedDeliveryDate: string;
}

interface LocationBasedStoreSelectorProps {
  onStoreSelected: (storeData: {
    store: Store;
    summary: {
      storeName: string;
      distance: string;
      estimatedDelivery: string;
      address: string;
      phone: string;
    };
  }) => void;
  onAddressChange?: (address: CustomerAddress) => void;
  apiKey: string;
  filterStoreId?: string;
}

export default function LocationBasedStoreSelector({
  onStoreSelected,
  onAddressChange,
  apiKey,
  filterStoreId,
}: LocationBasedStoreSelectorProps) {
  // Distancia máxima para mostrar tiendas (en kilómetros)
  const MAX_DISTANCE_KM = 50;
  const mapRef = useRef<HTMLDivElement>(null);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [nearbyStores, setNearbyStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<any>(null);
  const [storeMarkers, setStoreMarkers] = useState<any[]>([]);
  const [userMarker, setUserMarker] = useState<any>(null);
  const [directionsRenderer, setDirectionsRenderer] = useState<any>(null);
  const [directionsService, setDirectionsService] = useState<any>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distance: string;
    duration: string;
  } | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [geolocationDenied, setGeolocationDenied] = useState(false);
  const [autoLocationAttempted, setAutoLocationAttempted] = useState(false);

  // Usar el hook personalizado para cargar Google Maps
  const { isLoaded: isMapLoaded, loadError } = useGoogleMaps({
    apiKey,
    libraries: ["places"],
  });

  // Actualizar error si hay problema cargando Google Maps
  useEffect(() => {
    if (loadError) {
      setError(loadError);
    }
  }, [loadError]);

  // Inicializar mapa cuando esté cargado
  useEffect(() => {
    if (isMapLoaded && mapRef.current && !map) {
      const google = (window as any).google;
      const googleMap = new google.maps.Map(mapRef.current, {
        center: { lat: 20.5089, lng: -100.1456 }, // Pedro Escobedo
        zoom: 13,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      // Inicializar servicios de direcciones
      const directionsServiceInstance = new google.maps.DirectionsService();
      const directionsRendererInstance = new google.maps.DirectionsRenderer({
        suppressMarkers: true, // Suprimir marcadores automáticos para usar los nuestros
        polylineOptions: {
          strokeColor: "#4285F4",
          strokeWeight: 4,
          strokeOpacity: 0.8,
        },
      });

      directionsRendererInstance.setMap(googleMap);

      setMap(googleMap);
      setDirectionsService(directionsServiceInstance);
      setDirectionsRenderer(directionsRendererInstance);
    }
  }, [isMapLoaded, map]);

  // Intentar obtener ubicación automáticamente al cargar (solo una vez)
  useEffect(() => {
    if (
      isMapLoaded &&
      !userLocation &&
      !loading &&
      !loadError &&
      !geolocationDenied &&
      !showManualInput &&
      !autoLocationAttempted
    ) {
      setAutoLocationAttempted(true);
      // Pequeño delay para que el usuario vea la interfaz primero
      const timer = setTimeout(() => {
        if (navigator.geolocation) {
          getUserLocation();
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isMapLoaded, autoLocationAttempted]);

  // Obtener ubicación del usuario
  const getUserLocation = () => {
    setLoading(true);
    setError(null);
    setAutoLocationAttempted(true);

    if (!navigator.geolocation) {
      setError("La geolocalización no está soportada en este navegador");
      setLoading(false);
      setGeolocationDenied(true);
      setShowManualInput(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const location = { lat: latitude, lng: longitude };

        setUserLocation(location);

        // Centrar mapa en la ubicación del usuario
        if (map) {
          const google = (window as any).google;
          map.setCenter(location);
          map.setZoom(15);

          // Limpiar marcador anterior del usuario
          if (userMarker) {
            userMarker.setMap(null);
          }

          // Agregar marcador del usuario
          const userMarkerInstance = new google.maps.Marker({
            position: location,
            map: map,
            title: "Tu ubicación",
            icon: {
              url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            },
          });

          setUserMarker(userMarkerInstance);
        }

        // Buscar tiendas cercanas
        await findNearbyStores(latitude, longitude);
        setLoading(false);
      },
      (error) => {
        setGeolocationDenied(true);

        let errorMessage = "No se pudo obtener tu ubicación.";

        if (error.code === 1) {
          errorMessage =
            "Permisos de ubicación denegados. Puedes ingresar tu dirección manualmente.";
        } else if (error.code === 2) {
          errorMessage =
            "Ubicación no disponible. Puedes ingresar tu dirección manualmente.";
        } else if (error.code === 3) {
          errorMessage =
            "Tiempo de espera agotado. Puedes ingresar tu dirección manualmente.";
        }

        setError(errorMessage);
        setLoading(false);
        setShowManualInput(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutos
      }
    );
  };

  // Buscar tiendas cercanas usando la API
  const findNearbyStores = async (lat: number, lng: number) => {
    try {
      // Limpiar marcadores anteriores
      storeMarkers.forEach((marker) => marker.setMap(null));
      setStoreMarkers([]);

      // Limpiar ruta anterior
      if (directionsRenderer) {
        directionsRenderer.setDirections({ routes: [] });
      }
      setRouteInfo(null);

      // Obtener todas las tiendas disponibles (posible filtro por storeId)
      const url = new URL(window.location.origin + "/api/nearest-store");
      if (filterStoreId) url.searchParams.set("filterStoreId", filterStoreId);
      const response = await fetch(url.toString(), {
        method: "GET",
      });

      const data = await response.json();

      if (data.success && data.data.stores) {
        // Calcular distancias para todas las tiendas
        const storesWithDistance: Store[] = data.data.stores.map(
          (store: any) => {
            return {
              _id: store._id || "unknown",
              name: store.name || "Tienda sin nombre",
              address: {
                street: store.address?.street || "Dirección no disponible",
                city: store.address?.city || "Ciudad no disponible",
                state: store.address?.state || "Estado no disponible",
                postalCode: store.address?.postalCode || "00000",
              },
              coordinates: {
                latitude: store.coordinates?.latitude || 0,
                longitude: store.coordinates?.longitude || 0,
              },
              contact: {
                phone: store.contact?.phone || "Teléfono no disponible",
              },
              operatingHours: store.operatingHours || {},
              distanceKm: calculateDistance(
                lat,
                lng,
                store.coordinates?.latitude || 0,
                store.coordinates?.longitude || 0
              ),
              estimatedDeliveryDate: new Date(
                Date.now() + getEstimatedDeliveryTime(store.distanceKm) * 60 * 60 * 1000
              ).toISOString(),
            };
          }
        );

        // Filtrar tiendas que estén dentro del rango máximo
        const nearbyStoresFiltered = storesWithDistance.filter(
          (store) => store.distanceKm <= MAX_DISTANCE_KM
        );

        // Ordenar por distancia
        nearbyStoresFiltered.sort((a, b) => a.distanceKm - b.distanceKm);
        setNearbyStores(nearbyStoresFiltered);

        // Verificar si hay tiendas dentro del rango
        if (nearbyStoresFiltered.length === 0) {
          const closestStore = storesWithDistance[0];
          if (closestStore) {
            setError(
              `No hay tiendas disponibles en un radio de ${MAX_DISTANCE_KM} km. La tienda más cercana "${closestStore.name}" está a ${closestStore.distanceKm.toFixed(1)} km de distancia.`
            );
          } else {
            setError("No se encontraron tiendas disponibles.");
          }
          return;
        }

        // Agregar marcadores al mapa
        if (map) {
          const google = (window as any).google;
          const markers: any[] = [];

          nearbyStoresFiltered.forEach((store) => {
            const marker = new google.maps.Marker({
              position: {
                lat: store.coordinates.latitude,
                lng: store.coordinates.longitude,
              },
              map: map,
              title: store.name,
              icon: {
                url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
              },
            });

            const infoWindow = new google.maps.InfoWindow({
              content: `
                <div style="padding: 8px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 16px;">${store.name}</h3>
                  <p style="margin: 0; font-size: 14px;">${store.address.street}</p>
                  <p style="margin: 4px 0; font-size: 12px; color: #666;">
                    📍 ${store.distanceKm.toFixed(2)} km de distancia
                  </p>
                  <p style="margin: 4px 0; font-size: 12px; color: #666;">
                    📞 ${store.contact?.phone || "Teléfono no disponible"}
                  </p>
                  <button onclick="window.selectStoreFromMap('${store._id}')" 
                          style="margin-top: 8px; padding: 4px 8px; background: #4285F4; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                    Seleccionar esta tienda
                  </button>
                </div>
              `,
            });

            marker.addListener("click", () => {
              infoWindow.open(map, marker);
            });

            // Agregar referencia de la tienda al marcador
            marker.storeId = store._id;
            markers.push(marker);
          });

          setStoreMarkers(markers);
        }

        // Seleccionar automáticamente la tienda más cercana
        if (nearbyStoresFiltered.length > 0) {
          selectStore(nearbyStoresFiltered[0]);
        }
      } else {
        setError("No se encontraron tiendas disponibles");
      }
    } catch (error) {
      setError("Error buscando tiendas cercanas");
    }
  };

  // Manejar dirección simple (sin Google Places)
  const handleSimpleAddressSubmit = async (addressData: {
    fullAddress: string;
    components: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
    };
  }) => {
    setLoading(true);
    setError(null);

    try {
      // Geocodificar la dirección usando OpenStreetMap directamente
      const geocodeResponse = await geocodeAddressWithOSM(addressData.fullAddress);
      
      if (geocodeResponse.success && geocodeResponse.coordinates) {
        const userLoc = {
          lat: geocodeResponse.coordinates.latitude,
          lng: geocodeResponse.coordinates.longitude,
        };

        setUserLocation(userLoc);

        // Centrar mapa y agregar marcador del usuario en la ubicación exacta
        if (map) {
          const google = (window as any).google;
          map.setCenter(userLoc);
          map.setZoom(15);

          // Limpiar marcador anterior del usuario
          if (userMarker) {
            userMarker.setMap(null);
          }

          // Agregar marcador del usuario en la ubicación exacta que escribió
          const userMarkerInstance = new google.maps.Marker({
            position: userLoc,
            map: map,
            title: `Tu ubicación: ${addressData.fullAddress}`,
            icon: {
              url: "https://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            },
          });

          setUserMarker(userMarkerInstance);
        }

        // Buscar tiendas cercanas desde la ubicación exacta del usuario
        await findNearbyStores(userLoc.lat, userLoc.lng);
        setShowManualInput(false);
      } else {
        setError(geocodeResponse.error || "No se pudo encontrar la dirección especificada");
      }
    } catch (error) {
      setError(
        "Error al procesar la dirección. Intenta con una dirección más específica."
      );
    } finally {
      setLoading(false);
    }
  };

  // Función para geocodificar dirección usando OpenStreetMap directamente
  const geocodeAddressWithOSM = async (address: string): Promise<{
    success: boolean;
    coordinates?: { latitude: number; longitude: number };
    error?: string;
  }> => {
    try {
      // Usar Nominatim de OpenStreetMap para geocodificación
      const encodedAddress = encodeURIComponent(address);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=mx`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (data && data.length > 0) {
        const result = data[0];
        return {
          success: true,
          coordinates: {
            latitude: parseFloat(result.lat),
            longitude: parseFloat(result.lon),
          },
        };
      } else {
        return {
          success: false,
          error: "No se encontró la dirección especificada",
        };
      }
    } catch (error) {
      return {
        success: false,
        error: "Error al geocodificar la dirección",
      };
    }
  };

  // Función para geocodificación inversa (coordenadas a dirección)
  const reverseGeocode = async (lat: number, lng: number): Promise<{
    street: string;
    city: string;
    state: string;
    postalCode: string;
  }> => {
    try {
      console.log(`🌍 Geocodificando coordenadas: ${lat}, ${lng}`);
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const response = await fetch(url);
      const data = await response.json();
      
      console.log('🗺️ Respuesta de geocodificación:', data);
      
      if (data && data.address) {
        const addr = data.address;
        const result = {
          street: addr.road || addr.street || addr.neighbourhood || addr.suburb || "",
          city: addr.city || addr.town || addr.village || addr.municipality || "",
          state: addr.state || "",
          postalCode: addr.postcode || "",
        };
        console.log('✅ Dirección geocodificada:', result);
        return result;
      } else {
        console.log('⚠️ No se encontró dirección en la respuesta');
      }
    } catch (error) {
      console.error('❌ Error en geocodificación inversa:', error);
    }
    
    // Retornar valores vacíos si falla
    console.log('⚠️ Retornando dirección vacía');
    return {
      street: "",
      city: "",
      state: "",
      postalCode: "",
    };
  };

  // Calcular distancia usando fórmula de Haversine
  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calcular tiempo estimado de entrega basado en distancia (en horas)
  const getEstimatedDeliveryTime = (distanceKm: number): number => {
    if (distanceKm <= 5) {
      return 4; // 4 horas para tiendas muy cercanas
    } else if (distanceKm <= 15) {
      return 24; // 1 día para tiendas cercanas
    } else if (distanceKm <= 30) {
      return 48; // 2 días para tiendas moderadamente lejos
    } else {
      return 72; // 3 días para tiendas más lejanas
    }
  };

  // Generar texto amigable para el tiempo de entrega
  const getDeliveryTimeText = (estimatedDate: string): string => {
    const now = new Date();
    const deliveryDate = new Date(estimatedDate);
    const diffInHours = Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60));
    const diffInDays = Math.ceil(diffInHours / 24);

    if (diffInHours <= 1) {
      return "Estará listo en menos de 1 hora";
    } else if (diffInHours <= 6) {
      return `Estará listo en ${diffInHours} horas`;
    } else if (diffInHours <= 12) {
      return "Estará listo hoy por la tarde";
    } else if (diffInHours <= 24) {
      return "Estará listo mañana";
    } else if (diffInDays === 2) {
      return "Estará listo en 2 días";
    } else if (diffInDays === 3) {
      return "Estará listo en 3 días";
    } else if (diffInDays <= 7) {
      return `Estará listo en ${diffInDays} días`;
    } else {
      return `Estará listo en ${Math.ceil(diffInDays / 7)} semana${Math.ceil(diffInDays / 7) > 1 ? 's' : ''}`;
    }
  };

  // Mostrar ruta hacia la tienda seleccionada
  const showRouteToStore = (store: Store) => {
    if (!userLocation || !directionsService || !directionsRenderer) return;

    const request = {
      origin: { lat: userLocation.lat, lng: userLocation.lng },
      destination: {
        lat: store.coordinates.latitude,
        lng: store.coordinates.longitude,
      },
      travelMode: (window as any).google.maps.TravelMode.DRIVING,
    };

    directionsService.route(request, (result: any, status: any) => {
      if (status === "OK") {
        directionsRenderer.setDirections(result);

        // Extraer información de la ruta
        const route = result.routes[0];
        const leg = route.legs[0];
        setRouteInfo({
          distance: leg.distance.text,
          duration: leg.duration.text,
        });

        // Ajustar el zoom para mostrar toda la ruta con un poco de padding
        const bounds = new (window as any).google.maps.LatLngBounds();
        bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
        bounds.extend({
          lat: store.coordinates.latitude,
          lng: store.coordinates.longitude,
        });
        map.fitBounds(bounds, { padding: 50 });
      } else {
        setRouteInfo(null);
        // Si no se puede calcular la ruta, al menos centrar entre los dos puntos
        const bounds = new (window as any).google.maps.LatLngBounds();
        bounds.extend({ lat: userLocation.lat, lng: userLocation.lng });
        bounds.extend({
          lat: store.coordinates.latitude,
          lng: store.coordinates.longitude,
        });
        map.fitBounds(bounds, { padding: 50 });
      }
    });
  };

  // Resaltar marcador de tienda seleccionada
  const highlightStoreMarker = (selectedStoreId: string) => {
    storeMarkers.forEach((marker) => {
      if (marker.storeId === selectedStoreId) {
        // Cambiar a marcador verde para la tienda seleccionada
        marker.setIcon({
          url: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
        });
        marker.setZIndex(1000); // Traer al frente
      } else {
        // Mantener marcadores rojos para las demás tiendas
        marker.setIcon({
          url: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
        });
        marker.setZIndex(1);
      }
    });
  };

  // Seleccionar una tienda
  const selectStore = async (store: Store) => {
    setSelectedStore(store);

    // Resaltar marcador en el mapa
    highlightStoreMarker(store._id);

    // Mostrar ruta hacia la tienda
    showRouteToStore(store);

    // Si hay ubicación del usuario, obtener su dirección primero
    let customerAddress = null;
    if (onAddressChange && userLocation) {
      console.log('🔍 Obteniendo dirección del usuario...');
      const address = await reverseGeocode(userLocation.lat, userLocation.lng);
      customerAddress = {
        street: address.street || "Ubicación detectada",
        city: address.city || store.address.city,
        state: address.state || store.address.state,
        postalCode: address.postalCode || "",
        country: "México",
        latitude: userLocation.lat as any,
        longitude: userLocation.lng as any,
      } as unknown as CustomerAddress;
      
      console.log('📍 Dirección obtenida:', customerAddress);
      onAddressChange(customerAddress);
    }

    const storeData = {
      store,
      userLocation: userLocation, // Incluir ubicación del usuario
      customerAddress: customerAddress, // Incluir dirección del cliente
      summary: {
        storeName: store.name,
        distance: `${store.distanceKm.toFixed(2)} km`,
        estimatedDelivery: getDeliveryTimeText(store.estimatedDeliveryDate),
        address: `${store.address.street}, ${store.address.city}, ${store.address.state}`,
        phone: store.contact?.phone || "Teléfono no disponible",
      },
    };

    onStoreSelected(storeData);
  };

  // Función global para seleccionar tienda desde el mapa
  useEffect(() => {
    (window as any).selectStoreFromMap = (storeId: string) => {
      const store = nearbyStores.find((s) => s._id === storeId);
      if (store) {
        selectStore(store);
      }
    };

    return () => {
      delete (window as any).selectStoreFromMap;
    };
  }, [nearbyStores]);

  return (
    <div className="space-y-4">
      {/* Botones principales - SIEMPRE VISIBLES */}
      {!userLocation && !showManualInput && (
        <div className="space-y-3">
          <Button
            onClick={getUserLocation}
            disabled={loading || !isMapLoaded}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-md"
            size="lg"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Detectando ubicación...
              </>
            ) : (
              <>
                <Navigation className="mr-2 h-5 w-5" />
                📍 Detectar Mi Ubicación
              </>
            )}
          </Button>

          {/* Separador */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-2 text-gray-500 font-medium">O</span>
            </div>
          </div>

          <Button
            onClick={() => setShowManualInput(true)}
            disabled={loading || !isMapLoaded}
            variant="outline"
            className="w-full border-2 hover:bg-gray-50"
            size="lg"
          >
            <Edit3 className="mr-2 h-4 w-4" />
            ✏️ Escribir Mi Dirección
          </Button>

          {loading && (
            <div className="flex items-center justify-center gap-2 p-3 bg-blue-50 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <p className="text-sm text-blue-700 font-medium">
                Buscando tiendas cercanas...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Entrada manual de dirección */}
      {!userLocation && showManualInput && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Escribe tu dirección
            </h4>
            <Button
              onClick={() => {
                setShowManualInput(false);
                setError(null);
                setGeolocationDenied(false);
              }}
              variant="ghost"
              size="sm"
              className="text-blue-600 hover:text-blue-700"
            >
              ← Volver
            </Button>
          </div>

          <SimpleAddressInput
            onAddressSubmit={handleSimpleAddressSubmit}
            placeholder="Ej: Calle Hidalgo 15, Pedro Escobedo, Querétaro"
            label="Dirección completa"
            disabled={loading}
          />

          {loading && (
            <div className="flex items-center justify-center gap-2 p-4 bg-blue-50 rounded-lg">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <span className="text-sm text-blue-700 font-medium">
                Buscando tiendas cercanas...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className={`p-4 border-2 rounded-lg flex items-start gap-3 ${
            geolocationDenied
              ? "bg-amber-50 border-amber-300"
              : "bg-red-50 border-red-300"
          }`}
        >
          <AlertCircle
            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
              geolocationDenied ? "text-amber-600" : "text-red-600"
            }`}
          />
          <div className="flex-1">
            <p
              className={`text-sm font-semibold mb-1 ${
                geolocationDenied ? "text-amber-800" : "text-red-800"
              }`}
            >
              {geolocationDenied ? "⚠️ Ubicación no disponible" : "❌ Error"}
            </p>
            <p
              className={`text-sm ${
                geolocationDenied ? "text-amber-700" : "text-red-700"
              }`}
            >
              {error}
            </p>
            {geolocationDenied && !showManualInput && (
              <Button
                onClick={() => setShowManualInput(true)}
                size="sm"
                variant="outline"
                className="mt-3 border-amber-400 text-amber-700 hover:bg-amber-100"
              >
                ✏️ Escribir dirección manualmente
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Mapa - Solo mostrar cuando hay ubicación */}
      {userLocation && (
        <div
          ref={mapRef}
          className="w-full h-64 bg-gray-100 rounded-lg border-2 border-gray-200 shadow-sm"
          style={{ minHeight: "256px" }}
        >
          {!isMapLoaded && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                <p className="text-gray-600 text-sm font-medium">Cargando mapa...</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lista de tiendas */}
      {nearbyStores.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Store className="h-4 w-4" />
            Tiendas Cercanas ({nearbyStores.length})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {nearbyStores.map((store) => (
              <div
                key={store._id}
                className={`p-3 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedStore?._id === store._id
                    ? "border-green-500 bg-green-50 shadow-md"
                    : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"
                }`}
                onClick={() => selectStore(store)}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <h5 className="font-semibold text-gray-900 flex items-center gap-2">
                      {selectedStore?._id === store._id && <span className="text-green-600">✓</span>}
                      {store.name}
                    </h5>
                    <p className="text-sm text-gray-600 truncate">
                      📍 {store.address.street}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      📞 {store.contact?.phone || "Sin teléfono"}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-blue-600">
                      {store.distanceKm.toFixed(1)} km
                    </p>
                    <p className="text-xs text-gray-500">
                      ~{Math.ceil(store.distanceKm * 2)} min
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

        {/* Información de la tienda seleccionada */}
        {selectedStore && (
          <div className="bg-green-50 p-4 rounded-md border border-green-200">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium text-green-800">
                ✅ Tienda Seleccionada
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Limpiar ruta
                  if (directionsRenderer) {
                    directionsRenderer.setDirections({ routes: [] });
                  }
                  setRouteInfo(null);

                  // Volver a vista general
                  if (map && userLocation) {
                    const bounds = new (
                      window as any
                    ).google.maps.LatLngBounds();
                    bounds.extend({
                      lat: userLocation.lat,
                      lng: userLocation.lng,
                    });
                    nearbyStores.forEach((store) => {
                      bounds.extend({
                        lat: store.coordinates.latitude,
                        lng: store.coordinates.longitude,
                      });
                    });
                    map.fitBounds(bounds, { padding: 50 });
                  }
                }}
                className="text-xs"
              >
                Ver todas las tiendas
              </Button>
            </div>
            <p className="text-green-700 font-medium">{selectedStore.name}</p>
            <p className="text-green-600 text-sm">
              📍 {selectedStore.distanceKm.toFixed(2)} km de distancia
            </p>
            <p className="text-green-600 text-sm">
              🕒 {getDeliveryTimeText(selectedStore.estimatedDeliveryDate)}
            </p>
            {routeInfo && (
              <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                <p className="text-blue-700 text-sm font-medium">
                   Información de Ruta:
                </p>
                <p className="text-blue-600 text-sm">
                   Distancia: {routeInfo.distance}
                </p>
                <p className="text-blue-600 text-sm">
                   Tiempo estimado: {routeInfo.duration}
                </p>
              </div>
            )}
            <p className="text-green-600 text-sm mt-2">
              🗺️ Ruta mostrada en el mapa
            </p>
          </div>
        )}

      {/* Instrucciones */}
      {!userLocation && !showManualInput && (
        <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-700 font-medium mb-2">💡 Consejos:</p>
          <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
            <li>Permite el acceso a tu ubicación para encontrar tiendas automáticamente</li>
            <li>O escribe tu dirección si prefieres no compartir tu ubicación</li>
          </ul>
        </div>
      )}
    </div>
  );
}
