import { createClient } from "next-sanity";
import { apiVersion, dataset, projectId } from "../env";

// Cliente optimizado para producción
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true, // Usar CDN en producción para mejor rendimiento
  perspective: 'published', // Solo contenido publicado
  stega: {
    enabled: false, // Deshabilitar en producción
  },
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

// Cliente para operaciones de solo lectura (más rápido)
export const readClient = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
  token: process.env.SANITY_API_READ_TOKEN,
  perspective: 'published',
});