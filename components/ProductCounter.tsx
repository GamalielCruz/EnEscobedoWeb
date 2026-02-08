"use client";

import { useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import useBasketStore from "@/store/store";

interface ProductCounterProps {
  product: any;
  onAddComplete?: () => void;
  onOpenSidebar?: () => void;
}

export default function ProductCounter({ product, onAddComplete, onOpenSidebar }: ProductCounterProps) {
  const { addItem, removeItem, getItemCount } = useBasketStore();
  const [isVisible, setIsVisible] = useState(false);

  // Obtener cantidad actual del producto del basket global
  const currentQuantity = getItemCount(product._id);

  // Verificar si el producto tiene opciones obligatorias
  const hasRequiredOptions = product.optionGroups?.some((group: any) => group.required === true) || false;

  const handleAdd = () => {
    addItem(product);
  };

  const handleRemove = () => {
    if (currentQuantity > 0) {
      removeItem(product._id);
    }
  };

  const handleQuickAdd = () => {
    // Si el producto tiene opciones obligatorias, abrir sidebar en lugar de añadir directamente
    if (hasRequiredOptions) {
      onOpenSidebar?.();
      return;
    }
    
    // Si no tiene opciones obligatorias, añadir directamente
    addItem(product);
    
    // Mostrar el mini-componente inmediatamente después de añadir
    setIsVisible(true);
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
      setIsVisible(false);
      onAddComplete?.();
    }, 3000);
  };

  // Si no está visible, mostrar botón + o contador
  if (!isVisible) {
    if (currentQuantity > 0) {
      return (
        <div 
          className="absolute top-2 right-2 h-8 w-8 rounded-full bg-green-500 text-white shadow-md flex items-center justify-center text-sm font-bold cursor-pointer hover:bg-green-600 transition-colors z-10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            setIsVisible(true);
          }}
        >
          {currentQuantity}
        </div>
      );
    }

    return (
      <button 
        className="absolute top-2 right-2 h-8 w-8 rounded-full bg-white shadow-md flex items-center justify-center hover:bg-green-400 transition-colors z-10"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          handleQuickAdd();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
        }}
      >
        <svg
          className="h-5 w-5 text-black"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>
    );
  }

  // Mostrar mini-componente para añadir/restar
  return (
    <div className="absolute top-2 right-2 bg-white rounded-lg shadow-lg p-2 z-20 min-w-[120px]">
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleRemove();
          }}
          className="w-6 h-6 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
        >
          <Minus className="w-3 h-3 text-gray-600" />
        </button>
        
        <span className="text-sm font-semibold text-gray-900 min-w-[20px] text-center">
          {currentQuantity}
        </span>
        
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAdd();
          }}
          className="w-6 h-6 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors"
        >
          <Plus className="w-3 h-3 text-white" />
        </button>
      </div>
      
      {/* Botón para cerrar */}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsVisible(false);
        }}
        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
      >
        <X className="w-2 h-2 text-gray-600" />
      </button>
    </div>
  );
}
