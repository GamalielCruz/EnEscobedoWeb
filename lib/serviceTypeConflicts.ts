// Utilidades para manejar conflictos de tipos de servicio entre tiendas

export interface ProductWithStore {
  _id: string;
  name?: string;
  price?: number;
  affiliateStore?: {
    _id: string;
    name?: string;
  };
}

export interface GroupedBasketItem {
  product: ProductWithStore;
  quantity: number;
}

export interface StoreServiceConfig {
  storeId: string;
  storeName: string;
  serviceTypes: {
    delivery: boolean;
    pickup: boolean;
    deliveryRadius?: number;
    minimumOrderDelivery?: number;
  };
}

export interface ServiceTypeGroup {
  serviceType: 'delivery' | 'pickup' | 'both';
  stores: string[];
  items: GroupedBasketItem[];
  totalPrice: number;
  canDelivery: boolean;
  canPickup: boolean;
  storeName?: string;
  storeId?: string;
}

/**
 * Obtiene la configuración de tipos de servicio para múltiples tiendas
 */
export async function getStoresServiceConfig(storeIds: string[]): Promise<Record<string, StoreServiceConfig>> {
  const configs: Record<string, StoreServiceConfig> = {};
  
  for (const storeId of storeIds) {
    try {
      const response = await fetch(`/api/store-service-types?storeId=${storeId}`);
      if (response.ok) {
        const data = await response.json();
        configs[storeId] = {
          storeId,
          storeName: data.storeName || 'Tienda',
          serviceTypes: data.serviceTypes || {
            delivery: true,
            pickup: true,
            deliveryRadius: 10,
            minimumOrderDelivery: 100
          }
        };
      }
    } catch (error) {
      console.error(`Error obteniendo config para tienda ${storeId}:`, error);
      // Fallback por defecto
      configs[storeId] = {
        storeId,
        storeName: 'Tienda',
        serviceTypes: {
          delivery: true,
          pickup: true,
          deliveryRadius: 10,
          minimumOrderDelivery: 100
        }
      };
    }
  }
  
  return configs;
}

/**
 * Analiza los items del carrito y detecta si necesitan separación por restaurante
 */
export function analyzeServiceTypeConflicts(
  items: GroupedBasketItem[],
  storeConfigs: Record<string, StoreServiceConfig>
): {
  hasConflicts: boolean;
  needsSeparation: boolean;
  availableServices: ('delivery' | 'pickup')[];
  conflictingStores: string[];
  groups: ServiceTypeGroup[];
} {
  // Agrupar items por tienda
  const itemsByStore: Record<string, GroupedBasketItem[]> = {};
  
  items.forEach(item => {
    const storeId = item.product.affiliateStore?._id;
    if (storeId) {
      if (!itemsByStore[storeId]) {
        itemsByStore[storeId] = [];
      }
      itemsByStore[storeId].push(item);
    }
  });

  const storeIds = Object.keys(itemsByStore);
  
  // Si hay múltiples tiendas, SIEMPRE separar por restaurante
  const needsSeparation = storeIds.length > 1;

  // Analizar servicios disponibles por tienda
  const storeServices: Record<string, { delivery: boolean; pickup: boolean }> = {};
  
  storeIds.forEach(storeId => {
    const config = storeConfigs[storeId];
    if (config) {
      storeServices[storeId] = {
        delivery: config.serviceTypes.delivery,
        pickup: config.serviceTypes.pickup
      };
    } else {
      // Fallback por defecto
      storeServices[storeId] = { delivery: true, pickup: true };
    }
  });

  // Determinar servicios disponibles globalmente (solo relevante si no hay separación)
  const globalDelivery = storeIds.every(id => storeServices[id].delivery);
  const globalPickup = storeIds.every(id => storeServices[id].pickup);
  
  const availableServices: ('delivery' | 'pickup')[] = [];
  if (globalDelivery) availableServices.push('delivery');
  if (globalPickup) availableServices.push('pickup');

  // Detectar conflictos reales (servicios incompatibles)
  const hasConflicts = availableServices.length === 0 && storeIds.length > 1;
  
  // Identificar tiendas conflictivas
  const conflictingStores: string[] = [];
  if (hasConflicts) {
    storeIds.forEach(storeId => {
      const services = storeServices[storeId];
      if (!services.delivery || !services.pickup) {
        conflictingStores.push(storeId);
      }
    });
  }

  // Crear grupos - SIEMPRE por tienda si hay múltiples restaurantes
  const groups: ServiceTypeGroup[] = [];
  
  if (needsSeparation) {
    // Crear un grupo por cada tienda
    Object.entries(itemsByStore).forEach(([storeId, storeItems]) => {
      const services = storeServices[storeId];
      const config = storeConfigs[storeId];
      
      // Determinar qué servicios puede ofrecer esta tienda específica
      let serviceType: 'delivery' | 'pickup' | 'both' = 'both';
      if (services.delivery && !services.pickup) {
        serviceType = 'delivery';
      } else if (!services.delivery && services.pickup) {
        serviceType = 'pickup';
      }
      
      groups.push({
        serviceType,
        stores: [storeId],
        items: storeItems,
        totalPrice: storeItems.reduce((sum, item) => sum + (item.product.price || 0) * item.quantity, 0),
        canDelivery: services.delivery,
        canPickup: services.pickup,
        storeName: config?.storeName || 'Tienda',
        storeId: storeId
      });
    });
  } else {
    // Una sola tienda, un solo grupo
    groups.push({
      serviceType: 'both',
      stores: storeIds,
      items,
      totalPrice: items.reduce((sum, item) => sum + (item.product.price || 0) * item.quantity, 0),
      canDelivery: globalDelivery,
      canPickup: globalPickup,
      storeName: storeConfigs[storeIds[0]]?.storeName || 'Tienda',
      storeId: storeIds[0]
    });
  }

  return {
    hasConflicts,
    needsSeparation,
    availableServices,
    conflictingStores,
    groups
  };
}

/**
 * Genera un resumen legible de la situación del carrito
 */
export function generateConflictSummary(
  analysis: ReturnType<typeof analyzeServiceTypeConflicts>,
  storeConfigs: Record<string, StoreServiceConfig>
): string {
  if (!analysis.needsSeparation) {
    return 'Todos los productos son de la misma tienda.';
  }

  if (analysis.hasConflicts) {
    const conflictDetails = analysis.conflictingStores.map(storeId => {
      const config = storeConfigs[storeId];
      const services = [];
      if (config?.serviceTypes.delivery) services.push('entrega');
      if (config?.serviceTypes.pickup) services.push('recogida');
      
      return `${config?.storeName || 'Tienda'}: solo ${services.join(' y ')}`;
    });

    return `Servicios incompatibles detectados: ${conflictDetails.join(', ')}`;
  }

  const storeNames = analysis.groups.map(group => group.storeName || 'Tienda').join(', ');
  return `Productos de múltiples restaurantes: ${storeNames}. Se recomienda separar por restaurante para mejor logística.`;
}