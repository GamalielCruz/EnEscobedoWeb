/**
 * Diagnóstico técnico del schema de Sanity
 * Ejecutar: node scripts/diagnose-schema.mjs
 *
 * Verifica: schema correcto, duplicados, ownerClerkUserId, _type del documento
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

console.log("═".repeat(60));
console.log("DIAGNÓSTICO DE SCHEMA - Tienda Afiliada / ownerClerkUserId");
console.log("═".repeat(60));

let hasErrors = false;

// 1. Verificar affiliateStoreType.ts (fuente)
console.log("\n[1] Verificando sanity/schemaTypes/affiliateStoreType.ts");
const affiliateTypePath = join(projectRoot, "sanity", "schemaTypes", "affiliateStoreType.ts");
if (!existsSync(affiliateTypePath)) {
  console.error("   ❌ Archivo no existe");
  hasErrors = true;
} else {
  const source = readFileSync(affiliateTypePath, "utf8");
  const hasOwnerInSource = source.includes("ownerClerkUserId");
  if (hasOwnerInSource) {
    console.log("   ✅ ownerClerkUserId presente en el código fuente");
  } else {
    console.error("   ❌ ownerClerkUserId NO encontrado en el código fuente");
    hasErrors = true;
  }
}

// 2. Verificar schemaTypes/index.ts - affiliateStoreType importado
console.log("\n[2] Verificando sanity/schemaTypes/index.ts");
const indexPath = join(projectRoot, "sanity", "schemaTypes", "index.ts");
if (!existsSync(indexPath)) {
  console.error("   ❌ Archivo no existe");
  hasErrors = true;
} else {
  const indexSource = readFileSync(indexPath, "utf8");
  const hasImport = indexSource.includes("affiliateStoreType");
  const hasInTypes = indexSource.includes("affiliateStoreType") && indexSource.includes("types:");
  if (hasImport && hasInTypes) {
    console.log("   ✅ affiliateStoreType importado y en schema.types");
  } else {
    console.error("   ❌ affiliateStoreType no importado o no en types");
    hasErrors = true;
  }
}

// 3. Verificar sanity.config.ts
console.log("\n[3] Verificando sanity.config.ts");
const configPath = join(projectRoot, "sanity.config.ts");
if (!existsSync(configPath)) {
  console.error("   ❌ Archivo no existe");
  hasErrors = true;
} else {
  const configSource = readFileSync(configPath, "utf8");
  const hasSchemaImport = configSource.includes("schema") && configSource.includes("sanity/schemaTypes");
  const hasSchemaInConfig = configSource.includes("schema,") || configSource.includes("schema:");
  if (hasSchemaImport && hasSchemaInConfig) {
    console.log("   ✅ schema importado de sanity/schemaTypes y pasado a defineConfig");
  } else {
    console.error("   ❌ schema no importado correctamente");
    hasErrors = true;
  }
}

// 4. Verificar schema.json (generado por sanity schema extract)
console.log("\n[4] Verificando schema.json");
const schemaJsonPath = join(projectRoot, "schema.json");
if (!existsSync(schemaJsonPath)) {
  console.log("   ⚠️ schema.json no existe. Ejecutar: npm run typegen");
} else {
  const schemaJson = JSON.parse(readFileSync(schemaJsonPath, "utf8"));
  const affiliateStoreJson = schemaJson.find((t) => t.name === "affiliateStore");
  if (!affiliateStoreJson) {
    console.error("   ❌ affiliateStore no encontrado en schema.json");
    hasErrors = true;
  } else {
    const attrs = affiliateStoreJson.attributes || {};
    if ("ownerClerkUserId" in attrs) {
      console.log("   ✅ ownerClerkUserId en schema.json (schema extract actualizado)");
    } else {
      console.log("   ❌ ownerClerkUserId NO en schema.json");
      console.log("   → Ejecutar: npm run typegen");
      hasErrors = true;
    }
  }
}

// 5. Detectar schemas/definiciones duplicadas
console.log("\n[5] Buscando definiciones duplicadas de 'affiliateStore'...");
const schemaTypesDir = join(projectRoot, "sanity", "schemaTypes");
const files = ["affiliateStoreType.ts", "index.ts", "productType.ts", "orderType.ts"];
let duplicateCount = 0;
for (const f of files) {
  const p = join(schemaTypesDir, f);
  if (existsSync(p)) {
    const content = readFileSync(p, "utf8");
    const matches = content.match(/name:\s*["']affiliateStore["']/g);
    if (matches && matches.length > 1) {
      console.log(`   ⚠️ ${f}: múltiples definiciones de name "affiliateStore"`);
      duplicateCount += matches.length;
    }
  }
}
if (duplicateCount === 0) {
  console.log("   ✅ Solo referencias, sin duplicar definición de tipo document");
} else {
  console.log("   ⚠️ Revisar archivos con múltiples name: 'affiliateStore'");
}

// 6. Verificar app/studio page
console.log("\n[6] Verificando app/studio/[[...tool]]/page.tsx");
const studioPagePath = join(projectRoot, "app", "studio", "[[...tool]]", "page.tsx");
if (!existsSync(studioPagePath)) {
  console.error("   ❌ Página del Studio no encontrada");
  hasErrors = true;
} else {
  const pageSource = readFileSync(studioPagePath, "utf8");
  const importsConfig = pageSource.includes("sanity.config") || pageSource.includes("sanity.config");
  const usesNextStudio = pageSource.includes("NextStudio");
  if (importsConfig && usesNextStudio) {
    console.log("   ✅ Importa config y usa NextStudio");
  } else {
    console.error("   ❌ No importa sanity.config o no usa NextStudio");
    hasErrors = true;
  }
}

// 7. Detectar si Sanity podría estar usando schema viejo
console.log("\n[7] Posibles causas de schema viejo:");
console.log("   • next-sanity empaqueta el config en el bundle de Next.js");
console.log("   • Si .next existe con build anterior, puede servir JS cacheado");
console.log("   • Comando: Remove-Item -Recurse -Force .next");
console.log("   • Luego: npm run dev");

// 8. Debug en runtime
console.log("\n[8] Para confirmar schema en tiempo real en el navegador:");
console.log("   Editar sanity.config.ts - añadir ANTES del 'export default':");
console.log("");
console.log("   const affiliateType = schema.types?.find(t => t.name === 'affiliateStore');");
console.log("   const hasOwner = affiliateType?.fields?.some(f => f.name === 'ownerClerkUserId');");
console.log("   if (typeof window !== 'undefined') console.log('[Sanity] ownerClerkUserId:', hasOwner);");
console.log("");

console.log("═".repeat(60));
if (hasErrors) {
  console.log("RESULTADO: Se encontraron errores. Revisar arriba.");
  process.exit(1);
} else {
  console.log("RESULTADO: Schema OK en código. Si el campo no aparece,");
  console.log("es probable caché de Next.js (.next) o del navegador.");
  console.log("═".repeat(60));
}
