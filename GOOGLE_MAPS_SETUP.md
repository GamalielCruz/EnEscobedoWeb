# 🗺️ Configuración de Google Maps API

## ❌ **PROBLEMA ACTUAL**

El error `REQUEST_DENIED` indica que la API key de Google Maps no está configurada correctamente.

## 🔧 **SOLUCIÓN PASO A PASO**

### 1. **Verificar Google Cloud Console**

Ve a [Google Cloud Console](https://console.cloud.google.com/):

1. **Selecciona tu proyecto** o crea uno nuevo
2. **Habilita las APIs necesarias:**
   - Ve a "APIs y servicios" > "Biblioteca"
   - Busca y habilita: **"Geocoding API"**
   - Opcionalmente: **"Maps JavaScript API"**

### 2. **Crear/Verificar API Key**

1. Ve a "APIs y servicios" > "Credenciales"
2. Haz clic en "Crear credenciales" > "Clave de API"
3. **Copia la nueva API key**

### 3. **Configurar Restricciones (Recomendado)**

Para mayor seguridad:

1. **Restricciones de aplicación:**
   - Selecciona "Direcciones IP (servidores web)"
   - Agrega tu IP del servidor

2. **Restricciones de API:**
   - Selecciona "Restringir clave"
   - Marca solo: "Geocoding API"

### 4. **Actualizar .env.local**

```env
# Reemplaza con tu API key real
GOOGLE_MAPS_API_KEY=AIzaSy...tu_api_key_real_aqui
```

### 5. **Reiniciar el servidor**

```bash
# Detener el servidor (Ctrl+C)
# Reiniciar
npm run dev
```

## 🔄 **MIENTRAS TANTO: SISTEMA FUNCIONA CON OPENSTREETMAP**

El sistema está configurado para usar **OpenStreetMap como fallback automático**, así que:

✅ **Funciona perfectamente** sin Google Maps  
✅ **Geocodificación gratuita** y confiable  
✅ **Todas las funciones** operativas  

## 🧪 **PROBAR EL SISTEMA AHORA**

Puedes probar inmediatamente con estas direcciones de Pedro Escobedo:

```
Calle Hidalgo 10, Pedro Escobedo, Querétaro
Av. Constitución 30, Pedro Escobedo, Querétaro  
Calle Morelos 50, Pedro Escobedo, Querétaro
```

## ⚡ **CAMBIAR A GOOGLE MAPS DESPUÉS**

Una vez configurada correctamente la API key:

1. **Actualiza el componente** en `components/ClickCollectSelector.tsx`:
```typescript
useGoogleMaps: true, // Cambiar a true
```

2. **Reinicia el servidor**

## 📊 **COMPARACIÓN**

| Servicio | Costo | Precisión | Límites |
|----------|-------|-----------|---------|
| **OpenStreetMap** | Gratuito | Muy buena | Sin límites estrictos |
| **Google Maps** | $5 por 1000 consultas | Excelente | 40,000 gratis/mes |

## ✅ **RECOMENDACIÓN**

Para desarrollo y pruebas: **Usar OpenStreetMap** (actual)  
Para producción con alto volumen: **Configurar Google Maps**

El sistema funciona perfectamente con ambos servicios! 🎉