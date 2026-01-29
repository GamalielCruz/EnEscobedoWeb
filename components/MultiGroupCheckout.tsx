"use client";

import { useState } from "react";
import { Truck, Store, Package, ChevronDown, ChevronUp } from "lucide-react";
import StepByStepCheckout from "./StepByStepCheckout";
import { type ServiceTypeGroup } from "@/lib/serviceTypeConflicts";

interface MultiGroupCheckoutProps {
  groups: ServiceTypeGroup[];
  onBackToCart: () => void;
}

export default function MultiGroupCheckout({ groups, onBackToCart }: MultiGroupCheckoutProps) {
  const [expandedGroups, setExpandedGroups] = useState<number[]>([0]); // Primer grupo expandido por defecto
  const [completedGroups, setCompletedGroups] = useState<number[]>([]);

  const toggleGroup = (index: number) => {
    setExpandedGroups(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const handleGroupCompleted = (groupIndex: number) => {
    setCompletedGroups(prev => [...prev, groupIndex]);
    // Expandir el siguiente grupo si existe
    if (groupIndex + 1 < groups.length && !expandedGroups.includes(groupIndex + 1)) {
      setExpandedGroups(prev => [...prev, groupIndex + 1]);
    }
  };

  const totalAmount = groups.reduce((sum, group) => sum + group.totalPrice, 0);
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-blue-900">
                Checkout por Restaurante
              </h2>
              <p className="text-sm text-blue-700">
                Tu carrito se ha dividido en {groups.length} pedidos separados por restaurante para mejor logística
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-blue-600">Total General</p>
            <p className="text-xl font-bold text-blue-900">${totalAmount.toFixed(2)}</p>
            <p className="text-xs text-blue-600">{totalItems} productos</p>
          </div>
        </div>
        
        <button
          onClick={onBackToCart}
          className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
        >
          ← Volver al carrito
        </button>
      </div>

      {/* Grupos de pedidos */}
      <div className="space-y-4">
        {groups.map((group, index) => (
          <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header del grupo */}
            <div 
              className={`p-4 cursor-pointer transition-colors ${
                expandedGroups.includes(index) 
                  ? 'bg-gray-50 border-b border-gray-200' 
                  : 'hover:bg-gray-50'
              }`}
              onClick={() => toggleGroup(index)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Store className="h-5 w-5 text-gray-600" />
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {group.storeName || `Restaurante ${index + 1}`}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {group.items.length} producto{group.items.length !== 1 ? 's' : ''} • ${group.totalPrice.toFixed(2)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {group.canDelivery && (
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
                          <Truck className="h-3 w-3 inline mr-1" />
                          Delivery
                        </span>
                      )}
                      {group.canPickup && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">
                          <Store className="h-3 w-3 inline mr-1" />
                          Pickup
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  {completedGroups.includes(index) && (
                    <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                      ✓ Completado
                    </span>
                  )}
                  {expandedGroups.includes(index) ? (
                    <ChevronUp className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>
            </div>

            {/* Contenido del grupo */}
            {expandedGroups.includes(index) && (
              <div className="p-4 bg-white">
                {/* Lista de productos */}
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Productos en este pedido:</h4>
                  <div className="space-y-2">
                    {group.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="flex items-center justify-between bg-gray-50 p-3 rounded">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.product.name}</p>
                          <p className="text-xs text-gray-600">
                            Cantidad: {item.quantity} • Precio: ${(item.product.price || 0).toFixed(2)}
                          </p>
                        </div>
                        <p className="font-semibold text-sm">
                          ${((item.product.price || 0) * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Checkout component para este grupo */}
                {!completedGroups.includes(index) && (
                  <div className="border-t border-gray-200 pt-4">
                    <StepByStepCheckout
                      groupedItems={group.items}
                      totalPrice={group.totalPrice}
                      cartStoreId={group.stores[0]} // Usar la primera tienda del grupo
                      forceStartFromStep1={true}
                      onCheckoutComplete={() => handleGroupCompleted(index)}
                      restrictedServiceType={group.serviceType === 'delivery' ? 'delivery' : 'pickup'}
                    />
                  </div>
                )}

                {completedGroups.includes(index) && (
                  <div className="border-t border-gray-200 pt-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                      <div className="text-green-600 mb-2">✓</div>
                      <h4 className="font-semibold text-green-800">Pedido Completado</h4>
                      <p className="text-sm text-green-700">
                        Este pedido ha sido procesado exitosamente
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer con progreso */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">
              Progreso: {completedGroups.length} de {groups.length} pedidos completados
            </p>
            <div className="w-48 bg-gray-200 rounded-full h-2 mt-2">
              <div 
                className="bg-green-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedGroups.length / groups.length) * 100}%` }}
              ></div>
            </div>
          </div>
          
          {completedGroups.length === groups.length && (
            <div className="text-right">
              <p className="text-green-600 font-semibold">¡Todos los pedidos completados! 🎉</p>
              <button
                onClick={onBackToCart}
                className="mt-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                Volver al inicio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}