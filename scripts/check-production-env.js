// Script para verificar variables de entorno de producción
const requiredEnvVars = [
  "NEXT_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_SANITY_PROJECT_ID",
  "NEXT_PUBLIC_SANITY_DATASET",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SANITY_API_TOKEN",
];

const optionalEnvVars = ["SANITY_API_READ_TOKEN", "CLERK_SECRET_KEY"];

console.log("🔍 Verificando variables de entorno de producción...\n");

let hasErrors = false;
let hasWarnings = false;

// Verificar variables requeridas
console.log("✅ Variables Requeridas:");
console.log("========================");
requiredEnvVars.forEach((varName) => {
  const value = process.env[varName];
  if (!value) {
    console.log(`❌ ${varName}: NO CONFIGURADA`);
    hasErrors = true;
  } else if (
    value.includes("localhost") ||
    value.includes("test_") ||
    value.includes("sk_test_")
  ) {
    console.log(
      `⚠️  ${varName}: VALOR DE DESARROLLO (${value.substring(0, 20)}...)`
    );
    hasWarnings = true;
  } else {
    console.log(`✅ ${varName}: CONFIGURADA`);
  }
});

console.log("\n📋 Variables Opcionales:");
console.log("========================");
optionalEnvVars.forEach((varName) => {
  const value = process.env[varName];
  if (!value) {
    console.log(`⚠️  ${varName}: No configurada (opcional)`);
  } else {
    console.log(`✅ ${varName}: CONFIGURADA`);
  }
});

// Verificaciones específicas
console.log("\n🔍 Verificaciones Específicas:");
console.log("==============================");

// Verificar Google Maps API Key
const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (mapsKey) {
  if (mapsKey.startsWith("AIza")) {
    console.log("✅ Google Maps API Key: Formato correcto");
  } else {
    console.log("❌ Google Maps API Key: Formato incorrecto");
    hasErrors = true;
  }
} else {
  console.log("❌ Google Maps API Key: No configurada");
  hasErrors = true;
}

// Verificar URLs de producción
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
if (baseUrl) {
  if (baseUrl.startsWith("https://")) {
    console.log("✅ Base URL: Usa HTTPS");
  } else if (baseUrl.includes("localhost")) {
    console.log("⚠️  Base URL: Usa localhost (desarrollo)");
    hasWarnings = true;
  } else {
    console.log("⚠️  Base URL: No usa HTTPS");
    hasWarnings = true;
  }
}

// Verificar Stripe Keys
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (stripeKey) {
  if (stripeKey.startsWith("sk_live_")) {
    console.log("✅ Stripe: Usando claves de producción");
  } else if (stripeKey.startsWith("sk_test_")) {
    console.log("⚠️  Stripe: Usando claves de prueba");
    hasWarnings = true;
  } else {
    console.log("❌ Stripe: Formato de clave incorrecto");
    hasErrors = true;
  }
}

// Verificar Clerk Keys
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
if (clerkKey) {
  if (clerkKey.startsWith("pk_live_")) {
    console.log("✅ Clerk: Usando claves de producción");
  } else if (clerkKey.startsWith("pk_test_")) {
    console.log("⚠️  Clerk: Usando claves de prueba");
    hasWarnings = true;
  } else {
    console.log("❌ Clerk: Formato de clave incorrecto");
    hasErrors = true;
  }
}

// Resumen final
console.log("\n📊 Resumen:");
console.log("===========");

if (hasErrors) {
  console.log(
    "❌ ERRORES ENCONTRADOS - La aplicación puede no funcionar correctamente"
  );
  console.log("\n🔧 Acciones requeridas:");
  console.log("1. Configura todas las variables requeridas");
  console.log("2. Verifica que las API keys tengan el formato correcto");
  console.log("3. Asegúrate de usar claves de producción, no de desarrollo");
  process.exit(1);
} else if (hasWarnings) {
  console.log("⚠️  ADVERTENCIAS ENCONTRADAS - Revisa la configuración");
  console.log("\n💡 Recomendaciones:");
  console.log("1. Cambia a claves de producción si es necesario");
  console.log("2. Usa HTTPS para URLs de producción");
  console.log("3. Verifica las restricciones de API keys");
} else {
  console.log("✅ CONFIGURACIÓN CORRECTA - Lista para producción");
}

console.log("\n🚀 Para solucionar problemas de Google Maps:");
console.log("1. Ve a: https://console.cloud.google.com/apis/credentials");
console.log("2. Edita tu API Key de Google Maps");
console.log("3. Agrega tu dominio de producción a las restricciones");
console.log("4. Verifica que estén habilitadas las APIs necesarias:");
console.log("   - Maps JavaScript API");
console.log("   - Places API");
console.log("   - Geocoding API");
