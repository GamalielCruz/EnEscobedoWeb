"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Package, Truck, Store, ArrowRight } from "lucide-react";
import { 
  analyzeServiceTypeConflicts, 
  getStoresServiceConfig, 
  generateConflictSummary,
  type GroupedBasketItem,
  type ServiceTypeGroup 
} from "@/lib/serviceTypeConflicts";

interface ServiceConflictHandlerProps {
  groupedItems: GroupedBasketItem[];
  onGroupsResolved: (groups: ServiceTypeGroup[]) => void;
  onNoConflicts: () => void;
}

export default function ServiceConflictHandler({ 
  groupedItems, 
  onGroupsResolved, 
  onNoConflicts 
}: ServiceConflictHandlerProps) {
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState<any>(null);
  const [storeConfigs, setStoreConfigs] = useState<any>({});
  const [selectedSolution, setSelectedSolution] = useState<'separate' | 'choose' | null>(null);

  useEffect(() => {
    analyzeCart();
  }, [groupedItems]);

  const analyzeCart = async () => {
    setLoading(true);
    
    try {
      // Obtener IDs únicos de tiendas
      const storeIds = [...new Set(
        groupedItems
          .map(item => item.product.affiliateStore?._id)
          .filter(Boolean) as string[]
      )];

      if (storeIds.length === 0) {
        onNoConflicts();
        return;
      }

      // Obtener configuraciones de servicio
      const configs = await getStoresServiceConfig(storeIds);
      setStoreConfigs(configs);

      // Analizar conflictos
      const conflictAnalysis = analyzeServiceTypeConflicts(groupedItems, configs);
      setAnalysis(conflictAnalysis);

      if (!conflictAnalysis.hasConflicts && !conflictAnalysis.needsSeparation) {
        onNoConflicts();
      }
    } catch (error) {
      console.error('Error analizando conflictos:', error);
      onNoConflicts(); // Fallback en caso de error
    } finally {
      setLoading(false);
    }
  };

  const handleSeparateOrders = () => {
    if (analysis?.groups) {
      onGroupsResolved(analysis.groups);
    }
  };

  const handleChooseItems = (groupIndex: number) => {
    if (analysis?.groups && analysis.groups[groupIndex]) {
      onGroupsResolved([analysis.groups[groupIndex]]);
    }
  };

  if (loading) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-600"></div>
          <div>
            <h3 className="font-semibold text-yellow-800">Analizando compatibilidad...</h3>
            <p className="text-sm text-yellow-700">Verificando tipos de servicio de las tiendas</p>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis?.hasConflicts && !analysis?.needsSeparation) {
    return null; // No mostrar nada si no hay conflictos ni necesidad de separación
  }

  const isConflict = analysis.hasConflicts;
  const needsSeparation = analysis.needsSeparation;

  return (
    <div className={`border rounded-lg p-6 mb-6 ${
      isConflict ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-200'
    }`}>
      <div className="flex items-start gap-3 mb-4">
        {isConflict ? (
          <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
        ) : (
          <Package className="h-6 w-6 text-blue-600 flex-shrink-0 mt-0.5" />
        )}
        <div className="flex-1">
          <h3 className={`font-semibold mb-2 ${
            isConflict ? 'text-red-800' : 'text-blue-800'
          }`}>
            {isConflict ? 'Servicios Incompatibles Detectados' : 'Múltiples Restaurantes Detectados'}
          </h3>
          <p className={`text-sm mb-4 ${
            isConflict ? 'text-red-700' : 'text-blue-700'
          }`}>
            {generateConflictSummary(analysis, storeConfigs)}
          </p>
          <p className={`text-sm ${
            isConflict ? 'text-red-600' : 'text-blue-600'
          }`}>
            {isConflict 
              ? 'Los productos en tu carrito provienen de restaurantes con servicios incompatibles. Elige cómo proceder:'
              : 'Para una mejor experiencia y logística, recomendamos separar tu pedido por restaurante:'
            }
          </p>
        </div>
      </div>

      {/* Opciones de solución */}
      <div className="space-y-4">
        {/* Opción 1: Separar en múltiples pedidos */}
        <div className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
          selectedSolution === 'separate' 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-200 hover:border-blue-300'
        }`} onClick={() => setSelectedSolution('separate')}>
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="solution"
              checked={selectedSolution === 'separate'}
              onChange={() => setSelectedSolution('separate')}
              className="mt-1"
            />
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-2">
                Separar por Restaurante (Recomendado)
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                {isConflict 
                  ? 'Dividiremos automáticamente tu carrito en pedidos separados según el tipo de servicio disponible.'
                  : 'Dividiremos tu carrito por restaurante para una mejor logística y experiencia de entrega.'
                }
              </p>
              
              {/* Vista previa de los grupos */}
              <div className="space-y-2">
                {analysis.groups.map((group: ServiceTypeGroup, index: number) => (
                  <div key={index} className="bg-white border border-gray-200 rounded p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Store className="h-4 w-4 text-gray-600" />
                      <span className="font-medium text-sm">
                        {group.storeName || `Restaurante ${index + 1}`}
                      </span>
                      <span className="text-sm text-gray-500">
                        (${group.totalPrice.toFixed(2)})
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">
                      {group.items.length} producto{group.items.length !== 1 ? 's' : ''}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {group.canDelivery && (
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          <Truck className="h-3 w-3 inline mr-1" />
                          Delivery
                        </span>
                      )}
                      {group.canPickup && (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded">
                          <Store className="h-3 w-3 inline mr-1" />
                          Pickup
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Opción 2: Elegir un grupo de productos */}
        <div className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
          selectedSolution === 'choose' 
            ? 'border-blue-500 bg-blue-50' 
            : 'border-gray-200 hover:border-blue-300'
        }`} onClick={() => setSelectedSolution('choose')}>
          <div className="flex items-start gap-3">
            <input
              type="radio"
              name="solution"
              checked={selectedSolution === 'choose'}
              onChange={() => setSelectedSolution('choose')}
              className="mt-1"
            />
            <div className="flex-1">
              <h4 className="font-semibold text-gray-900 mb-2">
                Elegir Solo un Tipo de Servicio
              </h4>
              <p className="text-sm text-gray-600 mb-3">
                Mantén solo los productos que sean compatibles con un tipo de servicio.
              </p>
              
              {selectedSolution === 'choose' && (
                <div className="space-y-2">
                  {analysis.groups.map((group: ServiceTypeGroup, index: number) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleChooseItems(index);
                      }}
                      className="w-full text-left bg-white border border-gray-200 rounded p-3 hover:border-blue-300 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {group.serviceType === 'delivery' ? (
                            <Truck className="h-4 w-4 text-blue-600" />
                          ) : (
                            <Store className="h-4 w-4 text-green-600" />
                          )}
                          <span className="font-medium text-sm">
                            Solo {group.serviceType === 'delivery' ? 'Entrega a Domicilio' : 'Recoger en Tienda'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span>${group.totalPrice.toFixed(2)}</span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {group.items.length} producto{group.items.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Botón de acción */}
      {selectedSolution === 'separate' && (
        <div className="mt-4 pt-4 border-t border-red-200">
          <button
            onClick={handleSeparateOrders}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Continuar con Pedidos Separados
          </button>
          <p className="text-xs text-gray-600 text-center mt-2">
            Podrás completar cada pedido por separado con su tipo de servicio correspondiente
          </p>
        </div>
      )}
    </div>
  );
}