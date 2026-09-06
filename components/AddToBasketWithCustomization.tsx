"use client";

import { useState } from "react";
import { Product } from "@/sanity.types";
import useBasketStore from "@/store/store";
import {
  ArrowLeft,
  Bean,
  ChevronRight,
  CirclePlus,
  Egg,
  Fish,
  FlaskConical,
  Flower2,
  Leaf,
  Loader,
  Milk,
  Nut,
  Shell,
  ShieldAlert,
  Shrimp,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { COMMON_ALLERGIES } from "@/lib/product-requests";
import StoreConflictAlert from "./StoreConflictAlert";
import ProductCustomization from "./ProductCustomization";

interface AddToBasketWithCustomizationProps {
  product: Product;
  disabled?: boolean;
  onClose?: () => void;
}

const ALLERGY_ICONS: Record<string, LucideIcon> = {
  "Polen de abeja": Flower2,
  Apio: Leaf,
  "Cereales con gluten": Wheat,
  Crustáceos: Shrimp,
  Huevos: Egg,
  Pescado: Fish,
  Leche: Milk,
  Moluscos: Shell,
  Mostaza: Leaf,
  Cacahuates: Nut,
  "Jalea real": Flower2,
  Sésamo: Bean,
  Soya: Bean,
  "Dióxidos/sulfitos de azufre": FlaskConical,
  Nueces: Nut,
};

function AddToBasketWithCustomization({ 
  product, 
  disabled, 
  onClose 
}: AddToBasketWithCustomizationProps) {
  const store = useBasketStore();
  const [isLoading, setIsLoading] = useState(false);
  const [showConflictAlert, setShowConflictAlert] = useState(false);
  const [customizations, setCustomizations] = useState<{ [key: string]: string | string[] }>({});
  const [notes, setNotes] = useState("");
  const [allergies, setAllergies] = useState<string[]>([]);
  const [customAllergy, setCustomAllergy] = useState("");
  const [showAllergies, setShowAllergies] = useState(false);
  const settings = product as Product & { allowSpecialInstructions?: boolean; acceptsAllergyRequests?: boolean };
  const allowSpecialInstructions = settings.allowSpecialInstructions !== false;
  const acceptsAllergyRequests = settings.acceptsAllergyRequests === true;
  const selectedAllergies = [...allergies, customAllergy.trim()].filter(Boolean);

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
        notes: allowSpecialInstructions ? notes.trim() : undefined,
        allergies: acceptsAllergyRequests ? selectedAllergies : [],
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
        notes: allowSpecialInstructions ? notes.trim() : undefined,
        allergies: acceptsAllergyRequests ? selectedAllergies : [],
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

        {allowSpecialInstructions ? (
          <section className="border-t border-gray-200 pt-4">
            <h3 className="text-lg font-bold text-gray-950">Instrucciones especiales</h3>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={300}
              rows={3}
              className="mt-3 w-full resize-none rounded-2xl border border-gray-100 bg-[#f6f6f7] p-4 text-base outline-none transition focus:border-[#70E000] focus:ring-2 focus:ring-[#70E000]/25"
              placeholder="Agregar una nota"
            />
            <p className="mt-2 text-sm text-gray-500">Es posible que se cobren los artículos adicionales.</p>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => acceptsAllergyRequests && setShowAllergies(true)}
          disabled={!acceptsAllergyRequests}
          className="flex w-full items-center gap-3 border-y border-gray-200 py-4 text-left transition-colors enabled:hover:bg-[#70E000]/5 disabled:text-gray-400"
        >
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${acceptsAllergyRequests ? "bg-[#70E000]/15 text-[#4d9f00]" : "bg-gray-100 text-gray-400"}`}>
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Solicitudes por alergia</span>
            <span className="block text-sm text-gray-500">
              {acceptsAllergyRequests
                ? selectedAllergies.length
                  ? selectedAllergies.join(", ")
                  : "Ninguna opción seleccionada"
                : "El restaurante no satisface solicitudes por alergia"}
            </span>
          </span>
          {acceptsAllergyRequests ? <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" /> : null}
        </button>

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
            sticky bottom-0 z-10 w-full bg-[#70E000] text-[#143800] px-4 py-3 rounded-xl
            disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed
            flex items-center justify-center transition-all duration-200
            font-bold text-lg min-h-[56px] shadow-sm hover:shadow-md
            ${hasUnselectedRequired ? 'bg-orange-500 hover:bg-orange-600' : 'hover:bg-[#62c900]'}
          `}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <Loader className="w-5 h-5 animate-spin" />
              Agregando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              {hasUnselectedRequired ? 'Selecciona opciones *' : `Agregar 1 al carrito · $${totalPrice.toFixed(2)}`}
            </span>
          )}
        </button>
      </div>


      {showAllergies ? (
        <div className="fixed inset-0 z-[10001] overflow-y-auto bg-white" role="dialog" aria-modal="true" aria-label="Solicitudes por alergia" onKeyDown={(event) => event.key === "Escape" && setShowAllergies(false)}>
          <div className="sticky top-0 flex h-16 items-center border-b border-gray-200 bg-white px-4">
            <button autoFocus type="button" onClick={() => setShowAllergies(false)} className="rounded-full p-2 text-[#20096F] transition hover:bg-gray-100" aria-label="Volver">
              <ArrowLeft className="h-6 w-6" />
            </button>
            <h2 className="ml-3 text-xl font-bold text-[#20096F]">Alergias</h2>
          </div>
          <div className="mx-auto max-w-lg px-5 pb-28 pt-6">
            <h3 className="mb-3 text-lg font-bold">Selecciona alergias</h3>
            <div className="divide-y divide-gray-200">
              {COMMON_ALLERGIES.map((allergy) => {
                const AllergyIcon = ALLERGY_ICONS[allergy] ?? ShieldAlert;
                const selected = allergies.includes(allergy);

                return (
                  <label key={allergy} className="flex min-h-16 cursor-pointer items-center gap-3 py-3">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selected ? "bg-[#70E000]/20 text-[#4d9f00]" : "bg-gray-100 text-gray-500"}`}>
                      <AllergyIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="flex-1 text-base font-medium">{allergy}</span>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) =>
                        setAllergies((current) =>
                          event.target.checked ? [...current, allergy] : current.filter((item) => item !== allergy)
                        )
                      }
                      className="h-5 w-5 rounded border-gray-400 accent-[#70E000]"
                    />
                  </label>
                );
              })}
            </div>
            <label className="mt-6 block text-lg font-bold">
              <span className="flex items-center gap-2">
                <CirclePlus className="h-5 w-5 text-[#4d9f00]" aria-hidden="true" />
                Otra alergia
              </span>
              <input
                value={customAllergy}
                onChange={(event) => setCustomAllergy(event.target.value)}
                maxLength={60}
                className="mt-3 h-12 w-full rounded-xl border border-gray-300 px-4 text-base outline-none transition focus:border-[#70E000] focus:ring-2 focus:ring-[#70E000]/25"
                placeholder="Agrega una alergia alimentaria"
              />
            </label>
          </div>
          <div className="fixed inset-x-0 bottom-0 border-t border-gray-200 bg-white p-4">
            <button type="button" onClick={() => setShowAllergies(false)} className="mx-auto block min-h-14 w-full max-w-lg rounded-xl bg-[#70E000] px-4 font-bold text-[#143800] transition hover:bg-[#62c900]">
              Guardar
            </button>
          </div>
        </div>
      ) : null}
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
