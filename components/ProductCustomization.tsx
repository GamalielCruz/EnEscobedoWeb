"use client";

import { useState } from "react";
import { Check } from "lucide-react";

interface Option {
  label?: string;
  description?: string;
  priceDelta?: number;
  isDefault?: boolean;
}

interface OptionGroup {
  title?: string;
  description?: string;
  required?: boolean;
  selectionType?: "single" | "multiple";
  options?: Option[];
}

interface ProductCustomizationProps {
  optionGroups?: OptionGroup[] | null;
  onSelectionChange?: (selections: { [key: string]: string | string[] }) => void;
}

export default function ProductCustomization({ 
  optionGroups: rawOptionGroups,
  onSelectionChange 
}: ProductCustomizationProps) {
  const optionGroups = Array.isArray(rawOptionGroups) ? rawOptionGroups.filter(Boolean) : [];
  const [selections, setSelections] = useState<{ [key: string]: string | string[] }>({});

  const handleSingleSelection = (groupIndex: number, optionIndex: number) => {
    const group = optionGroups[groupIndex];
    if (!group) return;

    const newSelections = { ...selections };
    const groupKey = `group-${groupIndex}`;
    
    // Para selección simple, guardar solo el valor seleccionado
    newSelections[groupKey] = group.options?.[optionIndex]?.label || '';
    
    setSelections(newSelections);
    onSelectionChange?.(newSelections);
  };

  const handleMultipleSelection = (groupIndex: number, optionIndex: number) => {
    const group = optionGroups[groupIndex];
    if (!group) return;

    const newSelections = { ...selections };
    const groupKey = `group-${groupIndex}`;
    const optionLabel = group.options?.[optionIndex]?.label || '';
    
    // Para selección múltiple, manejar array de valores
    const currentSelections = (newSelections[groupKey] as string[]) || [];
    
    if (currentSelections.includes(optionLabel)) {
      // Remover si ya está seleccionado
      newSelections[groupKey] = currentSelections.filter(s => s !== optionLabel);
    } else {
      // Añadir si no está seleccionado
      newSelections[groupKey] = [...currentSelections, optionLabel];
    }
    
    setSelections(newSelections);
    onSelectionChange?.(newSelections);
  };

  const isOptionSelected = (groupIndex: number, optionIndex: number) => {
    const group = optionGroups[groupIndex];
    if (!group) return false;

    const groupKey = `group-${groupIndex}`;
    const optionLabel = group.options?.[optionIndex]?.label || '';
    const currentSelection = selections[groupKey];

    if (group.selectionType === "multiple") {
      return Array.isArray(currentSelection) && currentSelection.includes(optionLabel);
    } else {
      return currentSelection === optionLabel;
    }
  };

  const getGroupPrice = (groupIndex: number) => {
    const group = optionGroups[groupIndex];
    if (!group) return 0;

    const groupKey = `group-${groupIndex}`;
    const currentSelection = selections[groupKey];

    if (group.selectionType === "multiple" && Array.isArray(currentSelection)) {
      return currentSelection.reduce((total, selection) => {
        const option = group.options?.find(opt => opt.label === selection);
        return total + (option?.priceDelta || 0);
      }, 0);
    } else {
      const option = group.options?.find(opt => opt.label === currentSelection);
      return option?.priceDelta || 0;
    }
  };

  const getTotalAdditionalPrice = () => {
    return optionGroups.reduce((total, group, groupIndex) => {
      return total + getGroupPrice(groupIndex);
    }, 0);
  };

  if (optionGroups.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-base font-semibold text-gray-900 mb-3">Opciones de personalización</h3>
        
        {optionGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-6 last:mb-0">
            <div className="mb-2">
              <h4 className="text-sm font-medium text-gray-900">
                {group.title}
                {group.required && <span className="text-red-500 ml-1">*</span>}
              </h4>
              {group.description && (
                <p className="text-xs text-gray-500 mt-1">{group.description}</p>
              )}
            </div>

            <div className="divide-y divide-gray-200">
              {group.options?.map((option, optionIndex) => {
                const isSelected = isOptionSelected(groupIndex, optionIndex);
                const additionalPrice = option.priceDelta || 0;
                
                return (
                  <button
                    type="button"
                    key={optionIndex}
                    onClick={() => {
                      if (group.selectionType === "multiple") {
                        handleMultipleSelection(groupIndex, optionIndex);
                      } else {
                        handleSingleSelection(groupIndex, optionIndex);
                      }
                    }}
                    className={`
                      relative w-full py-4 text-left transition-colors hover:bg-gray-50
                    `}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`
                          flex h-5 w-5 items-center justify-center border-2
                          ${group.selectionType === "multiple" ? "rounded" : "rounded-full"} ${isSelected ? 'border-black bg-black' : 'border-gray-400'}
                        `}>
                          {isSelected && (
                            <Check className="w-3 h-3 text-white" />
                          )}
                        </div>
                        
                        <span className="text-sm font-medium text-gray-900">
                          {option.label}
                        </span>
                      </div>
                      
                      {additionalPrice > 0 && (
                        <span className="text-sm font-semibold text-gray-700">
                          +${additionalPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                    
                    {option.description && (
                      <p className="text-xs text-gray-500 mt-2 ml-7">
                        {option.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Resumen de precio adicional */}
      {getTotalAdditionalPrice() > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">
              Costo adicional por personalizaciones:
            </span>
            <span className="text-base font-bold text-blue-600">
              +${getTotalAdditionalPrice().toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
