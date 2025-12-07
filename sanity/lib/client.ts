import { createClient } from "next-sanity";

import { apiVersion, dataset, projectId } from "../env";
import { buildUrl } from "@/lib/urls";

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: process.env.NODE_ENV === 'production',
  perspective: 'published', // Siempre usar published para estabilidad
  stega: {
    enabled: process.env.NODE_ENV !== 'production',
    studioUrl: process.env.NODE_ENV !== 'production' ? buildUrl('/studio') : undefined,
  },
  // Configuración adicional para móviles
  requestTagPrefix: process.env.NODE_ENV === 'production' ? 'prod' : 'dev',
  ignoreBrowserTokenWarning: process.env.NODE_ENV === 'production',
});

// Cliente para escritura con token de API
export const writeClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
  perspective: 'published',
});

// Cliente optimizado para lectura en producción
export const readClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  token: process.env.SANITY_API_READ_TOKEN,
  perspective: 'published',
});
