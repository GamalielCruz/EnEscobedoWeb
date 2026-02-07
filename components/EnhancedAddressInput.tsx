"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, Edit3, Navigation } from "lucide-react";
import GooglePlacesAutocomplete from "./GooglePlacesAutocomplete";
import SimpleAddressInput from "./SimpleAddressInput";

interface EnhancedAddressInputProps {
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
  apiKey: string;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
}

export default function EnhancedAddressInput({
  onAddressSelected,
  apiKey,
  placeholder = "Ej: Calle Hidalgo 123, Centro, Pedro Escobedo, Querétaro",
  label = "Dirección completa",
  disabled = false,
}: EnhancedAddressInputProps) {
  const [useManualInput, setUseManualInput] = useState(false);
  const [loading, setLoading] = useState(false);

  // Manejar selección de Google Places
  const handleGooglePlaceSelected = (place: google.maps.places.PlaceResult) => {
    console.log('🗺️ Google Place seleccionado:', place);
    
    try {
      // Extraer componentes de dirección
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
        address: street.trim() || place.formatted_address || '',
        city: city || 'Pedro Escobedo',
        state: state || 'Querétaro',
        postal_code: postal_code || '76240',
        country: country,
        latitude: place.geometry?.location?.lat() || 0,
        longitude: place.geometry?.location?.lng() || 0,
      };

      console.log('📍 Datos de dirección procesados:', addressData);
      onAddressSelected(addressData);
    } catch (error) {
      console.error('Error procesando lugar de Google:', error);
    }
  };

  // Manejar entrada manual con geocodificación
  const handleManualAddressSubmit = async (addressData: {
    fullAddress: string;
    components: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
    };
  }) => {
    setLoading(true);
    
    try {
      // Geocodificar usando OpenStreetMap
      const geocodeResponse = await geocodeAddressWithOSM(addressData.fullAddress);
      
      if (geocodeResponse.success && geocodeResponse.coordinates) {
        const processedAddress = {
          formatted_address: addressData.fullAddress,
          address: addressData.components.street || addressData.fullAddress,
          city: addressData.components.city || 'Pedro Escobedo',
          state: addressData.components.state || 'Querétaro',
          postal_code: '76240',
          country: addressData.components.country || 'México',
          latitude: geocodeResponse.coordinates.latitude,
          longitude: geocodeResponse.coordinates.longitude,
        };

        console.log('📍 Dirección manual geocodificada:', processedAddress);
        onAddressSelected(processedAddress);
      } else {
        alert('No se pudo encontrar la dirección especificada. Intenta con una dirección más específica.');
      }
    } catch {
      console.error('Error geocodificando dirección manual');
      alert('Error procesando la dirección. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  // Función para geocodificar usando OpenStreetMap
  const geocodeAddressWithOSM = async (address: string): Promise<{
    success: boolean;
    coordinates?: { latitude: number; longitude: number };
    error?: string;
  }> => {
    try {
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

  // Si no hay API key o el usuario prefiere entrada manual
  if (useManualInput || !apiKey || apiKey.trim() === '' || apiKey === 'undefined') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            Ingresa tu Dirección
          </CardTitle>
          <CardDescription>
            Escribe tu dirección completa para encontrar tiendas cercanas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SimpleAddressInput
            onAddressSubmit={handleManualAddressSubmit}
            placeholder={placeholder}
            disabled={disabled || loading}
          />
          
          {apiKey && apiKey.trim() !== '' && apiKey !== 'undefined' && (
            <Button
              variant="outline"
              onClick={() => setUseManualInput(false)}
              className="w-full"
              disabled={loading}
            >
              <Navigation className="mr-2 h-4 w-4" />
              Usar Autocompletado de Google (Recomendado)
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // Usar Google Places Autocomplete
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Busca tu Dirección
        </CardTitle>
        <CardDescription>
          Escribe tu dirección y selecciona una opción de la lista
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GooglePlacesAutocomplete
          onPlaceSelected={handleGooglePlaceSelected as any}
          placeholder={placeholder}
          label={label}
          disabled={disabled}
          apiKey={apiKey}
        />
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-muted-foreground">O</span>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={() => setUseManualInput(true)}
          className="w-full"
          disabled={disabled}
        >
          <Edit3 className="mr-2 h-4 w-4" />
          Ingresar Dirección Manualmente
        </Button>

        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 El autocompletado te ayuda a encontrar direcciones exactas</p>
          <p>🎯 Selecciona una opción de la lista para mejores resultados</p>
        </div>
      </CardContent>
    </Card>
  );
}