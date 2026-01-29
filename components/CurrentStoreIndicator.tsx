"use client";

import { Store, MapPin } from 'lucide-react';
import useBasketStore from '@/store/store';

export default function CurrentStoreIndicator() {
  const { items } = useBasketStore();
  
  // Debug extensivo
  console.log('🔍 CurrentStoreIndicator DEBUG:');
  console.log('- items:', items);
  console.log('- items type:', typeof items);
  console.log('- items isArray:', Array.isArray(items));
  console.log('- items length:', items?.length);
  
  if (items.length === 0) {
    console.log('- Early return: items.length === 0');
    return null;
  }
  
  // Obtener nombre de tienda directamente (sin usar getCurrentStoreName)
  const storeName = items && items.length > 0 
    ? (items[0]?.product?.affiliateStore as { name?: string })?.name 
    : null;
  const storeInfo = items[0]?.product?.affiliateStore;
  
  console.log('- storeName:', storeName);
  console.log('- storeName type:', typeof storeName);
  console.log('- storeInfo:', storeInfo);
  console.log('- storeInfo type:', typeof storeInfo);
  
  // Asegurar que storeName es un string válido
  const displayStoreName = storeName || 'Tienda desconocida';
  console.log('- displayStoreName:', displayStoreName);
  console.log('- displayStoreName type:', typeof displayStoreName);
  
  if (!storeInfo) {
    console.log('- Early return: !storeInfo');
    return null;
  }

  console.log('- About to render CurrentStoreIndicator');

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <Store className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-green-900 text-sm">
            Productos de una sola tienda
          </h3>
          <div className="flex items-center gap-1 text-green-700 text-sm">
            <MapPin className="w-3 h-3" />
            <span className="font-medium">{displayStoreName}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-green-600 font-medium">
            {items.length} producto{items.length > 1 ? 's' : ''}
          </div>
          <div className="text-xs text-green-500">
            Mismo restaurante
          </div>
        </div>
      </div>
      
      <div className="mt-3 p-3 bg-white rounded-md border border-green-100">
        <p className="text-xs text-green-700">
          <strong>💡 Tip:</strong> Solo puedes tener productos de una tienda a la vez. 
          Esto simplifica tu pedido y evita confusiones en la entrega.
        </p>
      </div>
    </div>
  );
}