"use client";

import { createContext, useContext, useEffect, useState } from 'react';

// Declaración de tipos para Google Maps
declare global {
  interface Window {
    google?: {
      maps?: {
        Map: any;
        places?: any;
        Geocoder: any;
        LatLng: any;
        Marker: any;
        InfoWindow: any;
        LatLngBounds: unknown;
      };
    };
  }
}

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: string | null;
  google: Window['google'] | null;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: null,
  google: null,
});

export const useGoogleMapsContext = () => useContext(GoogleMapsContext);

interface GoogleMapsProviderProps {
  children: React.ReactNode;
  apiKey: string;
}

export function GoogleMapsProvider({ children, apiKey }: GoogleMapsProviderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [googleInstance, setGoogleInstance] = useState<Window['google'] | null>(null);

  useEffect(() => {
    // Si no hay API key, no intentar cargar
    if (!apiKey || apiKey === 'undefined' || apiKey === '') {
      setLoadError('Google Maps API key no configurada');
      return;
    }

    // Si ya está cargado globalmente
    if (typeof window !== 'undefined' && window.google?.maps) {
      setIsLoaded(true);
      setGoogleInstance(window.google);
      return;
    }

    // Si ya existe el script, esperar a que cargue
    const existingScript = document.querySelector(
      'script[src*="maps.googleapis.com"]'
    );

    if (existingScript) {
      const checkLoaded = () => {
        if (window.google?.maps) {
          setIsLoaded(true);
          setGoogleInstance(window.google);
        } else {
          setTimeout(checkLoaded, 100);
        }
      };
      checkLoaded();
      return;
    }

    // Cargar Google Maps
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;

    script.onload = () => {
      // Verificar que Google Maps se cargó correctamente
      if (window.google?.maps?.Map) {
        setIsLoaded(true);
        setGoogleInstance(window.google);
        setLoadError(null);
      } else {
        setLoadError('Google Maps no se cargó correctamente');
      }
    };

    script.onerror = () => {
      setLoadError('Error cargando Google Maps API. Verifica tu API key.');
    };

    // Timeout de seguridad
    const timeout = setTimeout(() => {
      if (!isLoaded) {
        setLoadError('Timeout cargando Google Maps API');
      }
    }, 10000); // 10 segundos

    document.head.appendChild(script);

    return () => {
      clearTimeout(timeout);
    };
  }, [apiKey, isLoaded]);

  return (
    <GoogleMapsContext.Provider 
      value={{ 
        isLoaded, 
        loadError, 
        google: googleInstance 
      }}
    >
      {children}
    </GoogleMapsContext.Provider>
  );
}