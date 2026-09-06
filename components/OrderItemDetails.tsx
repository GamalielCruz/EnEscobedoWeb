import React from 'react';
import { OrderItem } from '@/hooks/useOrderNotifications';

interface OrderItemDetailsProps {
  item: OrderItem;
}

export function OrderItemDetails({ item }: OrderItemDetailsProps) {
  console.log('[OrderItemDetails] Complete item data:', JSON.stringify(item, null, 2));
  console.log('[OrderItemDetails] Customizations:', item.customizations);
  console.log('[OrderItemDetails] All item keys:', Object.keys(item));
  
  const renderCustomizations = () => {
    console.log('[OrderItemDetails] Rendering customizations:', JSON.stringify(item.customizations, null, 2));
    if (!item.customizations || item.customizations.length === 0) return null;

    return (
      <div className="mt-2 p-3 bg-blue-50 rounded text-xs">
        <p className="font-semibold text-blue-700 mb-2">Opciones de personalización:</p>
        {item.customizations.map((customGroup, index) => {
          // Handle option group structure
          if (customGroup.title && customGroup.options) {
            return (
              <div key={index} className="mb-2">
                <p className="font-medium text-blue-800">{customGroup.title}:</p>
                {customGroup.options.map((option, optIndex) => (
                  <div key={optIndex} className="text-blue-600 ml-2">
                    • {option.label || 'Sin nombre'}
                    {option.priceDelta && option.priceDelta !== 0 && (
                      <span className="text-blue-500">
                        {option.priceDelta > 0 ? ' +' : ' '}
                        ${option.priceDelta.toFixed(2)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            );
          } else {
            // Fallback for simple structure
            return (
              <div key={index} className="text-blue-600 mb-1">
                • {JSON.stringify(customGroup)}
              </div>
            );
          }
        })}
      </div>
    );
  };

  const renderNotes = () => {
    if (!item.notes) return null;

    return (
      <div className="mt-2 p-3 bg-yellow-50 rounded text-xs">
        <p className="font-semibold text-yellow-700 mb-1">Notas del producto:</p>
        <p className="text-yellow-600 italic">"{item.notes}"</p>
      </div>
    );
  };

  return (
    <li className="text-sm text-gray-800 border-b border-gray-100 pb-3 last:border-b-0">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="font-medium">
            {item.quantity}x {item.productName}
          </div>
          
          {/* Renderizar personalizaciones y notas */}
          {renderCustomizations()}
          {renderNotes()}
          {item.allergies?.length ? (
            <div className="mt-2 rounded bg-red-50 p-3 text-xs">
              <p className="mb-1 font-semibold text-red-700">Solicitudes por alergia:</p>
              <p className="text-red-700">{item.allergies.join(", ")}</p>
            </div>
          ) : null}

        </div>
        
        <span className="text-gray-500 font-medium ml-3">
          ${item.price.toFixed(2)}
        </span>
      </div>
    </li>
  );
}
