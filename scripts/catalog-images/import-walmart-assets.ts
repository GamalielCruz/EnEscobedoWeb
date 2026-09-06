import { createClient } from "@sanity/client";
import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

type ManifestEntry = {
  barcode: string;
  imageUrl: string;
  targetProductName?: string;
};

type SanityProduct = {
  _id: string;
  barcode?: string;
  name?: string;
};

type ScriptOptions = {
  manifestPath: string;
  execute: boolean;
  limit: number | null;
};

type RunStats = {
  totalProcessed: number;
  successfulMatches: number;
  updated: number;
  noMatch: number;
  invalidManifestEntries: number;
  duplicateBarcodes: number;
  missingInManifest: number;
  manifestWithoutProduct: number;
  downloadFailures: number;
  uploadFailures: number;
  patchFailures: number;
};

const SANITY_PROJECT_ID = process.env.SANITY_PROJECT_ID || process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const SANITY_DATASET = process.env.SANITY_DATASET || process.env.NEXT_PUBLIC_SANITY_DATASET;
const SANITY_WRITE_TOKEN = process.env.SANITY_WRITE_TOKEN || process.env.SANITY_API_TOKEN;

if (!SANITY_PROJECT_ID) {
  throw new Error("Falta SANITY_PROJECT_ID en el entorno.");
}

if (!SANITY_DATASET) {
  throw new Error("Falta SANITY_DATASET en el entorno.");
}

if (!SANITY_WRITE_TOKEN) {
  throw new Error("Falta SANITY_WRITE_TOKEN en el entorno.");
}

const writeClient = createClient({
  projectId: SANITY_PROJECT_ID,
  dataset: SANITY_DATASET,
  apiVersion: "2024-07-25",
  useCdn: false,
  token: SANITY_WRITE_TOKEN,
});

function parseOptions(argv: string[]): ScriptOptions {
  const manifestArg = argv.find((arg) => arg.startsWith("--manifest="));
  const limitArg = argv.find((arg) => arg.startsWith("--limit="));
  const rawLimit = limitArg?.slice("--limit=".length);
  let parsedLimit: number | null = null;

  if (rawLimit != null) {
    const numericLimit = Number(rawLimit);
    if (!Number.isInteger(numericLimit) || numericLimit <= 0) {
      throw new Error("La bandera --limit debe ser un entero positivo. Ejemplo: --limit=10");
    }
    parsedLimit = numericLimit;
  }

  return {
    manifestPath:
      manifestArg?.slice("--manifest=".length) ||
      "scripts/catalog-images/walmart-scraped-products.json",
    execute: argv.includes("--execute"),
    limit: parsedLimit,
  };
}

function normalizeText(value: string | undefined | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

function isValidManifestEntry(entry: unknown): entry is ManifestEntry {
  if (!entry || typeof entry !== "object") {
    return false;
  }

  const candidate = entry as Partial<ManifestEntry>;
  if (typeof candidate.barcode !== "string" || !/^\d{8,14}$/.test(candidate.barcode.trim())) return false;
  if (typeof candidate.imageUrl !== "string") return false;
  try {
    return new URL(candidate.imageUrl).protocol === "https:";
  } catch {
    return false;
  }
}

async function readManifest(filePath: string) {
  const absolutePath = path.resolve(filePath);
  let raw: string;
  try {
    raw = await readFile(absolutePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`No existe el manifiesto real: ${absolutePath}`);
    }
    throw error;
  }
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`El manifiesto debe ser un arreglo JSON: ${absolutePath}`);
  }

  const validEntries: ManifestEntry[] = [];
  let invalidEntries = 0;
  let duplicateBarcodes = 0;
  const seenBarcodes = new Set<string>();

  parsed.forEach((entry) => {
    if (isValidManifestEntry(entry)) {
      const barcode = entry.barcode.trim();
      if (seenBarcodes.has(barcode)) {
        duplicateBarcodes++;
        return;
      }
      seenBarcodes.add(barcode);
      validEntries.push({ barcode, imageUrl: entry.imageUrl.trim(), targetProductName: entry.targetProductName?.trim() });
      return;
    }

    invalidEntries++;
  });

  return { absolutePath, validEntries, invalidEntries, duplicateBarcodes };
}

function buildManifestIndex(entries: ManifestEntry[]) {
  const index = new Map<string, ManifestEntry>();

  for (const entry of entries) {
    const key = entry.barcode;
    if (!key || index.has(key)) continue;
    index.set(key, entry);
  }

  return index;
}

async function fetchProductsWithoutImage() {
  return writeClient.fetch<SanityProduct[]>(
    `*[_type == "product" && !defined(image) && approvalStatus == "approved"]{
      _id,
      barcode,
      name
    } | order(name asc)`
  );
}

function ensureHttpUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") {
    throw new Error(`URL no soportada: ${rawUrl}`);
  }
  return url;
}

function inferExtension(contentType: string | null, url: URL) {
  const pathnameExtension = path.extname(url.pathname).toLowerCase();
  if (pathnameExtension) {
    return pathnameExtension;
  }

  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";

  return ".jpg";
}

async function downloadImageBuffer(imageUrl: string) {
  const url = ensureHttpUrl(imageUrl);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ElMenuSuperCatalogImporter/1.0",
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`Descarga fallida (${response.status} ${response.statusText})`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new Error(`La URL no devolvió una imagen válida (${contentType})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
    sourceUrl: url,
  };
}

async function uploadImageAsset(params: {
  product: SanityProduct;
  buffer: Buffer;
  contentType: string;
  sourceUrl: URL;
}) {
  const { product, buffer, contentType, sourceUrl } = params;
  const safeName = normalizeText(product.name).replace(/[^a-z0-9]+/g, "-") || product._id;
  const filename = `${safeName}${inferExtension(contentType, sourceUrl)}`;

  return writeClient.assets.upload("image", buffer, {
    filename,
    contentType,
    source: {
      id: sourceUrl.toString(),
      name: "walmart-manifest-import",
      url: sourceUrl.toString(),
    },
  });
}

async function patchProductImage(productId: string, assetId: string) {
  return writeClient
    .patch(productId)
    .set({
      image: {
        _type: "image",
        asset: {
          _type: "reference",
          _ref: assetId,
        },
      },
    })
    .commit();
}

async function processProduct(params: {
  product: SanityProduct;
  manifestIndex: Map<string, ManifestEntry>;
  dryRun: boolean;
  position: number;
  total: number;
  stats: RunStats;
}) {
  const { product, manifestIndex, dryRun, position, total, stats } = params;
  stats.totalProcessed++;
  const barcode = String(product.barcode || "").trim();

  if (!barcode) {
    console.error(`[${position}/${total}] Error: producto sin código de barras válido (${product._id})`);
    return;
  }

  const manifestEntry = manifestIndex.get(barcode);
  if (!manifestEntry) {
    stats.noMatch++;
    console.log(`[${position}/${total}] Sin coincidencia: ${product.name}`);
    return;
  }

  stats.successfulMatches++;
  console.log(`[${position}/${total}] Match: ${product.name}`);

  if (dryRun) {
    console.log(
      `[${position}/${total}] DRY-RUN: ${product.name} (${barcode}) -> ${manifestEntry.imageUrl}`
    );
    return;
  }

  let downloadResult: Awaited<ReturnType<typeof downloadImageBuffer>>;
  try {
    downloadResult = await downloadImageBuffer(manifestEntry.imageUrl);
  } catch (error) {
    stats.downloadFailures++;
    console.error(
      `[${position}/${total}] Error de descarga en ${product.name}:`,
      error instanceof Error ? error.message : error
    );
    return;
  }

  let assetId: string;
  try {
    const asset = await uploadImageAsset({
      product,
      buffer: downloadResult.buffer,
      contentType: downloadResult.contentType,
      sourceUrl: downloadResult.sourceUrl,
    });
    assetId = asset._id;
  } catch (error) {
    stats.uploadFailures++;
    console.error(
      `[${position}/${total}] Error de subida en ${product.name}:`,
      error instanceof Error ? error.message : error
    );
    return;
  }

  try {
    await patchProductImage(product._id, assetId);
    stats.updated++;
    console.log(`[${position}/${total}] Procesado con exito: ${product.name}`);
  } catch (error) {
    stats.patchFailures++;
    console.error(
      `[${position}/${total}] Error al parchar ${product.name}:`,
      error instanceof Error ? error.message : error
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const dryRun = !options.execute;
  const { absolutePath, validEntries, invalidEntries, duplicateBarcodes } = await readManifest(options.manifestPath);
  const manifestIndex = buildManifestIndex(validEntries);
  const products = await fetchProductsWithoutImage();
  const matchedProducts = products.filter((product) => Boolean(product.barcode && manifestIndex.has(product.barcode.trim())));
  const missingInManifest = products.filter((product) => !product.barcode || !manifestIndex.has(product.barcode.trim())).length;
  const productBarcodes = new Set(products.map((product) => product.barcode?.trim()).filter(Boolean));
  const manifestWithoutProduct = validEntries.filter((entry) => !productBarcodes.has(entry.barcode)).length;
  const productsToProcess =
    options.limit != null ? matchedProducts.slice(0, options.limit) : matchedProducts;

  const stats: RunStats = {
    totalProcessed: 0,
    successfulMatches: 0,
    updated: 0,
    noMatch: 0,
    invalidManifestEntries: invalidEntries,
    duplicateBarcodes,
    missingInManifest,
    manifestWithoutProduct,
    downloadFailures: 0,
    uploadFailures: 0,
    patchFailures: 0,
  };

  console.log(`Modo: ${dryRun ? "DRY-RUN" : "EJECUCION REAL"}`);
  console.log(`Dataset Sanity: ${SANITY_DATASET}`);
  console.log(`Manifiesto: ${absolutePath}`);
  console.log(`Entradas válidas en manifiesto: ${validEntries.length}`);
  console.log(`Entradas inválidas en manifiesto: ${invalidEntries}`);
  console.log(`Códigos de barras duplicados: ${duplicateBarcodes}`);
  console.log(`Productos aprobados sin imagen: ${products.length}`);
  console.log(`Productos con match en manifiesto: ${matchedProducts.length}`);
  console.log(`Productos sin match en manifiesto: ${missingInManifest}`);
  console.log(`Entradas de manifiesto sin producto en Sanity: ${manifestWithoutProduct}`);

  if (options.limit != null) {
    console.log(
      `⚠️ Modo de prueba activo: Se limitará el procesamiento a los primeros ${options.limit} productos con match`
    );
  }

  let position = 0;
  for (const product of productsToProcess) {
    position++;
    await processProduct({
      product,
      manifestIndex,
      dryRun,
      position,
      total: productsToProcess.length,
      stats,
    });
  }

  console.log("\nResumen del lote:");
  console.log(`- Total procesados: ${stats.totalProcessed}`);
  console.log(`- Matches exitosos: ${stats.successfulMatches}`);
  console.log(`- Actualizados: ${stats.updated}`);
  console.log(`- Sin coincidencia: ${stats.noMatch}`);
  console.log(`- Descargas fallidas: ${stats.downloadFailures}`);
  console.log(`- Subidas fallidas: ${stats.uploadFailures}`);
  console.log(`- Parches fallidos: ${stats.patchFailures}`);
  console.log(`- Entradas inválidas en JSON: ${stats.invalidManifestEntries}`);
  console.log(`- Códigos de barras duplicados: ${stats.duplicateBarcodes}`);
  console.log(`- Productos sin match en manifiesto: ${stats.missingInManifest}`);
  console.log(`- Entradas de manifiesto sin producto en Sanity: ${stats.manifestWithoutProduct}`);

  if (dryRun) {
    console.log(
      "\nPara ejecutar cambios reales usa: node --experimental-strip-types scripts/catalog-images/import-walmart-assets.ts --execute"
    );
  }
}

main().catch((error) => {
  console.error("Error fatal en import-walmart-assets:", error);
  process.exitCode = 1;
});
