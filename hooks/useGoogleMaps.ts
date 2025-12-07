"use client";

import { useEffect, useState } from 'react';

interface UseGoogleMapsProps {
  apiKey: string;
  libraries?: string[];
}

interface UseGoogleMapsReturn {
  isLoaded: boolean;
  loadError: string | null;
}

// Variable global para rastrear el estado de carga
let googleMapsPromise: Promise<void> | null = null;
let isGoogleMapsLoaded = false;
let loadError: string | null = null;

export function useGoogleMaps({ 
  apiKey, 
  libraries = ['places'] 
}: UseGoogleMapsProps): UseGoogleMapsReturn {
  const [isLoaded, setIsLoaded] = useState(isGoogleMapsLoaded);
  const [error, setError] = useState<string | null>(loadError);

  useEffect(() => {
    // Si ya está cargado, no hacer nada
    if (isGoogleMapsLoaded) {
      setIsLoaded(true);
      return;
    }

    // Si ya hay un error previo, mostrarlo
    if (loadError) {
      setError(loadError);
      return;
    }

    // Si ya existe una promesa de carga, esperarla
    if (googleMapsPromise) {
      googleMapsPromise
        .then(() => {
          setIsLoaded(true);
          setError(null);
        })
        .catch((err) => {
          setError(err.message);
        });
      return;
    }

    // Si Google Maps ya está en window, marcarlo como cargado
    if ((window as any).google?.maps) {
      isGoogleMapsLoaded = true;
      setIsLoaded(true);
      return;
    }

    // Crear nueva promesa de carga
    googleMapsPromise = new Promise<void>((resolve, reject) => {
      // Verificar si ya existe el script
      const existingScript = document.querySelector(
        `script[src*="maps.googleapis.com/maps/api/js"]`
      );

      if (existingScript) {
        // Si el script ya existe, esperar a que se cargue
        const checkLoaded = () => {
          if ((window as any).google?.maps) {
            isGoogleMapsLoaded = true;
            resolve();
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
        return;
      }

      // Crear nuevo script con loading=async para mejor rendimiento
      const script = document.createElement('script');
      const librariesParam = libraries.length > 0 ? `&libraries=${libraries.join(',')}` : '';
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}${librariesParam}&loading=async`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        if ((window as any).google?.maps) {
          isGoogleMapsLoaded = true;
          resolve();
        } else {
          const error = 'Google Maps API no se cargó correctamente';
          loadError = error;
          reject(new Error(error));
        }
      };

      script.onerror = () => {
        const error = 'Error cargando Google Maps API';
        loadError = error;
        reject(new Error(error));
      };

      document.head.appendChild(script);
    });

    // Esperar la promesa
    googleMapsPromise
      .then(() => {
        setIsLoaded(true);
        setError(null);
      })
      .catch((err) => {
        setError(err.message);
      });

  }, [apiKey, libraries]);

  return { isLoaded, loadError: error };
}