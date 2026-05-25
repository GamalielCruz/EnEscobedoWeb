# Migración: Convertir icon de string a object

Este script migra el campo `icon` de las categorías de tienda de formato string (emoji) a formato object con soporte para imágenes PNG.

## Cambios
- Convierte valores string existentes al formato `{ type: 'emoji', emoji: '🍕' }`
- Conserva todos los datos existentes

## Requisitos Previos

Debes tener las siguientes variables de entorno configuradas:
```
NEXT_PUBLIC_SANITY_PROJECT_ID=tu_project_id
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=tu_token_con_permisos_editor
```

## Cómo ejecutar

### Opción 1: Script JavaScript directo (Más simple)
```bash
# Desde la raíz del proyecto
node sanity/migrations/migrateIcons.js
```

O si está en un archivo .env, asegúrate de cargar las variables:
```bash
# En Windows PowerShell (desde raíz del proyecto)
$env:NEXT_PUBLIC_SANITY_PROJECT_ID = "tu_id"
$env:NEXT_PUBLIC_SANITY_DATASET = "production"
$env:SANITY_API_TOKEN = "tu_token"
node sanity/migrations/migrateIcons.js
```

### Opción 2: Con la CLI de Sanity
```bash
cd sanity
sanity exec migrations/migrateIconToObject.ts --with-user-token
```

### Opción 3: Añadir script npm (Recomendado para futuros usos)
Añade esto a `package.json` en la raíz del proyecto:
```json
{
  "scripts": {
    "sanity:migrate:icons": "node sanity/migrations/migrateIcons.js"
  }
}
```

Luego ejecuta:
```bash
npm run sanity:migrate:icons
```

## Reversión
Si necesitas revertir los cambios, ejecuta manualmente en Sanity Studio o usa GROQ:
```groq
*[_type == "storeCategory" && icon.type == "emoji"] {
  _id,
  title,
  icon
}
```

Y restaura los valores manualmente si es necesario.

