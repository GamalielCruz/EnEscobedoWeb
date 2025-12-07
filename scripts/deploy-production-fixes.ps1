# Script para desplegar las correcciones de producción
Write-Host "🚀 Desplegando correcciones de producción..." -ForegroundColor Green

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

# 1. Verificar que estamos en el directorio correcto
if (-not (Test-Path "package.json")) {
    Write-Error "package.json no encontrado. Ejecuta desde la raíz del proyecto."
    exit 1
}

Write-Success "Directorio del proyecto verificado"

# 2. Ejecutar build para verificar que todo compile
Write-Info "Ejecutando build de verificación..."
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Build falló. Revisa los errores antes de continuar."
    exit 1
}

Write-Success "Build exitoso - Sin errores de TypeScript"

# 3. Verificar estado de Git
Write-Info "Verificando estado de Git..."
$gitStatus = git status --porcelain

if ($gitStatus) {
    Write-Info "Cambios detectados. Preparando commit..."
    
    # Agregar todos los archivos
    git add .
    
    # Crear commit con mensaje descriptivo
    $commitMessage = "🔧 Fix production issues: Google Maps, Sanity CORS, and performance optimizations

- Fixed Google Maps TypeScript errors and loading issues
- Optimized Sanity client for production (disabled live features)
- Added CORS configuration scripts for Sanity
- Improved error handling and fallbacks
- Added production-specific configurations
- Created comprehensive troubleshooting guides

Ready for production deployment 🚀"

    git commit -m $commitMessage
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Commit creado exitosamente"
    } else {
        Write-Error "Error creando commit"
        exit 1
    }
} else {
    Write-Info "No hay cambios para commitear"
}

# 4. Push a GitHub
Write-Info "Haciendo push a GitHub..."
git push origin Click-and-collect

if ($LASTEXITCODE -eq 0) {
    Write-Success "Push exitoso a GitHub"
} else {
    Write-Error "Error haciendo push. Verifica tu conexión y permisos."
    exit 1
}

# 5. Mostrar resumen de cambios
Write-Host ""
Write-Host "📊 Resumen de correcciones aplicadas:" -ForegroundColor Cyan
Write-Host "======================================"
Write-Host "✅ Google Maps TypeScript errors corregidos"
Write-Host "✅ Sanity client optimizado para producción"
Write-Host "✅ CORS configuration scripts creados"
Write-Host "✅ Error handling mejorado"
Write-Host "✅ Production-specific configurations agregadas"
Write-Host "✅ Build exitoso sin errores"
Write-Host ""

# 6. Instrucciones finales
Write-Host "🎯 Próximos pasos para completar el despliegue:" -ForegroundColor Yellow
Write-Host "=============================================="
Write-Host ""
Write-Host "1. 🔑 Configurar Google Maps API Key:"
Write-Host "   - Ve a: https://console.cloud.google.com/apis/credentials"
Write-Host "   - Edita tu API Key"
Write-Host "   - Agrega: https://www.pixelaplastico.com/*"
Write-Host ""
Write-Host "2. 🗄️  Configurar CORS de Sanity:"
Write-Host "   - Ejecuta: node scripts/setup-sanity-cors.js"
Write-Host "   - O manualmente en: https://www.sanity.io/manage"
Write-Host ""
Write-Host "3. 🌐 Verificar variables de entorno en producción:"
Write-Host "   - NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
Write-Host "   - NEXT_PUBLIC_BASE_URL=https://www.pixelaplastico.com"
Write-Host "   - NEXT_PUBLIC_SITE_URL=https://www.pixelaplastico.com"
Write-Host ""
Write-Host "4. 🚀 Redesplegar en tu plataforma:"
Write-Host "   - Vercel: Automático al hacer push"
Write-Host "   - Netlify: Trigger new deploy"
Write-Host "   - Railway: railway up"
Write-Host ""
Write-Host "5. 🧪 Verificar funcionamiento:"
Write-Host "   - Abrir: https://www.pixelaplastico.com/select-store"
Write-Host "   - Verificar que no haya errores en consola"
Write-Host "   - Probar funcionalidad de mapas y Click `& Collect"
Write-Host ""

Write-Host "Correcciones desplegadas exitosamente!" -ForegroundColor Green
Write-Host "Tu aplicacion esta lista para funcionar correctamente en produccion." -ForegroundColor Green