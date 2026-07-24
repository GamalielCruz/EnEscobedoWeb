import { createClient } from "@sanity/client";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

/**
 * Migra documentos `clickCollectOrder` -> `order` (orderType: "pickup").
 *
 * - Idempotente: usa un _id determinístico `cc-migrated-<origId>` con createOrReplace.
 * - NO borra los documentos clickCollectOrder originales (eso se hace en el paso final).
 * - Dry-run por defecto. Para ejecutar de verdad: `node scripts/migrate-clickcollect-to-order.mjs --execute`
 */

const EXECUTE = process.argv.includes("--execute");

const client = createClient({
  projectId: "t93gr28n",
  dataset: process.env.VERCEL_ENV === "production" ? "production" : "test",
  useCdn: false,
  apiVersion: "2024-07-25",
  token: process.env.SANITY_API_TOKEN,
});

// Quita caracteres invisibles (artefactos stega) y espacios sobrantes.
const clean = (text) =>
  String(text ?? "")
    .replace(/[​-‏‪-‮⁠-⁯﻿]/g, "")
    .trim();

// Mapea el estado de clickCollectOrder al estado del schema order unificado.
function mapStatus(ccStatus) {
  switch (ccStatus) {
    case "completed":
      return "picked_up";
    case "processing":
      return "pending_pickup";
    case "pending":
      return "pending_pickup";
    case "ready_for_pickup":
      return "ready_for_pickup";
    case "picked_up":
      return "picked_up";
    case "cancelled":
      return "cancelled";
    default:
      return "pending_pickup";
  }
}

function mapPickupStatus(orderStatus) {
  switch (orderStatus) {
    case "picked_up":
      return "picked_up";
    case "ready_for_pickup":
      return "ready_for_pickup";
    case "cancelled":
      return "expired";
    default:
      return "in_transit";
  }
}

// Construye el documento `order` a partir de un `clickCollectOrder`.
function buildOrder(cc) {
  const status = mapStatus(cc.status);
  const ci = cc.customerInfo || {};
  const si = cc.storeInfo || {};

  const products = (cc.items || []).map((item, index) => {
    const priceNote = `Precio original al ordenar: $${item.price ?? "?"}`;
    const existingNote = clean(item.notes);
    return {
      _key: item._key || `item-${index}`,
      product: { _type: "reference", _ref: item.productId },
      quantity: item.quantity,
      // Las customizaciones ya vienen en el formato del schema order (title/options[label,priceDelta]).
      customizations: item.customizations || [],
      notes: existingNote ? `${existingNote}\n${priceNote}` : priceNote,
    };
  });

  // Notas a nivel orden: preservamos el "tiempo estimado" (no es datetime válido) y notas del cliente.
  const deliveryNotesParts = [];
  if (clean(cc.estimatedPickupDate))
    deliveryNotesParts.push(`Tiempo estimado de recogida: ${clean(cc.estimatedPickupDate)}`);
  if (clean(cc.notes)) deliveryNotesParts.push(`Notas del cliente: ${clean(cc.notes)}`);

  const order = {
    _id: `cc-migrated-${cc._id}`,
    _type: "order",
    orderNumber: cc.orderNumber,
    orderType: "pickup",
    currency: "mxn",
    customerName: clean(ci.name) || "Cliente",
    email: clean(ci.email),
    clerkUserId: ci.clerkUserId,
    phone: clean(ci.phone) || "No especificado",
    pickupStore: { _type: "reference", _ref: si.storeId },
    affiliateStore: { _type: "reference", _ref: si.storeId },
    products,
    totalPrice: cc.totalAmount,
    subtotal: cc.totalAmount,
    shippingCost: 0,
    paymentMethod: cc.paymentMethod || "cash_on_pickup",
    status,
    pickupStatus: mapPickupStatus(status),
    pickupCode: cc.pickupCode,
    orderDate: cc.createdAt || cc._createdAt,
  };

  if (deliveryNotesParts.length) order.deliveryNotes = deliveryNotesParts.join(" | ");
  if (cc.readyAt) order.readyAt = cc.readyAt;
  if (cc.pickedUpAt) order.pickedUpAt = cc.pickedUpAt;

  return order;
}

async function main() {
  const ccOrders = await client.fetch(`*[_type == "clickCollectOrder"] | order(createdAt asc)`);
  console.log(`\n=== MIGRACIÓN clickCollectOrder -> order ===`);
  console.log(`Modo: ${EXECUTE ? "⚡ EJECUCIÓN REAL" : "🧪 DRY-RUN (sin escribir)"}`);
  console.log(`Documentos a migrar: ${ccOrders.length}\n`);

  for (const cc of ccOrders) {
    const order = buildOrder(cc);
    console.log("────────────────────────────────────────────────────────");
    console.log(`Origen clickCollectOrder: ${cc._id}  (${cc.orderNumber})`);
    console.log(`Nuevo order _id:          ${order._id}`);
    console.log(JSON.stringify(order, null, 2));

    if (EXECUTE) {
      await client.createOrReplace(order);
      console.log(`✅ Escrito: ${order._id}`);
    }
  }

  console.log("\n────────────────────────────────────────────────────────");
  if (EXECUTE) {
    console.log(`✅ Migración completada. ${ccOrders.length} documentos order creados/reemplazados.`);
    console.log(`ℹ️  Los clickCollectOrder originales NO se borraron (se hace en el paso final).`);
  } else {
    console.log(`🧪 DRY-RUN finalizado. No se escribió nada.`);
    console.log(`Para ejecutar: node scripts/migrate-clickcollect-to-order.mjs --execute`);
  }
}

main().catch((e) => {
  console.error("❌ Error en migración:", e);
  process.exit(1);
});
