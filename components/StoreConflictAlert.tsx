"use client";

import { useState, useEffect } from 'react';
import { AlertTriangle, X, ShoppingCart } from 'lucide-react';

interface StoreConflictAlertProps {
  isOpen: boolean;
  onClose: () => void;
  currentStoreName: string;
  newStoreName: string;
  onClearCart: () => void;
}

export default function StoreConflictAlert({
  isOpen,
  onClose,
  currentStoreName,
  newStoreName,
  onClearCart
}: StoreConflictAlertProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Asegurar que los nombres son strings válidos
  const safeCurrentStoreName = String(currentStoreName || 'Tienda actual');
  const safeNewStoreName = String(newStoreName || 'Nueva tienda');

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300); // Esperar a que termine la animación
  };

  const handleClearAndClose = () => {
    onClearCart();
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div 
        className={`absolute inset-0 bg-black transition-opacity duration-300 ${
          isVisible ? 'opacity-50' : 'opacity-0'
        }`}
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div 
        className={`relative bg-white rounded-xl shadow-2xl max-w-md w-full transform transition-all duration-300 ${
          isVisible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-6 pb-4">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900">
              Solo una tienda a la vez
            </h3>
            <p className="text-sm text-gray-600">
              Para mantener tu pedido organizado
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <ShoppingCart className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Tu carrito actual:</span>
              </div>
              <p className="text-sm text-gray-700 font-medium">{safeCurrentStoreName}</p>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-900">Producto que intentas agregar:</span>
              </div>
              <p className="text-sm text-blue-800 font-medium">{safeNewStoreName}</p>
            </div>

            <div className="text-sm text-gray-600">
              <p className="mb-2">
                <strong>¿Por qué esta restricción?</strong>
              </p>
              <ul className="space-y-1 text-xs">
                <li>• Evita confusión en los tiempos de entrega</li>
                <li>• Simplifica el proceso de pago</li>
                <li>• Mejora la experiencia de compra</li>
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors font-medium"
            >
              Continuar con {safeCurrentStoreName}
            </button>
            <button
              onClick={handleClearAndClose}
              className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
            >
              Cambiar a {safeNewStoreName}
            </button>
          </div>

          <p className="text-xs text-gray-500 text-center mt-3">
            Al cambiar de tienda, se vaciará tu carrito actual
          </p>
        </div>
      </div>
    </div>
  );
}