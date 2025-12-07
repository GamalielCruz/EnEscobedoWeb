# Production Deployment Script for Windows PowerShell
# Run this script to prepare and deploy your application

Write-Host "🚀 Starting production deployment preparation..." -ForegroundColor Green

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

# Check if we're in the right directory
if (-not (Test-Path "package.json")) {
    Write-Error "package.json not found. Please run this script from the project root."
    exit 1
}

Write-Success "Found package.json"

# Check if .env.production exists
if (-not (Test-Path ".env.production")) {
    Write-Warning ".env.production not found. Please create it from .env.production.example"
    $response = Read-Host "Would you like to create it now? (y/n)"
    if ($response -match "^[yY]") {
        Copy-Item ".env.production.example" ".env.production"
        Write-Success "Created .env.production from template"
        Write-Warning "Please edit .env.production with your production values before continuing"
        exit 0
    } else {
        Write-Error "Cannot deploy without production environment variables"
        exit 1
    }
}

Write-Success "Found .env.production"

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
npm ci --only=production
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install dependencies"
    exit 1
}
Write-Success "Dependencies installed"

# Run type checking
Write-Host "🔍 Checking TypeScript types..." -ForegroundColor Cyan
npm run typegen
if ($LASTEXITCODE -ne 0) {
    Write-Error "TypeScript type generation failed"
    exit 1
}
Write-Success "TypeScript types generated"

# Run build
Write-Host "🏗️  Building application..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Build failed"
    exit 1
}
Write-Success "Build completed successfully"

# Check build output
if (-not (Test-Path ".next")) {
    Write-Error ".next directory not found after build"
    exit 1
}

Write-Success "Build output verified"

# Display build statistics
Write-Host ""
Write-Host "📊 Build Statistics:" -ForegroundColor Cyan
Write-Host "==================="
$size = (Get-ChildItem .next -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ".next directory size: $([math]::Round($size, 2)) MB"
Write-Host ""

# Check for common issues
Write-Host "🔍 Running pre-deployment checks..." -ForegroundColor Cyan

# Check for console.log statements (optional warning)
$consoleLogFiles = Get-ChildItem -Path "app", "components" -Recurse -Include "*.tsx", "*.ts" | Select-String "console.log" -Quiet
if ($consoleLogFiles) {
    Write-Warning "Found console.log statements in code. Consider removing for production."
}

# Check for TODO comments (optional warning)
$todoFiles = Get-ChildItem -Path "app", "components" -Recurse -Include "*.tsx", "*.ts" | Select-String "TODO|FIXME" -Quiet
if ($todoFiles) {
    Write-Warning "Found TODO/FIXME comments in code."
}

Write-Success "Pre-deployment checks completed"

Write-Host ""
Write-Host "🎉 Production build ready!" -ForegroundColor Green
Write-Host "=========================="
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Review your .env.production file"
Write-Host "2. Deploy to your hosting platform:"
Write-Host "   - Vercel: vercel --prod"
Write-Host "   - Netlify: netlify deploy --prod"
Write-Host "   - Railway: railway up"
Write-Host "3. Configure your production webhooks"
Write-Host "4. Test the deployed application"
Write-Host ""
Write-Host "Your application is ready for production! 🚀" -ForegroundColor Green