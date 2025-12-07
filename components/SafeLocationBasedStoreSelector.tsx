"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, MapPin, Navigation } from "lucide-react";
import { SafeGoogleMapsLoader } from "./SafeGoogleMapsLoader";
import LocationBasedStoreSelector from "./LocationBasedStoreSelector";
import SimpleAddressInput from "./SimpleAddressInput";
import { CustomerAddress } from "@/lib/clickCollect";

interface SafeLocationBasedStoreSelectorProps {
  onStoreSelected: (storeData: any) => void;
  onAddressChange?: (address: CustomerAddress) => void;
  apiKey: string;
  filterStoreId?: string;
}

export function SafeLocationBasedStoreSelector({ 
  onStoreSelected, 
  onAddressChange, 
  apiKey,
  filterStoreId
}: SafeLocationBasedStoreSelectorProps) {
  const [useManualInput, setUseManualInput] = useState(false);

  // Si el usuario prefiere entrada manual o no hay API key
  if (useManualInput || !apiKey || apiKey.trim() === '' || apiKey === 'undefined') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Búsqueda Manual de Tiendas
          </CardTitle>
          <CardDescription>
            Ingresa tu dirección para encontrar las tiendas más cercanas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SimpleAddressInput
            onAddressSubmit={async (addressData) => {
              try {
                // Buscar tiendas cercanas usando la API
                const response = await fetch('/api/nearest-store', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    address: addressData.fullAddress,
                    filterStoreId: filterStoreId,
                  }),
                });

                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data.stores && data.data.stores.length > 0) {
                    // Seleccionar la primera tienda (más cercana)
                    const nearestStore = data.data.stores[0];
                    onStoreSelected({
                      store: nearestStore,
                      summary: {
                        storeName: nearestStore.name,
                        distance: `${nearestStore.distanceKm?.toFixed(1) || '0'} km`,
                        estimatedDelivery: nearestStore.estimatedDeliveryDate || 'mañana',
                        address: `${nearestStore.address.street}, ${nearestStore.address.city}`,
                        phone: nearestStore.contact?.phone || 'No disponible'
                      }
                    });

                    if (onAddressChange) {
                      onAddressChange({
                        street: addressData.components.street || addressData.fullAddress,
                        city: addressData.components.city || '',
                        state: addressData.components.state || '',
                        country: addressData.components.country || 'México',
                        postalCode: ''
                      });
                    }
                  } else {
                    alert('No se encontraron tiendas cercanas a tu dirección. Intenta con una dirección más específica.');
                  }
                } else {
                  alert('Error buscando tiendas. Por favor intenta de nuevo.');
                }
              } catch (error) {
                console.error('Error buscando tiendas:', error);
                alert('Error de conexión. Por favor intenta de nuevo.');
              }
            }}
            placeholder="Ej: Calle Hidalgo 15, Pedro Escobedo, Querétaro"
            label="Tu dirección"
          />
          
          {apiKey && apiKey.trim() !== '' && apiKey !== 'undefined' && (
            <Button
              variant="outline"
              onClick={() => setUseManualInput(false)}
              className="w-full"
            >
              🗺️ Probar con Google Maps (Avanzado)
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Usar Google Maps con manejo seguro
  return (
    <div className="space-y-4">
      <SafeGoogleMapsLoader apiKey={apiKey}>
        {(isLoaded, error) => {
          if (error) {
            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                    Google Maps No Disponible
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-700 text-sm mb-2">
                      <strong>Error:</strong> {error}
                    </p>
                    <p className="text-red-600 text-sm">
                      No te preocupes, puedes usar la búsqueda manual que funciona igual de bien.
                    </p>
                  </div>
                  <Button
                    onClick={() => setUseManualInput(true)}
                    className="w-full"
                  >
                    Continuar con Búsqueda Manual
                  </Button>
                </CardContent>
              </Card>
            );
          }

          if (!isLoaded) {
            return (
              <Card>
                <CardContent className="flex items-center justify-center p-8">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <p className="text-gray-600">Cargando Google Maps...</p>
                    <p className="text-gray-500 text-sm mt-1">Esto puede tomar unos segundos</p>
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <div className="space-y-4">
              <LocationBasedStoreSelector
                onStoreSelected={onStoreSelected}
                onAddressChange={onAddressChange}
                apiKey={apiKey}
                filterStoreId={filterStoreId}
              />
              
            </div>
          );
        }}
      </SafeGoogleMapsLoader>
    </div>
  );
}