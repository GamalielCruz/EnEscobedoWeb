/**
 * Script para migrar documentos de productos existentes
 * Agrega los campos de aprobación a los productos que no los tienen
 */

import { createClient } from "next-sanity";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  apiVersion: "2024-01-01",
  useCdn: false,
  token: process.env.SANITY_API_TOKEN, // Requiere token de escritura
});

async function migrateProducts() {
  try {
    console.log("🔄 Iniciando migración de productos...");

    // Obtener todos los productos
    const products = await client.fetch(`*[_type == "product"]`);
    console.log(`📦 Encontrados ${products.length} productos`);

    // Actualizar cada uno
    for (const product of products) {
      const updates = {};

      // Solo agregar campos si no existen
      if (!product.approvalStatus) {
        updates.approvalStatus = "approved"; // Productos existentes se consideran aprobados
      }
      if (product.isVisible === undefined) {
        updates.isVisible = true;
      }
      if (!product.pendingChanges) {
        updates.pendingChanges = null;
      }
      if (!product.submittedBy) {
        updates.submittedBy = null;
      }
      if (!product.submittedAt) {
        updates.submittedAt = null;
      }
      if (!product.approvedBy) {
        updates.approvedBy = null;
      }
      if (!product.approvedAt) {
        updates.approvedAt = null;
      }
      if (!product.rejectedBy) {
        updates.rejectedBy = null;
      }
      if (!product.rejectedAt) {
        updates.rejectedAt = null;
      }
      if (!product.rejectionReason) {
        updates.rejectionReason = null;
      }

      // Solo actualizar si hay cambios
      if (Object.keys(updates).length > 0) {
        console.log(`⚙️  Actualizando ${product.name}...`);
        await client
          .patch(product._id)
          .set(updates)
          .commit();
      }
    }

    console.log("✅ Migración completada!");
  } catch (error) {
    console.error("❌ Error durante migración:", error);
    process.exit(1);
  }
}

migrateProducts();
