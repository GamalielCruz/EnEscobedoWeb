"use client";

import { MapPin, AlertCircle } from "lucide-react";

interface GoogleMapsFallbackProps {
  error?: string | null;
  isLoading?: boolean;
}

export function GoogleMapsFallback({ error, isLoading }: GoogleMapsFallbackProps) {
  if (isLoading) {
    return (
      <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Cargando mapa...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-64 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
        <div className="text-center p-4">
          <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <p className="text-red-700 font-medium mb-1">Error cargando el mapa</p>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-gray-600 text-xs mt-2">
            Puedes continuar seleccionando una tienda manualmente
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
      <div className="text-center">
        <MapPin className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-gray-600">Mapa no disponible</p>
      </div>
    </div>
  );
}