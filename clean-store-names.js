const { createClient } = require('@sanity/client');

const client = createClient({
  projectId: 't93gr28n',
  dataset: 'production',
  useCdn: false,
  apiVersion: '2024-07-25'
});

async function cleanStoreNames() {
  try {
    console.log('🔍 Obteniendo todas las tiendas...');
    const stores = await client.fetch('*[_type == "affiliateStore"]{_id, name, ownerClerkUserId}');
    
    console.log(`📊 Encontradas ${stores.length} tiendas`);
    
    for (const store of stores) {
      const originalName = store.name;
      
      // Limpiar caracteres invisibles y corruptos
      const cleanName = originalName
        .replace(/[\u200B-\u200D\uFEFF\u2060\uFE00-\uFE0F\uE000-\uF8FF\uFFF0-\uFFFF]/g, '') // Caracteres invisibles
        .replace(/\uFEFF/g, '') // BOM específico
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Caracteres de control
        .replace(/\s+/g, ' ') // Múltiples espacios a uno solo
        .trim();
      
      console.log(`🏪 Tienda: "${originalName}" -> "${cleanName}"`);
      
      if (originalName !== cleanName) {
        console.log(`✏️ Actualizando tienda ${store._id}...`);
        
        const result = await client
          .patch(store._id)
          .set({ name: cleanName })
          .commit();
          
        console.log(`✅ Actualizado: ${result._id}`);
      } else {
        console.log(`✅ Tienda ${store._id} ya está limpia`);
      }
    }
    
    console.log('🎉 Proceso completado');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

cleanStoreNames();
