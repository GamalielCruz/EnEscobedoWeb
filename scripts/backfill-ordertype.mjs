import { createClient } from "@sanity/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

/**
 * Backfill de `orderType` en documentos `order` existentes y limpieza del campo
 * obsoleto `deliveryMethod`.
 *   - deliveryMethod == "click_collect"  -> orderType "pickup"
 *   - resto / null (que no sea pickup)   -> orderType "delivery"
 * Si el doc ya tiene orderType, se respeta y solo se hace unset de deliveryMethod.
 *
 * Dry-run por defecto. Ejecutar: node scripts/backfill-ordertype.mjs --execute
 */
const EXECUTE = process.argv.includes("--execute");

const client = createClient({
  projectId: "t93gr28n",
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

const orders = await client.fetch(
  `*[_type == "order"]{ _id, orderNumber, deliveryMethod, orderType }`
);

console.log(`Modo: ${EXECUTE ? "⚡ EJECUCIÓN REAL" : "🧪 DRY-RUN"}`);
console.log(`Órdenes: ${orders.length}\n`);

let setCount = 0;
for (const o of orders) {
  const desiredType =
    o.orderType || (o.deliveryMethod === "click_collect" ? "pickup" : "delivery");
  const needsType = !o.orderType;
  const needsUnset = o.deliveryMethod !== undefined && o.deliveryMethod !== null;

  if (!needsType && !needsUnset) continue;

  setCount++;
  console.log(
    `${o.orderNumber || o._id}: orderType=${desiredType}` +
      (needsType ? " (set)" : " (ya tenía)") +
      (needsUnset ? `  | unset deliveryMethod(${o.deliveryMethod})` : "")
  );

  if (EXECUTE) {
    let patch = client.patch(o._id);
    if (needsType) patch = patch.set({ orderType: desiredType });
    if (needsUnset) patch = patch.unset(["deliveryMethod"]);
    await patch.commit();
  }
}

console.log(`\n${EXECUTE ? "✅ Actualizados" : "🧪 Se actualizarían"}: ${setCount} documentos`);
if (!EXECUTE) console.log("Para ejecutar: node scripts/backfill-ordertype.mjs --execute");
