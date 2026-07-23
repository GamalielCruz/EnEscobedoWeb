#!/usr/bin/env node

/**
 * Simple migration script to convert storeCategory icon field
 * Run with: node sanity/migrations/migrateIcons.js
 */

const { createClient } = require('@sanity/client')

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
  apiVersion: '2024-01-01',
})

async function migrateIcons() {
  const query = `*[_type == "storeCategory" && icon != null]`

  try {
    console.log('🔄 Iniciando migración de iconos...')
    const categories = await client.fetch(query)
    
    console.log(`📊 Encontradas ${categories.length} categorías con iconos`)
    
    if (categories.length === 0) {
      console.log('✓ No hay categorías para migrar')
      return
    }

    let migrated = 0
    let skipped = 0

    for (const category of categories) {
      const currentIcon = category.icon
      
      // Skip if already in object format
      if (typeof currentIcon === 'object' && currentIcon !== null) {
        console.log(`⏭️  ${category.title} - ya está en formato object`)
        skipped++
        continue
      }

      // Convert string to object format
      if (typeof currentIcon === 'string' && currentIcon.trim()) {
        const newIcon = {
          type: 'emoji',
          emoji: currentIcon,
        }
        
        console.log(`🔄 Convirtiendo: ${category.title} - "${currentIcon}" → emoji object`)
        
        try {
          await client
            .patch(category._id)
            .set({ icon: newIcon })
            .commit()
          
          console.log(`✓ Actualizado: ${category.title}`)
          migrated++
        } catch (error) {
          console.error(`✗ Error al actualizar ${category.title}:`, error.message)
        }
      } else if (!currentIcon || !currentIcon.trim()) {
        // If empty string, set to null
        try {
          await client
            .patch(category._id)
            .set({ icon: null })
            .commit()
          
          console.log(`✓ Limpiado icono vacío: ${category.title}`)
          migrated++
        } catch (error) {
          console.error(`✗ Error al limpiar ${category.title}:`, error.message)
        }
      }
    }

    console.log('\n✅ Migración completada!')
    console.log(`   - Actualizadas: ${migrated}`)
    console.log(`   - Omitidas: ${skipped}`)
  } catch (error) {
    console.error('❌ Error en la migración:', error.message)
    process.exit(1)
  }
}

// Run migration
migrateIcons().then(() => {
  console.log('Fin del script')
  process.exit(0)
})
