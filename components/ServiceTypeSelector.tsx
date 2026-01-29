"use client";

import { useState, useEffect } from "react";
import { Check, Truck, Store, AlertCircle } from "lucide-react";

interface ServiceTypeSelectorProps {
  storeId?: string;
  onServiceTypeSelect: (type: 'delivery' | 'pickup') => void;
  selectedType?: 'delivery' | 'pickup' | null;
  restrictedType?: 'delivery' | 'pickup'; // Nuevo: restringir a un tipo específico
}

interface StoreServiceTypes {
  delivery: boolean;
  pickup: boolean;
  deliveryRadius?: number;
  minimumOrderDelivery?: number;
}

export default function ServiceTypeSelector({ 
  storeId, 
  onServiceTypeSelect, 
  selectedType,
  restrictedType
}: ServiceTypeSelectorProps) {
  const [serviceTypes, setServiceTypes] = useState<StoreServiceTypes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStoreServiceTypes = async () => {
      if (!storeId) {
        // Si no hay storeId específico, permitir ambos tipos por defecto
        setServiceTypes({
          delivery: true,
          pickup: true,
          deliveryRadius: 10,
          minimumOrderDelivery: 100
        });
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/store-service-types?storeId=${storeId}`);
        
        if (response.ok) {
          const data = await response.json();
          setServiceTypes(data.serviceTypes || {
            delivery: true,
            pickup: true,
            deliveryRadius: 10,
            minimumOrderDelivery: 100
          });
        } else {
          // Fallback en caso de error
          setServiceTypes({
            delivery: true,
            pickup: true,
            deliveryRadius: 10,
            minimumOrderDelivery: 100
          });
        }
      } catch (err) {
        console.error('Error fetching service types:', err);
        setError('Error al cargar tipos de servicio');
        // Fallback en caso de error
        setServiceTypes({
          delivery: true,
          pickup: true,
          deliveryRadius: 10,
          minimumOrderDelivery: 100
        });
      } finally {
        setLoading(false);
      }
    };

    fetchStoreServiceTypes();
  }, [storeId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 mb-1">¿Cómo quieres recibir tu pedido?</h2>
          <p className="text-sm text-gray-600">Cargando opciones disponibles...</p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="p-6 rounded-xl border-2 border-gray-200 animate-pulse">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-gray-200 rounded-full"></div>
                <div className="h-4 bg-gray-200 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 rounded mb-3"></div>
                <div className="space-y-1">
                  <div className="h-2 bg-gray-200 rounded"></div>
                  <div className="h-2 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Error al cargar opciones</h3>
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!serviceTypes) {
    return null;
  }

  // Verificar si al menos un servicio está disponible
  const hasAnyService = serviceTypes.delivery || serviceTypes.pickup;
  
  // Aplicar restricciones si se especifican
  const effectiveServiceTypes = restrictedType ? {
    ...serviceTypes,
    delivery: restrictedType === 'delivery' ? serviceTypes.delivery : false,
    pickup: restrictedType === 'pickup' ? serviceTypes.pickup : false
  } : serviceTypes;
  
  const hasEffectiveService = effectiveServiceTypes.delivery || effectiveServiceTypes.pickup;
  
  if (!hasAnyService) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 mx-auto text-yellow-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Servicios no disponibles</h3>
        <p className="text-sm text-gray-600">Esta tienda no tiene servicios de entrega o recogida habilitados temporalmente.</p>
      </div>
    );
  }

  if (!hasEffectiveService && restrictedType) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 mx-auto text-yellow-400 mb-3" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Servicio no disponible</h3>
        <p className="text-sm text-gray-600">
          Esta tienda no ofrece {restrictedType === 'delivery' ? 'entrega a domicilio' : 'recogida en tienda'}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center mb-4">
        <h2 className="text-xl font-bold text-gray-900 mb-1">¿Cómo quieres recibir tu pedido?</h2>
        <p className="text-sm text-gray-600">Selecciona la opción que más te convenga</p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-4">
        {/* Opción de Entrega a Domicilio */}
        {effectiveServiceTypes.delivery && (
          <button
            onClick={() => onServiceTypeSelect('delivery')}
            className={`group relative p-4 sm:p-6 rounded-xl border-2 transition-all duration-300 hover:shadow-md ${
              selectedType === 'delivery' 
                ? 'border-blue-500 bg-blue-50 shadow-md' 
                : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                <Truck className="h-6 w-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Entrega a Domicilio</h3>
              <p className="text-sm text-gray-600 mb-3">Recibe tu pedido en casa</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p>✓ Entrega rápida</p>
                <p>✓ Pago al recibir disponible</p>
                {serviceTypes.deliveryRadius && (
                  <p>📍 Radio: {serviceTypes.deliveryRadius} km</p>
                )}
                {serviceTypes.minimumOrderDelivery && (
                  <p>💰 Mínimo: ${serviceTypes.minimumOrderDelivery} MXN</p>
                )}
              </div>
            </div>
            {selectedType === 'delivery' && (
              <div className="absolute top-3 right-3 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
          </button>
        )}

        {/* Opción de Recoger en Tienda */}
        {effectiveServiceTypes.pickup && (
          <button
            onClick={() => onServiceTypeSelect('pickup')}
            className={`group relative p-4 sm:p-6 rounded-xl border-2 transition-all duration-300 hover:shadow-md ${
              selectedType === 'pickup' 
                ? 'border-green-500 bg-green-50 shadow-md' 
                : 'border-gray-200 hover:border-green-300 hover:bg-green-50'
            }`}
          >
            <div className="text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                <Store className="h-6 w-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Recoger en Tienda</h3>
              <p className="text-sm text-gray-600 mb-3">Recoge en la tienda más cercana</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p>✓ Sin costo de envío</p>
                <p>✓ Listo en minutos</p>
                <p>✓ Verificación en persona</p>
              </div>
            </div>
            {selectedType === 'pickup' && (
              <div className="absolute top-3 right-3 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
          </button>
        )}
      </div>

      {/* Mensaje informativo si solo hay un tipo de servicio disponible */}
      {effectiveServiceTypes.delivery && !effectiveServiceTypes.pickup && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
          <p className="text-sm text-blue-700">
            <strong>Solo entrega a domicilio disponible</strong> - Esta tienda no ofrece servicio de recogida en local.
          </p>
        </div>
      )}

      {!effectiveServiceTypes.delivery && effectiveServiceTypes.pickup && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
          <p className="text-sm text-green-700">
            <strong>Solo recogida en tienda disponible</strong> - Esta tienda no ofrece servicio de entrega a domicilio.
          </p>
        </div>
      )}

      {/* Mensaje si hay restricción aplicada */}
      {restrictedType && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
          <p className="text-sm text-yellow-700">
            <strong>Tipo de servicio restringido:</strong> Solo se permite {restrictedType === 'delivery' ? 'entrega a domicilio' : 'recogida en tienda'} para este pedido.
          </p>
        </div>
      )}
    </div>
  );
}