# 🔍 Diagnóstico: Selección de Dirección No Funciona

## 🚨 Problema Reportado
Al seleccionar una dirección de la lista de autocompletado de Google Places, no se ejecuta la búsqueda de tiendas cercanas.

## 🧪 Pasos para Diagnosticar

### 1. **Abrir Herramientas de Desarrollador**
- Presiona `F12` o `Ctrl+Shift+I`
- Ve a la pestaña **Console**

### 2. **Probar la Funcionalidad**
1. Ve a la página de selección de tienda
2. Haz clic en "Ingresar Dirección Manualmente"
3. Observa los logs en la consola:
   - ✅ Debe aparecer: `"Inicializando Google Places Autocomplete..."`
   - ❌ Si no aparece, Google Maps no está cargado

### 3. **Escribir en el Campo de Dirección**
1. Escribe una dirección (ej: "Calle Hidalgo, Pedro Escobedo")
2. Selecciona una opción de la lista desplegable
3. Observa los logs:
   - ✅ `"🎯 Place changed event triggered"`
   - ✅ `"📍 Place object: {...}"`
   - ✅ `"✅ Lugar válido encontrado, procesando..."`
   - ✅ `"🏠 Dirección seleccionada manualmente: {...}"`

### 4. **Usar el Botón de Prueba Temporal**
- Haz clic en el botón "🧪 Probar Búsqueda (Temporal)"
- Debe ejecutar la búsqueda de tiendas inmediatamente
- Si funciona, el problema está en Google Places Autocomplete

## 🔧 Posibles Causas y Soluciones

### **Causa 1: Google Maps No Cargado**
**Síntomas:**
- No aparece el log "Inicializando Google Places Autocomplete..."
- El campo de texto no muestra sugerencias

**Solución:**
```javascript
// Verificar en la consola del navegador:
console.log('Google Maps:', !!(window.google?.maps));
console.log('Google Places:', !!(window.google?.maps?.places));
```

### **Causa 2: API Key de Google Maps**
**Síntomas:**
- Error en consola sobre API key
- Autocompletado no funciona

**Verificar:**
- Archivo `.env.local` tiene `GOOGLE_MAPS_API_KEY`
- API key tiene permisos para Places API

### **Causa 3: Event Listener No Se Ejecuta**
**Síntomas:**
- No aparece el log "🎯 Place changed event triggered"

**Solución:**
- El autocompletado se inicializa después de que el usuario selecciona
- Problema de timing en la inicialización

### **Causa 4: Datos Inválidos del Place**
**Síntomas:**
- Aparece: "❌ No se encontraron detalles para el lugar seleccionado"

**Solución:**
- Google Places devolvió datos incompletos
- Verificar que el lugar tenga coordenadas

## 🛠️ Soluciones Implementadas

### **1. Logging Detallado**
```typescript
console.log('🎯 Place changed event triggered');
console.log('📍 Place object:', place);
console.log('✅ Lugar válido encontrado, procesando...');
```

### **2. Verificación de Google Maps**
```typescript
if (!inputRef.current || !(window as any).google?.maps?.places || autocompleteRef.current) {
  console.log('Google Places no está disponible aún');
  return;
}
```

### **3. Botón de Prueba Temporal**
- Permite probar la función `handlePlaceSelected` directamente
- Bypassa Google Places Autocomplete

### **4. Verificación de Carga**
- Solo muestra el autocompletado cuando Google Maps está completamente cargado
- Evita errores de inicialización

## 📋 Checklist de Verificación

- [ ] Google Maps se carga correctamente
- [ ] Aparece el log de inicialización de Google Places
- [ ] El campo muestra sugerencias al escribir
- [ ] Al seleccionar una dirección aparecen los logs correspondientes
- [ ] El botón de prueba temporal funciona
- [ ] Se muestran las tiendas cercanas después de seleccionar

## 🎯 Próximos Pasos

1. **Ejecutar el diagnóstico** siguiendo los pasos arriba
2. **Reportar los logs** que aparecen en la consola
3. **Probar el botón temporal** para aislar el problema
4. **Verificar la API key** si Google Places no funciona

## 🔄 Si el Problema Persiste

Si después de este diagnóstico el problema continúa, necesitaremos:
1. Los logs exactos de la consola
2. Verificar la configuración de la API key
3. Considerar usar un fallback sin Google Places