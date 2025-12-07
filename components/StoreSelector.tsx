"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Navigation, Store } from "lucide-react";
import { SafeGoogleMapsLoader } from "./SafeGoogleMapsLoader";
import LocationBasedStoreSelector from "./LocationBasedStoreSelector";
import SimpleAddressInput from "./SimpleAddressInput";
import { CustomerAddress } from "@/lib/clickCollect";

interface StoreSelectorProps {
  onStoreSelected: (storeData: any) => void;
  onAddressChange?: (address: CustomerAddress) => void;
  apiKey: string;
}

export function StoreSelector({ onStoreSelected, onAddressChange, apiKey }: StoreSelectorProps) {
  const [selectedMethod, setSelectedMethod] = useState<'geolocation' | 'manual' | 'maps'>('manual');
  const [showMapsOption, setShowMapsOption] = useState(false);

  return (
    <div className="space-y-6">
      {/* Selector de método */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5" />
            Selecciona tu Método Preferido
          </CardTitle>
          <CardDescription>
            Elige cómo quieres encontrar la tienda más cercana
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Opción 1: Geolocalización */}
          <Button
            variant={selectedMethod === 'geolocation' ? 'default' : 'outline'}
            className="w-full justify-start h-auto p-4"
            onClick={() => setSelectedMethod('geolocation')}
          >
            <div className="flex items-start gap-3">
              <Navigation className="h-5 w-5 mt-0.5" />
              <div className="text-left">
                <div className="font-medium">Usar mi Ubicación Actual</div>
                <div className="text-sm opacity-75">Encuentra automáticamente las tiendas más cercanas</div>
              </div>
            </div>
          </Button>

          {/* Opción 2: Entrada Manual (Recomendada) */}
          <Button
            variant={selectedMethod === 'manual' ? 'default' : 'outline'}
            className="w-full justify-start h-auto p-4"
            onClick={() => setSelectedMethod('manual')}
          >
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 mt-0.5" />
              <div className="text-left">
                <div className="font-medium">Escribir mi Dirección</div>
                <div className="text-sm opacity-75">Ingresa tu dirección manualmente (Recomendado)</div>
              </div>
            </div>
          </Button>

          {/* Opción 3: Google Maps (Solo si está disponible) */}
          {!showMapsOption && (
            <Button
              variant="outline"
              className="w-full justify-start h-auto p-4 border-dashed"
              onClick={() => setShowMapsOption(true)}
            >
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5" />
                <div className="text-left">
                  <div className="font-medium">Probar con Google Maps</div>
                  <div className="text-sm opacity-75">Búsqueda avanzada con autocompletado (Experimental)</div>
                </div>
              </div>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Renderizar el método seleccionado */}
      {selectedMethod === 'manual' && (
        <Card>
          <CardHeader>
            <CardTitle>Ingresa tu Dirección</CardTitle>
            <CardDescription>
              Escribe tu dirección para encontrar las tiendas más cercanas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleAddressInput
              onAddressSubmit={(addressData) => {
                // Aquí necesitaríamos implementar la lógica de búsqueda de tiendas
                // Por ahora, mostrar un mensaje
                console.log('Dirección ingresada:', addressData);
                if (onAddressChange) {
                  onAddressChange({
                    street: addressData.components.street || addressData.fullAddress,
                    city: addressData.components.city || '',
                    state: addressData.components.state || '',
                    country: addressData.components.country || 'México',
                    postalCode: ''
                  });
                }
              }}
            />
          </CardContent>
        </Card>
      )}

      {selectedMethod === 'geolocation' && (
        <Card>
          <CardHeader>
            <CardTitle>Usando tu Ubicación</CardTitle>
            <CardDescription>
              Buscando tiendas cercanas a tu ubicación actual
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleAddressInput
              onAddressSubmit={(addressData) => {
                console.log('Dirección desde geolocalización:', addressData);
                if (onAddressChange) {
                  onAddressChange({
                    street: addressData.components.street || addressData.fullAddress,
                    city: addressData.components.city || '',
                    state: addressData.components.state || '',
                    country: addressData.components.country || 'México',
                    postalCode: ''
                  });
                }
              }}
              placeholder="Obteniendo tu ubicación..."
            />
          </CardContent>
        </Card>
      )}

      {(selectedMethod === 'maps' || showMapsOption) && (
        <Card>
          <CardHeader>
            <CardTitle>Búsqueda con Google Maps</CardTitle>
            <CardDescription>
              Búsqueda avanzada con autocompletado de direcciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SafeGoogleMapsLoader apiKey={apiKey}>
              {(isLoaded, error) => {
                if (error) {
                  return (
                    <div className="space-y-4">
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <p className="text-yellow-800 text-sm">
                          <strong>Google Maps no disponible:</strong> {error}
                        </p>
                        <p className="text-yellow-700 text-sm mt-1">
                          Puedes usar la búsqueda manual que funciona igual de bien.
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setSelectedMethod('manual')}
                        className="w-full"
                      >
                        ← Usar Búsqueda Manual
                      </Button>
                    </div>
                  );
                }

                if (!isLoaded) {
                  return (
                    <div className="flex items-center justify-center p-8">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                        <p className="text-gray-600">Cargando Google Maps...</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <LocationBasedStoreSelector
                      onStoreSelected={onStoreSelected}
                      onAddressChange={onAddressChange}
                      apiKey={apiKey}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedMethod('manual');
                        setShowMapsOption(false);
                      }}
                      className="w-full"
                    >
                      ← Volver a Búsqueda Simple
                    </Button>
                  </div>
                );
              }}
            </SafeGoogleMapsLoader>
          </CardContent>
        </Card>
      )}
    </div>
  );
}