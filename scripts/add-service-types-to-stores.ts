import { client } from '../sanity/lib/client';

// Configuración por defecto para tiendas existentes
const defaultServiceTypes = {
  delivery: true,
  pickup: true,
  deliveryRadius: 10,
  minimumOrderDelivery: 100
};

// Configuraciones específicas para algunas tiendas (opcional)
const specificConfigs: Record<string, any> = {
  // Ejemplo: algunas tiendas solo pickup
  'PE-BARRIO-003': {
    delivery: false,
    pickup: true,
    deliveryRadius: 0,
    minimumOrderDelivery: 0
  },
  // Ejemplo: tienda con delivery premium
  'PE-CENTRO-001': {
    delivery: true,
    pickup: true,
    deliveryRadius: 20,
    minimumOrderDelivery: 200
  }
};

async function addServiceTypesToExistingStores() {
  try {
    console.log('🔍 Obteniendo tiendas existentes...');
    
    // Obtener todas las tiendas que no tienen serviceTypes configurado
    const stores = await client.fetch(`
      *[_type == "affiliateStore" && !defined(serviceTypes)] {
        _id,
        name,
        storeId
      }
    `);

    console.log(`📦 Encontradas ${stores.length} tiendas sin serviceTypes configurado`);

    if (stores.length === 0) {
      console.log('✅ Todas las tiendas ya tienen serviceTypes configurado');
      return;
    }

    // Actualizar cada tienda
    for (const store of stores) {
      const serviceTypes = specificConfigs[store.storeId] || defaultServiceTypes;
      
      console.log(`🔄 Actualizando ${store.name} (${store.storeId})...`);
      
      await client
        .patch(store._id)
        .set({ serviceTypes })
        .commit();
      
      console.log(`✅ ${store.name} actualizada con:`, serviceTypes);
    }

    console.log('🎉 Todas las tiendas han sido actualizadas con serviceTypes');

  } catch (error) {
    console.error('❌ Error actualizando tiendas:', error);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  addServiceTypesToExistingStores()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { addServiceTypesToExistingStores };