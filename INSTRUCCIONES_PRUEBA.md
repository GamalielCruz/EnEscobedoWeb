# 🧪 Instrucciones para Probar la Solución

## 🎯 Problema Solucionado
- ✅ **API corregida**: Ahora valida y limpia los datos antes de devolverlos
- ✅ **Endpoint GET**: Aplica la misma validación que el POST
- ✅ **Campo contact**: Ya no es `null`, tiene valores por defecto

## 🔍 Cómo Probar

### **Paso 1: Verificar la API**
La API ya está funcionando correctamente (verificado con el script):
```bash
node test-api-stores.js
```
✅ Resultado: `"phone": "Teléfono no disponible"` (ya no es null)

### **Paso 2: Probar en la Aplicación**

1. **Abrir DevTools**:
   - Presiona `F12`
   - Ve a la pestaña **Console**

2. **Ir a la página**:
   ```
   http://localhost:3000/select-store
   ```

3. **Probar el botón temporal**:
   - Haz clic en "Ingresar Dirección Manualmente"
   - Haz clic en "🧪 Probar Búsqueda (Temporal)"
   - **Observa los logs en la consola**

### **Paso 3: Logs Esperados**
Deberías ver en la consola:
```
🧪 Probando handlePlaceSelected...
🏠 Dirección seleccionada manualmente: {...}
📍 Coordenadas del usuario (manual): {lat: 20.5089, lng: -100.1456}
🔍 Buscando tiendas cercanas para coordenadas: {lat: 20.5089, lng: -100.1456}
📡 Llamando a API para obtener tiendas...
📦 Respuesta de la API: {...}
📊 Procesando 1 tiendas...
🏪 Procesando tienda 1: {name: "Miscelanea Erika", contact: {...}, hasPhone: true}
✅ Tiendas procesadas exitosamente: 1
```

### **Paso 4: Resultado Visual**
Después del botón de prueba deberías ver:
- ✅ **Marcador azul** en el mapa (tu ubicación)
- ✅ **Marcador rojo** en el mapa (tienda)
- ✅ **Lista de tiendas** debajo del mapa
- ✅ **Información de la tienda** con teléfono
- ✅ **Tienda seleccionada automáticamente** (fondo verde)

## 🔧 Si Aún No Funciona

### **Verificar Errores en Consola**
Si ves errores, busca:
- ❌ `TypeError: can't access property...` → Aún hay un campo null
- ❌ `Error buscando tiendas cercanas` → Problema en el mapeo
- ❌ `Google Maps no está disponible` → Problema de carga de Google Maps

### **Verificar Datos**
Si no aparecen tiendas:
- Verifica que `data.success` sea `true`
- Verifica que `data.data.stores` tenga elementos
- Verifica que las coordenadas no sean `0, 0`

### **Probar Google Places**
Si el botón temporal funciona pero Google Places no:
- Haz clic en "Usar entrada simple (sin autocompletado)"
- Escribe una dirección y presiona el botón
- Esto usa OpenStreetMap en lugar de Google Places

## 🎉 Resultado Esperado

Después de la corrección, **todas estas opciones deberían funcionar**:

1. ✅ **Geolocalización automática**
2. ✅ **Google Places Autocomplete**
3. ✅ **Entrada simple** (fallback)
4. ✅ **Botón de prueba temporal**

**Todas muestran las tiendas cercanas en el mapa con información completa.**

## 📞 Datos de Contacto Mostrados

- **Si la tienda tiene teléfono**: Muestra el número real
- **Si la tienda no tiene teléfono**: Muestra "Teléfono no disponible"
- **Nunca falla** por campos null o undefined

La aplicación es ahora **robusta y tolerante a fallos**. 🎯