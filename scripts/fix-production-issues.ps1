# Script para solucionar problemas de producción
Write-Host "🔧 Solucionando problemas de producción..." -ForegroundColor Green

# Función para mostrar mensajes
function Write-Success {
    param($Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Info {
    param($Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "🎯 Problemas a solucionar:" -ForegroundColor Cyan
Write-Host "1. Google Maps Constructor Error"
Write-Host "2. CORS Error con Sanity"
Write-Host "3. Conexión Sanity Live interrumpida"
Write-Host ""

# 1. Verificar variables de entorno
Write-Info "1. Verificando variables de entorno..."

$requiredVars = @(
    'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
    'NEXT_PUBLIC_SANITY_PROJECT_ID',
    'NEXT_PUBLIC_SANITY_DATASET'
)

$hasErrors = $false

foreach ($var in $requiredVars) {
    $value = [Environment]::GetEnvironmentVariable($var)
    if (-not $value) {
        Write-Error "$var no está configurada"
        $hasErrors = $true
    } else {
        Write-Success "$var configurada"
    }
}

# 2. Configurar CORS de Sanity
Write-Info "2. Configurando CORS de Sanity..."

try {
    Write-Host "Ejecutando configuración de CORS..." -ForegroundColor Yellow
    node scripts/setup-sanity-cors.js
    Write-Success "CORS de Sanity configurado"
} catch {
    Write-Warning "Error configurando CORS. Configúralo manualmente en https://www.sanity.io/manage"
}

# 3. Verificar build
Write-Info "3. Verificando build de producción..."

try {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Build exitoso"
    } else {
        Write-Error "Build falló"
        $hasErrors = $true
    }
} catch {
    Write-Error "Error ejecutando build"
    $hasErrors = $true
}

# 4. Instrucciones finales
Write-Host ""
Write-Host "📋 Pasos manuales requeridos:" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔑 Google Maps API Key:" -ForegroundColor Yellow
Write-Host "1. Ve a: https://console.cloud.google.com/apis/credentials"
Write-Host "2. Edita tu API Key de Google Maps"
Write-Host "3. En 'Restricciones de aplicación' → 'Restricciones de referente HTTP'"
Write-Host "4. Agrega:"
Write-Host "   - https://www.pixelaplastico.com/*"
Write-Host "   - https://pixelaplastico.com/*"
Write-Host ""

Write-Host "🗄️  Sanity CORS:" -ForegroundColor Yellow
Write-Host "1. Ve a: https://www.sanity.io/manage"
Write-Host "2. Selecciona proyecto: kgklfrat"
Write-Host "3. Settings → API → CORS Origins"
Write-Host "4. Verifica que estén agregados:"
Write-Host "   - https://www.pixelaplastico.com"
Write-Host "   - https://pixelaplastico.com"
Write-Host "5. Marca 'Allow credentials'"
Write-Host ""

Write-Host "🌐 Variables de Entorno en Producción:" -ForegroundColor Yellow
Write-Host "Asegúrate de tener configuradas en tu plataforma de despliegue:"
Write-Host "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu_api_key_de_produccion"
Write-Host "NEXT_PUBLIC_BASE_URL=https://www.pixelaplastico.com"
Write-Host "NEXT_PUBLIC_SITE_URL=https://www.pixelaplastico.com"
Write-Host ""

if ($hasErrors) {
    Write-Error "Se encontraron errores. Revisa la configuración antes de desplegar."
    exit 1
} else {
    Write-Success "Verificación completada. Sigue los pasos manuales para completar la configuración."
}

Write-Host ""
Write-Host "🚀 Después de completar los pasos manuales:" -ForegroundColor Green
Write-Host "1. Redesplegar la aplicación"
Write-Host "2. Verificar que no aparezcan errores en la consola"
Write-Host "3. Probar funcionalidad de mapas y Click & Collect"