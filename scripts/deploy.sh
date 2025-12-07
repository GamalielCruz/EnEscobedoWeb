#!/bin/bash

# Production Deployment Script
# Run this script to prepare and deploy your application

echo "🚀 Starting production deployment preparation..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Please run this script from the project root."
    exit 1
fi

print_status "Found package.json"

# Check if .env.production exists
if [ ! -f ".env.production" ]; then
    print_warning ".env.production not found. Please create it from .env.production.example"
    echo "Would you like to create it now? (y/n)"
    read -r response
    if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
        cp .env.production.example .env.production
        print_status "Created .env.production from template"
        print_warning "Please edit .env.production with your production values before continuing"
        exit 0
    else
        print_error "Cannot deploy without production environment variables"
        exit 1
    fi
fi

print_status "Found .env.production"

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production
if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi
print_status "Dependencies installed"

# Run type checking
echo "🔍 Checking TypeScript types..."
npm run typegen
if [ $? -ne 0 ]; then
    print_error "TypeScript type generation failed"
    exit 1
fi
print_status "TypeScript types generated"

# Run build
echo "🏗️  Building application..."
npm run build
if [ $? -ne 0 ]; then
    print_error "Build failed"
    exit 1
fi
print_status "Build completed successfully"

# Check build output
if [ ! -d ".next" ]; then
    print_error ".next directory not found after build"
    exit 1
fi

print_status "Build output verified"

# Display build statistics
echo ""
echo "📊 Build Statistics:"
echo "==================="
du -sh .next
echo ""

# Check for common issues
echo "🔍 Running pre-deployment checks..."

# Check for console.log statements (optional warning)
if grep -r "console.log" app/ components/ --include="*.tsx" --include="*.ts" > /dev/null 2>&1; then
    print_warning "Found console.log statements in code. Consider removing for production."
fi

# Check for TODO comments (optional warning)
if grep -r "TODO\|FIXME" app/ components/ --include="*.tsx" --include="*.ts" > /dev/null 2>&1; then
    print_warning "Found TODO/FIXME comments in code."
fi

print_status "Pre-deployment checks completed"

echo ""
echo "🎉 Production build ready!"
echo "=========================="
echo ""
echo "Next steps:"
echo "1. Review your .env.production file"
echo "2. Deploy to your hosting platform:"
echo "   - Vercel: vercel --prod"
echo "   - Netlify: netlify deploy --prod"
echo "   - Railway: railway up"
echo "3. Configure your production webhooks"
echo "4. Test the deployed application"
echo ""
echo "Your application is ready for production! 🚀"