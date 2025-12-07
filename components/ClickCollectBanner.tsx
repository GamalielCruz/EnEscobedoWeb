"use client";

import { useState } from "react";
import { Store, MapPin, ArrowRight, CheckCircle } from "lucide-react";
import Link from "next/link";
import StoreCheckerModal from "./StoreCheckerModal";
import ModalPortal from "./ModalPortal";

interface ClickCollectBannerProps {
  className?: string;
  compact?: boolean;
}

function ClickCollectBanner({ className = "", compact = false }: ClickCollectBannerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (compact) {
    return (
      <div>
        
      </div>
    );
  }

  return (
    <div className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ${className}`}>
      <div className="bg-gradient-to-r from-green-500 to-blue-600 text-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-white bg-opacity-20 p-2 rounded-lg">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">Click & Collect</h3>
              <p className="text-sm opacity-90">Recoge tu pedido en tienda</p>
            </div>
          </div>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <ArrowRight className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Envío Gratuito</p>
                <p className="text-xs text-gray-600">Sin costo de envío a la tienda</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Pago en Tienda</p>
                <p className="text-xs text-gray-600">Paga en efectivo al recoger</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Verificación</p>
                <p className="text-xs text-gray-600">Revisa antes de pagar</p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Notificaciones</p>
                <p className="text-xs text-gray-600">Te avisamos cuando esté listo</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex-1 bg-blue-600 text-white text-center py-2 px-4 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <MapPin className="w-4 h-4" />
              Verificar Tiendas Cercanas
            </button>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-600 text-center">
              <strong>¿Cómo funciona?</strong> Verifica si hay tiendas cercanas, añade productos a tu carrito, 
              y recibe tu pedido sin costo en la tienda seleccionada.
            </p>
          </div>
        </div>
      )}

      {/* Modal usando Portal seguro */}
      <ModalPortal isOpen={isModalOpen}>
        <StoreCheckerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onStoreFound={(store) => {
            console.log("Tienda encontrada:", store);
            // NO cerrar el modal automáticamente, dejar que el usuario vea la tienda y decida
          }}
        />
      </ModalPortal>
    </div>
  );
}

export default ClickCollectBanner;