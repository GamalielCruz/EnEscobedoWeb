"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface GoogleMapsContextType {
  isLoaded: boolean;
  loadError: string | null;
}

const GoogleMapsContext = createContext<GoogleMapsContextType>({
  isLoaded: false,
  loadError: null,
});

export const useGoogleMaps = () => useContext(GoogleMapsContext);

interface GoogleMapsProviderProps {
  children: ReactNode;
  apiKey: string;
}

// Variable global para controlar la carga única
let googleMapsPromise: Promise<void> | null = null;

export function GoogleMapsProvider({ children, apiKey }: GoogleMapsProviderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
      setLoadError('API Key no configurada');
      return;
    }

    // Si ya está cargado, marcar como listo
    if (window.google && window.google.maps && window.google.maps.places) {
      setIsLoaded(true);
      return;
    }

    // Si ya hay una promesa de carga en progreso, usarla
    if (googleMapsPromise) {
      googleMapsPromise
        .then(() => setIsLoaded(true))
        .catch((error) => setLoadError(error.message));
      return;
    }

    // Crear nueva promesa de carga
    googleMapsPromise = new Promise((resolve, reject) => {
      // Verificar si ya hay un script cargándose
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      
      if (existingScript) {
        // Si ya hay un script, esperar a que termine
        const checkLoaded = () => {
          if (window.google && window.google.maps && window.google.maps.places) {
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }

      // Crear nuevo script
      const script = document.createElement('script');
      
      // Usar un callback global único y simple
      const callbackName = 'initGoogleMapsGlobal';
      
      // Limpiar callback anterior si existe
      if ((window as any)[callbackName]) {
        delete (window as any)[callbackName];
      }

      (window as any)[callbackName] = () => {
        resolve();
        // Limpiar callback después de usar
        setTimeout(() => {
          delete (window as any)[callbackName];
        }, 1000);
      };

      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=${callbackName}`;
      script.async = true;
      script.defer = true;
      
      script.onerror = () => {
        reject(new Error('Error cargando Google Maps API'));
      };

      document.head.appendChild(script);
    });

    // Usar la promesa
    googleMapsPromise
      .then(() => setIsLoaded(true))
      .catch((error) => setLoadError(error.message));

  }, [apiKey]);

  return (
    <GoogleMapsContext.Provider value={{ isLoaded, loadError }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}