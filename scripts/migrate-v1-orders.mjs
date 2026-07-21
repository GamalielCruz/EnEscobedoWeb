import { createClient } from "@sanity/client";

const commit = process.argv.includes("--commit");
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN;
if (!projectId || !dataset || (commit && !token)) throw new Error("Faltan credenciales de Sanity.");

const client = createClient({ projectId, dataset, token, apiVersion: "2024-07-25", useCdn: false });
const orders = await client.fetch(`*[_type == "order" && !defined(deliveryVerificationMethod)]{_id}`);
console.log(`${orders.length} órdenes antiguas requieren compatibilidad.${commit ? " Aplicando." : " Usa --commit para aplicar."}`);
if (commit) {
  for (const order of orders) {
    await client.patch(order._id).set({ deliveryVerificationMethod: "not_required", deliveryVerificationStatus: "not_required" }).commit();
  }
}
