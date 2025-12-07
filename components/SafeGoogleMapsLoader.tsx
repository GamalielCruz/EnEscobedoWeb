"use client";

import { useEffect, useState } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';

interface SafeGoogleMapsLoaderProps {
  apiKey: string;
  children: (isLoaded: boolean, error: string | null) => React.ReactNode;
}

export function SafeGoogleMapsLoader({ apiKey, children }: SafeGoogleMapsLoaderProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Si no hay API key, mostrar error inmediatamente
    if (!apiKey || apiKey === 'undefined' || apiKey.trim() === '') {
      setError('Google Maps API key no configurada');
      setIsLoading(false);
      return;
    }

    // Si Google Maps ya está disponible
    if (typeof window !== 'undefined' && (window as any).google?.maps?.Map) {
      setIsLoaded(true);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Verificar si ya existe el script
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    
    if (existingScript) {
      // Script ya existe, esperar a que cargue
      const checkInterval = setInterval(() => {
        if ((window as any).google?.maps?.Map) {
          setIsLoaded(true);
          setIsLoading(false);
          setError(null);
          clearInterval(checkInterval);
        }
      }, 100);

      // Timeout después de 15 segundos
      setTimeout(() => {
        clearInterval(checkInterval);
        if (!isLoaded) {
          setError('Timeout cargando Google Maps. Verifica tu conexión.');
          setIsLoading(false);
        }
      }, 15000);

      return () => clearInterval(checkInterval);
    }

    // Cargar Google Maps por primera vez
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async`;
    script.async = true;
    script.defer = true;

    const handleLoad = () => {
      // Verificar múltiples veces que Google Maps esté realmente disponible
      let attempts = 0;
      const maxAttempts = 50; // 5 segundos máximo
      
      const checkGoogleMaps = () => {
        attempts++;
        
        if ((window as any).google?.maps?.Map) {
          setIsLoaded(true);
          setIsLoading(false);
          setError(null);
        } else if (attempts < maxAttempts) {
          setTimeout(checkGoogleMaps, 100);
        } else {
          setError('Google Maps no se inicializó correctamente. Verifica tu API key.');
          setIsLoading(false);
        }
      };
      
      checkGoogleMaps();
    };

    const handleError = () => {
      setError('Error cargando Google Maps. Verifica tu API key y conexión.');
      setIsLoading(false);
    };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    // Timeout general
    const timeout = setTimeout(() => {
      if (!isLoaded && !error) {
        setError('Timeout cargando Google Maps API');
        setIsLoading(false);
      }
    }, 20000); // 20 segundos

    document.head.appendChild(script);

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
      clearTimeout(timeout);
    };
  }, [apiKey, isLoaded]);

  // Mostrar estado de carga
  if (isLoading) {
    return (
      <div className="w-full h-64 bg-gray-50 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Cargando Google Maps...</p>
          <p className="text-gray-500 text-sm mt-1">Esto puede tomar unos segundos</p>
        </div>
      </div>
    );
  }

  // Mostrar error si hay alguno
  if (error) {
    return (
      <div className="w-full h-64 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
        <div className="text-center p-4 max-w-md">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium mb-2">Error cargando Google Maps</p>
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <div className="text-gray-600 text-xs space-y-1">
            <p>• Verifica que tu API key esté configurada correctamente</p>
            <p>• Asegúrate de que tu dominio esté autorizado</p>
            <p>• Puedes continuar usando la búsqueda manual</p>
          </div>
        </div>
      </div>
    );
  }

  // Renderizar children cuando esté cargado
  return <>{children(isLoaded, error)}</>;
}