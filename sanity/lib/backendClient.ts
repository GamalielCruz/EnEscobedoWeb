import { createClient } from "next-sanity"
import { apiVersion, dataset, projectId } from "../env";

export const backendClient = createClient({
    projectId,
    dataset,
    apiVersion,
    useCdn: false, // Importante: desactivar CDN para operaciones de escritura
    token: process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN, // Preferir token de escritura
});