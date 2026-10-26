"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Navigation, Loader2, AlertCircle, MapPin, Edit3, Store } from "lucide-react";
import SimpleAddressInput from "./SimpleAddressInput";
import { CustomerAddress } from "@/lib/clickCollect";
import { useMapbox } from "@/hooks/useMapbox";
import {
  MapboxMap,
  type MapboxMapLine,
  type MapboxMapMarker,
} from "@/components/map/MapboxMap";
import {
  MAPBOX_DEFAULT_CENTER,
  mapboxDirections,
  mapboxForwardGeocode,
  mapboxReverseGeocode,
  type MapboxPoint,
} from "@/lib/mapbox";

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
  filterStoreId?: string;
}

export default function LocationBasedStoreSelector({
  onStoreSelected,
  onAddressChange,
  filterStoreId,
}: LocationBasedStoreSelectorProps) {
  // Distancia máxima para mostrar tiendas (en kilómetros)
  const MAX_DISTANCE_KM = 50;
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [nearbyStores, setNearbyStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<MapboxPoint[]>([]);
  const [fitPoints, setFitPoints] = useState<MapboxPoint[] | null>(null);
  const [routeInfo, setRouteInfo] = useState<{
    distance: string;
    duration: string;
  } | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  const [geolocationDenied, setGeolocationDenied] = useState(false);
  const [autoLocationAttempted, setAutoLocationAttempted] = useState(false);

  // Cargar Mapbox GL (sustituye a useGoogleMaps)
  const { isLoaded: isMapLoaded, loadError } = useMapbox();

  // Actualizar error si hay problema cargando el mapa
  useEffect(() => {
    if (loadError) {
      setError(loadError);
    }
  }, [loadError]);

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
        setFitPoints([location]);

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
      // Limpiar ruta anterior
      setRoutePath([]);
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

        // Encuadrar el mapa: usuario + tiendas disponibles
        setFitPoints([
          { lat, lng },
          ...nearbyStoresFiltered.map((store) => ({
            lat: store.coordinates.latitude,
            lng: store.coordinates.longitude,
          })),
        ]);

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

  // Manejar dirección simple
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
      // Geocodificar la dirección con Mapbox (fallback Nominatim)
      const geocodeResponse = await geocodeAddressWithMapbox(addressData.fullAddress);

      if (geocodeResponse.success && geocodeResponse.coordinates) {
        const userLoc = {
          lat: geocodeResponse.coordinates.latitude,
          lng: geocodeResponse.coordinates.longitude,
        };

        setUserLocation(userLoc);
        setFitPoints([userLoc]);

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

  // Geocodificación directa con Mapbox
  const geocodeAddressWithMapbox = async (address: string): Promise<{
    success: boolean;
    coordinates?: { latitude: number; longitude: number };
    error?: string;
  }> => {
    const [result] = await mapboxForwardGeocode(address, {
      limit: 1,
      country: "mx",
    });
    if (!result) {
      return {
        success: false,
        error: "No se encontró la dirección especificada",
      };
    }
    return {
      success: true,
      coordinates: {
        latitude: result.latitude,
        longitude: result.longitude,
      },
    };
  };

  // Geocodificación inversa (coordenadas a dirección) con Mapbox
  const reverseGeocode = async (
    lat: number,
    lng: number
  ): Promise<{
    street: string;
    city: string;
    state: string;
    postalCode: string;
  }> => {
    const result = await mapboxReverseGeocode(lat, lng, { language: "es" });
    return {
      street: result?.street ?? "",
      city: result?.city ?? "",
      state: result?.state ?? "",
      postalCode: result?.postalCode ?? "",
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

  // Mostrar ruta hacia la tienda seleccionada (Mapbox Directions)
  const showRouteToStore = async (store: Store) => {
    if (!userLocation) return;

    const origin = { lat: userLocation.lat, lng: userLocation.lng };
    const destination = {
      lat: store.coordinates.latitude,
      lng: store.coordinates.longitude,
    };

    const route = await mapboxDirections(origin, destination, {
      profile: "driving-traffic",
      language: "es",
    });

    if (route) {
      setRoutePath(route.path);
      setRouteInfo({
        distance: route.distanceText ?? "",
        duration: route.durationText ?? "",
      });
      setFitPoints(route.path);
    } else {
      setRoutePath([]);
      setRouteInfo(null);
      // Si no se puede calcular la ruta, al menos encuadrar los dos puntos
      setFitPoints([origin, destination]);
    }
  };

  // Seleccionar una tienda
  const selectStore = async (store: Store) => {
    setSelectedStore(store);

    // Mostrar ruta hacia la tienda
    void showRouteToStore(store);

    // Si hay ubicación del usuario, obtener su dirección primero
    let customerAddress = null;
    if (onAddressChange && userLocation) {
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

  // Marcadores declarativos (usuario + tiendas, resaltando la seleccionada)
  const markers = useMemo<MapboxMapMarker[]>(() => {
    const list: MapboxMapMarker[] = [];
    if (userLocation) {
      list.push({
        id: "user-location",
        lat: userLocation.lat,
        lng: userLocation.lng,
        color: "#2563EB",
        size: 8,
        title: "Tu ubicación",
        zIndex: 900,
      });
    }
    nearbyStores.forEach((store) => {
      const selected = selectedStore?._id === store._id;
      list.push({
        id: `store-${store._id}`,
        lat: store.coordinates.latitude,
        lng: store.coordinates.longitude,
        color: selected ? "#16A34A" : "#EF4444",
        variant: "pin",
        size: selected ? 16 : 13,
        title: `${store.name} · ${store.distanceKm.toFixed(1)} km`,
        zIndex: selected ? 1000 : 1,
        onClick: () => void selectStore(store),
      });
    });
    return list;
  }, [userLocation, nearbyStores, selectedStore]);

  const routeLines = useMemo<MapboxMapLine[]>(() => {
    if (routePath.length < 2) return [];
    return [
      {
        id: "store-route",
        points: routePath,
        color: "#4285F4",
        width: 4,
        opacity: 0.85,
      },
    ];
  }, [routePath]);

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
        <div className="w-full h-64 bg-gray-100 rounded-lg border-2 border-gray-200 shadow-sm overflow-hidden">
          {isMapLoaded ? (
            <MapboxMap
              className="w-full h-full"
              center={userLocation ?? MAPBOX_DEFAULT_CENTER}
              zoom={13}
              showControls
              markers={markers}
              lines={routeLines}
              fitPoints={fitPoints ?? undefined}
              fitPadding={50}
            />
          ) : (
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
                onClick={() => void selectStore(store)}
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
                  setRoutePath([]);
                  setRouteInfo(null);

                  // Volver a vista general (usuario + todas las tiendas)
                  if (userLocation) {
                    setFitPoints([
                      { lat: userLocation.lat, lng: userLocation.lng },
                      ...nearbyStores.map((store) => ({
                        lat: store.coordinates.latitude,
                        lng: store.coordinates.longitude,
                      })),
                    ]);
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
