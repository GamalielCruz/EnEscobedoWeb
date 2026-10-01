// Herramienta de STAGING para pedidos de prueba con el NIP vencido (TTL 24 h):
// el código sigue siendo válido, solo hay que extender su vencimiento.
//   node --env-file=.env.local scripts/staging-extend-nip.mjs list [folioCorto]
//   node --env-file=.env.local scripts/staging-extend-nip.mjs extend <_id> [horas]
// `list` busca por FOLIO CORTO (el # de 6 dígitos que muestra Drive), que no es
// el orderNumber. Guarda dura: SOLO opera sobre el dataset "test" (staging).

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET;
const token = process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN;

if (!projectId || !dataset || !token) {
  console.error("Faltan variables de Sanity (projectId/dataset/token).");
  process.exit(1);
}
if (dataset !== "test") {
  console.error(`ABORTADO: dataset="${dataset}" — este script solo opera en "test" (staging).`);
  process.exit(1);
}

const base = `https://${projectId}.api.sanity.io/v2024-07-25`;

// Mismo algoritmo que lib/dispatch/dispatch-format.ts → shortOrderCode.
function shortOrderCode(orderNumber) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < orderNumber.length; i++) {
    hash ^= orderNumber.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return String(100_000 + ((hash >>> 0) % 900_000));
}

async function query(groq) {
  const url = `${base}/data/query/${dataset}?query=${encodeURIComponent(groq)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`query ${res.status}: ${await res.text()}`);
  return (await res.json()).result;
}

async function patch(id, set) {
  const res = await fetch(`${base}/data/mutate/${dataset}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ mutations: [{ patch: { id, set } }] }),
  });
  if (!res.ok) throw new Error(`mutate ${res.status}: ${await res.text()}`);
  return (await res.json()).results;
}

const [cmd, arg, arg2] = process.argv.slice(2);
console.log(`dataset=${dataset} projectId=${projectId} comando=${cmd}\n`);

if (cmd === "list") {
  const rows = await query(`*[_type == "order" && !(_id in path("drafts.**")) && defined(deliveryPinHash)]{
    _id, orderNumber, serviceKind, dispatchStatus, status, orderStatus,
    deliveryVerificationMethod, deliveryVerificationStatus, deliveryPinExpiresAt,
    deliveryPinRegenCount, "driver": repartidorAsignado->nombre
  } | order(_updatedAt desc)[0...200]`);
  const now = Date.now();
  const found = rows
    .map((r) => ({ ...r, short: shortOrderCode(r.orderNumber) }))
    .filter((r) => !arg || r.short === arg);
  if (found.length === 0) console.log(`Sin resultados para folio corto ${arg}.`);
  for (const r of found) {
    const exp = r.deliveryPinExpiresAt ? new Date(r.deliveryPinExpiresAt) : null;
    console.log(
      `#${r.short}  ${r._id}\n` +
        `   tipo=${r.serviceKind} dispatch=${r.dispatchStatus} status=${r.status}/${r.orderStatus}\n` +
        `   metodo=${r.deliveryVerificationMethod} verificacion=${r.deliveryVerificationStatus} regen=${r.deliveryPinRegenCount ?? 0}\n` +
        `   NIP expira=${r.deliveryPinExpiresAt ?? "(sin fecha)"} → ${exp ? (exp.getTime() <= now ? "EXPIRADO" : "vigente") : "sin TTL"}\n` +
        `   driver=${r.driver ?? "—"}\n`
    );
  }
} else if (cmd === "extend") {
  if (!arg) {
    console.error("Falta el _id del pedido.");
    process.exit(1);
  }
  const hours = Number(arg2 ?? 24);
  const before = await query(`*[_id == $id][0]{orderNumber, serviceKind, deliveryVerificationStatus, deliveryPinExpiresAt, dispatchStatus}`.replace("$id", JSON.stringify(arg)));
  if (!before) {
    console.error("El pedido no existe.");
    process.exit(1);
  }
  const newExpiry = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  await patch(arg, { deliveryPinExpiresAt: newExpiry });
  console.log(
    `#${shortOrderCode(before.orderNumber)} (${arg})\n` +
      `   antes: ${before.deliveryPinExpiresAt ?? "(sin fecha)"}  (dispatch=${before.dispatchStatus})\n` +
      `   ahora: ${newExpiry}  (+${hours} h)\n` +
      `   El código existente vuelve a ser válido: no se regeneró el hash.`
  );
} else {
  console.error("Uso: list [folioCorto] | extend <_id> [horas]");
  process.exit(1);
}
