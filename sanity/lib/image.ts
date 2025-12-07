import createImageUrlBuilder from '@sanity/image-url'
import { SanityImageSource } from "@sanity/image-url/lib/types/types";

import { dataset, projectId } from '../env'

// https://www.sanity.io/docs/image-url
const builder = createImageUrlBuilder({ 
  projectId, 
  dataset
})

export const urlFor = (source: SanityImageSource) => {
  if (!source) return builder.image('')
  
  return builder.image(source)
    .auto('format') // Formato automático (webp, avif, etc.)
    .fit('max') // Mejor para responsive
}

// Function to get direct Sanity URL without Next.js optimization
export const getDirectImageUrl = (source: SanityImageSource) => {
  if (!source) return ''
  
  return builder.image(source)
    .auto('format')
    .quality(85)
    .url()
}

// Function to get optimized Sanity URL for sharing (with proper dimensions)
export const getShareableImageUrl = (source: SanityImageSource) => {
  if (!source) return ''
  
  return builder.image(source)
    .width(400)
    .height(400)
    .fit('crop')
    .auto('format')
    .quality(85)
    .url()
}

// Nueva función específica para móviles
export const getMobileOptimizedImageUrl = (source: SanityImageSource, width = 400) => {
  if (!source) return ''
  
  return builder.image(source)
    .width(width)
    .auto('format')
    .quality(80) // Calidad ligeramente menor para móviles
    .fit('max')
    .url()
}
