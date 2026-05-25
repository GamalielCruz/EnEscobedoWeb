"use client";

import { useState } from "react";
import { Product } from "@/sanity.types";
import useBasketStore from "@/store/store";
import { Loader } from "lucide-react";
import StoreConflictAlert from "./StoreConflictAlert";
import ProductCustomization from "./ProductCustomization";

interface AddToBasketWithCustomizationProps {
  product: Product;
  disabled?: boolean;
  onClose?: () => void;
}

interface BasketItem {
  product: Product;
  quantity: number;
  customizations?: { [key: string]: string | string[] };
}

function AddToBasketWithCustomization({ 
  product, 
  disabled, 
  onClose 
}: AddToBasketWithCustomizationProps) {
  const store = useBasketStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showConflictAlert, setShowConflictAlert] = useState(false);
  const [customizations, setCustomizations] = useState<{ [key: string]: string | string[] }>({});

  // Verificar si hay opciones obligatorias no seleccionadas
  const hasRequiredOptions = product.optionGroups?.some(group => group.required === true) || false;
  const hasUnselectedRequired = hasRequiredOptions && product.optionGroups?.some((group, groupIndex) => {
    if (!group.required) return false;
    const groupKey = `group-${groupIndex}`;
    const selection = customizations[groupKey];
    if (group.selectionType === "multiple") {
      return !Array.isArray(selection) || selection.length === 0;
    } else {
      return !selection || selection === '';
    }
  });

  const calculateTotalPrice = () => {
    let basePrice = product.price || 0;
    
    // Sumar costos adicionales de personalizaciones
    if (product.optionGroups) {
      product.optionGroups.forEach((group, groupIndex) => {
        const groupKey = `group-${groupIndex}`;
        const selection = customizations[groupKey];
        
        if (group.selectionType === "multiple" && Array.isArray(selection)) {
          selection.forEach(selectedOption => {
            const option = group.options?.find(opt => opt.label === selectedOption);
            if (option) {
              basePrice += (option.priceDelta || 0);
            }
          });
        } else if (selection) {
          const option = group.options?.find(opt => opt.label === selection);
          if (option) {
            basePrice += (option.priceDelta || 0);
          }
        }
      });
    }
    
    return basePrice;
  };

  const handleAddToBasket = async () => {
    // Verificación básica del store
    if (!store || typeof store.addItem !== 'function') {
      console.warn('Store no disponible');
      return;
    }

    // Verificar si se puede agregar el producto
    if (store.canAddProduct && !store.canAddProduct(product)) {
      setShowConflictAlert(true);
      return;
    }

    // Verificar opciones obligatorias
    if (hasUnselectedRequired) {
      alert('Por favor selecciona las opciones obligatorias marcadas con *');
      return;
    }

    setIsLoading(true);
    try {
      store.addItem({
        product,
        quantity: 1,
        customizations,
        customPrice: calculateTotalPrice(),
      });
      
      // Cerrar el sidebar después de añadir
      setTimeout(() => {
        onClose?.();
      }, 500);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearCartAndAdd = async () => {
    if (store && typeof store.clearBasket === 'function') {
      store.clearBasket();
    }
    setIsLoading(true);
    try {
      const itemToAdd = {
        product: product,
        quantity: 1,
        customizations,
        customPrice: calculateTotalPrice(),
      };
      
      store.addItem(itemToAdd);
      
      // Cerrar el sidebar después de añadir
      setTimeout(() => {
        onClose?.();
      }, 500);
    } finally {
      setIsLoading(false);
    }
  };

  // Obtener nombres de tienda para el modal de conflicto
  const currentStoreName = store?.items && store.items.length > 0 
      ? (store.items[0]?.product?.affiliateStore as { name?: string })?.name || "Tienda actual"
      : "Tienda actual";
  
  const newStoreName = (product?.affiliateStore as { name?: string })?.name || "Nueva tienda";

  const totalPrice = calculateTotalPrice();

  return (
    <>
      <div className="w-full space-y-4">
        {/* Componente de personalización */}
        <ProductCustomization 
          optionGroups={product.optionGroups}
          onSelectionChange={setCustomizations}
        />

        {/* Resumen del precio */}
        {(totalPrice !== (product.price || 0)) && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Precio base:</span>
                <span className="font-medium">${(product.price || 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Personalización:</span>
                <span className="font-medium text-[#70E000]">
                  +${(totalPrice - (product.price || 0)).toFixed(2)}
                </span>
              </div>
              <div className="border-t pt-2 mt-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Total:</span>
                  <span className="text-lg font-bold text-[#70E000]">${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Botón de agregar */}
        <button
          onClick={handleAddToBasket}
          disabled={disabled || isLoading || hasUnselectedRequired}
          className={`
            w-full bg-[#70e000] text-white px-4 py-3 rounded-lg 
            disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
            flex items-center justify-center transition-all duration-200
            font-bold text-lg min-h-[56px] shadow-sm hover:shadow-md
            ${hasUnselectedRequired ? 'bg-orange-500 hover:bg-orange-600' : 'hover:bg-[#70E000]'}
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader className="w-5 h-5 animate-spin" />
              Agregando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {hasUnselectedRequired ? 'Selecciona opciones *' : 'Agregar al Carrito'}
            </span>
          )}
        </button>
      </div>

      <StoreConflictAlert
        isOpen={showConflictAlert}
        onClose={() => setShowConflictAlert(false)}
        currentStoreName={currentStoreName}
        newStoreName={newStoreName}
        onClearCart={handleClearCartAndAdd}
      />
    </>
  );
}

export default AddToBasketWithCustomization;
