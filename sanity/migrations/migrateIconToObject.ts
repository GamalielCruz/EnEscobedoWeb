import { writeClient } from '../lib/client'

/**
 * Migration script to convert storeCategory icon field from string to object
 * Handles existing emoji/icon values and converts them to the new object format
 */

async function migrateIcons() {
  const query = `*[_type == "storeCategory" && icon != null]`

  try {
    const categories = await writeClient.fetch(query)
    
    console.log(`Found ${categories.length} categories with icon values`)
    
    if (categories.length === 0) {
      console.log('No categories to migrate')
      return
    }

    for (const category of categories) {
      const currentIcon = category.icon
      
      // Skip if already in object format
      if (typeof currentIcon === 'object') {
        console.log(`✓ ${category.title} already has object format`)
        continue
      }

      // Convert string to object format
      let newIcon = null
      
      if (typeof currentIcon === 'string' && currentIcon.trim()) {
        // Assume all existing string values are emojis
        newIcon = {
          type: 'emoji',
          emoji: currentIcon,
        }
        
        console.log(`Converting: ${category.title} - "${currentIcon}" → emoji object`)
      }

      // Update the document
      if (newIcon) {
        await writeClient
          .patch(category._id)
          .set({ icon: newIcon })
          .commit()
        
        console.log(`✓ Updated: ${category.title}`)
      } else {
        // If empty string, set to null
        await writeClient
          .patch(category._id)
          .set({ icon: null })
          .commit()
        
        console.log(`✓ Cleared empty icon: ${category.title}`)
      }
    }

    console.log('\n✓ Migration completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    process.exit(1)
  }
}

// Run migration
migrateIcons()
