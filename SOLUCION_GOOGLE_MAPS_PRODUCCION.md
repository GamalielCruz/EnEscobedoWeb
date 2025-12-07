# 🔧 Solución: Google Maps en Producción

## 🚨 Problema Actual
Tu sitio `https://www.pixelaplastico.com` muestra estos errores:
```
Google Maps JavaScript API error: InvalidKeyMapError
Google Maps JavaScript API warning: InvalidKey
```

## 🔑 Solución Paso a Paso

### **1. Configurar Google Maps API Key para Producción**

#### Opción A: Actualizar API Key Existente
1. **Ve a Google Cloud Console:**
   ```
   https://console.cloud.google.com/apis/credentials
   ```

2. **Encuentra tu API Key de Google Maps**

3. **Editar Restricciones:**
   - Clic en tu API Key
   - Sección "Restricciones de aplicación"
   - Selecciona "Restricciones de referente HTTP (sitios web)"
   - Agrega estos referentes:
   ```
   https://www.pixelaplastico.com/*
   https://pixelaplastico.com/*
   http://localhost:3000/*
   ```

4. **Verificar APIs Habilitadas:**
   - Maps JavaScript API ✅
   - Places API ✅
   - Geocoding API ✅

#### Opción B: Crear Nueva API Key (Recomendado)
1. **Crear nueva API Key:**
   - Google Cloud Console → Credenciales → Crear credenciales → Clave de API

2. **Configurar Restricciones:**
   - Restricciones de aplicación: "Referentes HTTP (sitios web)"
   - Referentes:
   ```
   https://www.pixelaplastico.com/*
   https://pixelaplastico.com/*
   ```

3. **Restricciones de API:**
   - Maps JavaScript API
   - Places API  
   - Geocoding API

### **2. Actualizar Variables de Entorno en Producción**

En tu plataforma de despliegue (Vercel/Netlify), actualiza:

```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=tu_nueva_api_key_aqui
NEXT_PUBLIC_BASE_URL=https://www.pixelaplastico.com
NEXT_PUBLIC_SITE_URL=https://www.pixelaplastico.com
```

### **3. Verificar Configuración**

Ejecuta este comando para verificar:
```bash
node scripts/check-production-env.js
```

### **4. Redesplegar**

Después de actualizar las variables:
1. Redesplegar la aplicación
2. Verificar que no aparezcan los errores
3. Probar la funcionalidad de mapas

## 🔧 Soluciones Adicionales

### **A. Optimización de Carga de Google Maps**
Ya implementé la mejora en `hooks/useGoogleMaps.ts`:
```typescript
script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}${librariesParam}&loading=async`;
```

### **B. Componente de Fallback**
Creé `components/GoogleMapsFallback.tsx` para manejar errores de carga.

### **C. Verificación de Variables**
Script `scripts/check-production-env.js` para verificar configuración.

## 🚀 Pasos Inmediatos

### **1. Configurar API Key (5 minutos)**
```bash
# 1. Ve a Google Cloud Console
# 2. Edita tu API Key
# 3. Agrega www.pixelaplastico.com a restricciones
```

### **2. Actualizar Variables de Entorno (2 minutos)**
En tu panel de Vercel/Netlify:
```
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=nueva_api_key
```

### **3. Redesplegar (3 minutos)**
```bash
# En Vercel: automático al cambiar variables
# En Netlify: trigger new deploy
```

## 🧪 Probar la Solución

1. **Ve a:** https://www.pixelaplastico.com/select-store
2. **Abre DevTools** (F12)
3. **Verifica que NO aparezcan errores** de Google Maps
4. **Prueba la funcionalidad:**
   - Geolocalización
   - Búsqueda de direcciones
   - Selección de tiendas

## 📞 Si Persisten los Problemas

### **Verificar en Google Cloud Console:**
1. **Cuota de API:** Verifica que no hayas excedido los límites
2. **Facturación:** Asegúrate de que esté habilitada
3. **APIs Habilitadas:** Confirma que todas las APIs necesarias estén activas

### **Verificar en tu Plataforma:**
1. **Variables de Entorno:** Confirma que estén configuradas correctamente
2. **Build Logs:** Revisa si hay errores durante el build
3. **Runtime Logs:** Verifica errores en tiempo de ejecución

## ✅ Resultado Esperado

Después de aplicar estas soluciones:
- ✅ Sin errores de Google Maps en consola
- ✅ Mapas cargando correctamente
- ✅ Funcionalidad de geolocalización trabajando
- ✅ Búsqueda de tiendas operativa
- ✅ Mejor rendimiento de carga

**¡Tu sistema Click & Collect funcionará perfectamente en producción!** 🎯