'use client'

/**
 * This configuration is used to for the Sanity Studio that’s mounted on the `\app\studio\[[...tool]]\page.tsx` route
 */

import {visionTool} from '@sanity/vision'
import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import { presentationTool } from 'sanity/presentation'

// Go to https://www.sanity.io/docs/api-versioning to learn how API versioning works
import {apiVersion, dataset, projectId} from './sanity/env'
import {schema} from './sanity/schemaTypes'
import {structure} from './sanity/structure'

// DEBUG schema: Descomentar para ver qué schema carga el Studio (ver consola del navegador)
// const _aff = schema?.types?.find((t: { name?: string }) => t?.name === 'affiliateStore')
// const _hasOwner = _aff?.fields?.some((f: { name?: string }) => f?.name === 'ownerClerkUserId')
// if (typeof window !== 'undefined') {
//   console.log('[Sanity] ownerClerkUserId en schema:', _hasOwner, '| Campos:', _aff?.fields?.map((f: { name?: string }) => f?.name))
// }

export default defineConfig({
  basePath: '/studio',
  projectId,
  dataset,
  // Add and edit the content schema in the './sanity/schemaTypes' folder
  schema,
  plugins: [
    structureTool({structure}),
    // Vision is for querying with GROQ from inside the Studio
    // https://www.sanity.io/docs/the-vision-plugin
    visionTool({defaultApiVersion: apiVersion}),
    // Solo habilitar presentation tool en desarrollo
    ...(process.env.NODE_ENV !== 'production' ? [
      presentationTool({
        previewUrl: {
          preview: "/",
          previewMode: {
            enable: "/draft-mode/enable",
          },
        },
      })
    ] : []),
  ],
})
