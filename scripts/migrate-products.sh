#!/bin/bash

# Script para migrar productos existentes y agregar campos de aprobación
# Este script usa sanity CLI para actualizar los documentos

echo "🔄 Iniciando migración de productos en Sanity..."

# Verificar que estemos en el directorio correcto
if [ ! -f "package.json" ]; then
  echo "❌ Error: Ejecuta este script desde la raíz del proyecto"
  exit 1
fi

# Leer variables de entorno
export $(cat .env.local | xargs)

echo "📦 Actualizando todos los productos con campos de aprobación..."

npx sanity exec scripts/migrate-products.js --with-user-token

if [ $? -eq 0 ]; then
  echo "✅ Migración completada exitosamente"
else
  echo "❌ Error durante la migración"
  exit 1
fi
