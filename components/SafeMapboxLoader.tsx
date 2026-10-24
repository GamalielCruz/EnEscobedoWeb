"use client";

import { AlertCircle } from "lucide-react";
import { useMapbox } from "@/hooks/useMapbox";

interface SafeMapboxLoaderProps {
  children: (isLoaded: boolean, error: string | null) => React.ReactNode;
}

/**
 * Envoltorio de carga de Mapbox GL (sustituye a SafeGoogleMapsLoader).
 * Muestra el estado de carga/error y entrega el control cuando el paquete
 * `mapbox-gl` ya está disponible.
 */
export function SafeMapboxLoader({ children }: SafeMapboxLoaderProps) {
  const { isLoaded, loadError } = useMapbox();

  if (loadError) {
    return (
      <div className="w-full h-64 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
        <div className="text-center p-4 max-w-md">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium mb-2">Error cargando Mapbox</p>
          <p className="text-red-600 text-sm mb-3">{loadError}</p>
          <div className="text-gray-600 text-xs space-y-1">
            <p>• Verifica tu conexión a internet</p>
            <p>• Asegúrate de que NEXT_PUBLIC_MAPBOX_TOKEN esté configurado</p>
            <p>• Puedes continuar usando la búsqueda manual</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-64 bg-gray-50 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Cargando Mapbox...</p>
          <p className="text-gray-500 text-sm mt-1">Esto puede tomar unos segundos</p>
        </div>
      </div>
    );
  }

  return <>{children(isLoaded, loadError)}</>;
}
