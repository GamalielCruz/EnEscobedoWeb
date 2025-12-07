# 🔧 Fixes para Producción

## 1. 🔑 Google Maps API Key

### Problema:
```
Google Maps JavaScript API error: InvalidKeyMapError
Google Maps JavaScript API warning: InvalidKey
```

### Solución:

#### Opción A: Actualizar restricciones de API Key existente
1. Ve a: https://console.cloud.google.com/apis/credentials
2. Encuentra tu API Key de Google Maps
3. Edita → Restricciones de aplicación → Restricciones de referente HTTP
4. Agrega:
   ```
   https://www.pixelaplastico.com/*
   https://pixelaplastico.com/*
   http://localhost:3000/*
   ```

#### Opción B: Crear nueva API Key para producción
1. En Google Cloud Console → Credenciales → Crear credenciales → Clave de API
2. Restringir la clave:
   - Restricciones de aplicación: Referentes HTTP (sitios web)
   - Referentes de sitios web:
     ```
     https://www.pixelaplastico.com/*
     https://pixelaplastico.com/*
     ```
3. Restricciones de API:
   - Maps JavaScript API
   - Places API
   - Geocoding API

#### Configurar en producción:
En tu plataforma de despliegue, actualiza:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu_nueva_api_key_de_produccion
```

## 2. 🚀 Google Maps Loading Optimization

### Problema:
```
Google Maps JavaScript API has been loaded directly without loading=async
```

### Solución:
Actualizar el hook useGoogleMaps para cargar de forma asíncrona.

## 3. 🔤 Font Preloading Warning

### Problema:
```
El recurso precargado con precarga de enlace no se usó en unos pocos segundos
```

### Solución:
Optimizar la carga de fuentes en Next.js.

## 4. 🌐 Variables de Entorno de Producción

Asegúrate de tener configuradas:
```
NEXT_PUBLIC_BASE_URL=https://www.pixelaplastico.com
NEXT_PUBLIC_SITE_URL=https://www.pixelaplastico.com
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu_api_key_de_produccion
```