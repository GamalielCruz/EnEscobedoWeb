import { createClient } from "@sanity/client";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const EXECUTE = process.argv.includes("--execute");

const client = createClient({
  projectId: "t93gr28n",
  dataset: "production",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN,
});

if (!process.env.SANITY_API_WRITE_TOKEN && !process.env.SANITY_API_TOKEN) {
  throw new Error("Falta SANITY_API_WRITE_TOKEN o SANITY_API_TOKEN en el entorno.");
}

const orders = await client.fetch(
  `*[_type == "order"] | order(orderDate desc){
    _id,
    _rev,
    orderNumber,
    status,
    orderDate
  }`
);

console.log(`Modo: ${EXECUTE ? "EJECUCION REAL" : "DRY-RUN"}`);
console.log(`Ordenes encontradas: ${orders.length}`);

const now = new Date().toISOString();
let affected = 0;

for (const order of orders) {
  if (order.status === "delivered") {
    continue;
  }

  affected++;
  console.log(
    `- ${order.orderNumber || order._id}: ${order.status || "sin status"} -> delivered`
  );

  if (EXECUTE) {
    await client
      .patch(order._id)
      .ifRevisionId(order._rev)
      .set({
        status: "delivered",
        updatedAt: now,
      })
      .commit();
  }
}

console.log(
  `\n${EXECUTE ? "Actualizadas" : "Se actualizarian"}: ${affected} orden(es)`
);

if (!EXECUTE) {
  console.log(
    "Para ejecutar de verdad: node scripts/mark-all-orders-delivered.mjs --execute"
  );
}
