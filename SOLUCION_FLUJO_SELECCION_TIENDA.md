# Solución: Flujo de Selección de Tienda No Continúa

## Problema Identificado

**Síntoma:** Después de seleccionar una tienda en el paso 2 (Ubicación), el flujo no avanza automáticamente al paso 3 (Método de Pago).

**Causa Raíz:** El callback `onStoreSelected` no estaba actualizando correctamente el estado del componente para avanzar al siguiente paso.

## Análisis del Problema

### Flujo Esperado:
1. Usuario selecciona tipo de servicio → Paso 1 ✅
2. Usuario selecciona tienda → Paso 2 ✅  
3. **Automáticamente avanza** → Paso 3 ❌ (No funcionaba)

### Problema Técnico:
- El `onStoreSelected` guardaba datos en localStorage ✅
- Disparaba evento `storeSelected` ✅
- **Pero no actualizaba el estado del componente** ❌

## Solución Implementada

### 1. **Actualización Directa del Estado**

**Antes:**
```typescript
onStoreSelected={(storeData: StoreData) => {
  const payload = { /* ... */ };
  localStorage.setItem('clickCollectStore', JSON.stringify(payload));
  window.dispatchEvent(new Event('storeSelected')); // Solo evento
}}
```

**Después:**
```typescript
onStoreSelected={(storeData: StoreData) => {
  const payload: SavedStoreInfo = { /* ... */ };
  
  // Actualizar estado directamente
  setShippingCost(0);
  setSavedStoreInfo(payload);
  localStorage.setItem('clickCollectStore', JSON.stringify(payload));
  
  // Marcar pasos como completados y avanzar
  setCompletedSteps(prev => [...new Set([...prev, 1, 2])]);
  setCurrentStep(3);
  
  // También disparar evento para compatibilidad
  window.dispatchEvent(new Event('storeSelected'));
}}
```

### 2. **Logging Mejorado para Debugging**

```typescript
console.log('🏪 Tienda seleccionada:', storeData);
console.log('💾 Guardando payload:', payload);
console.log('✅ Avanzando al paso 3 (Método de Pago)');
```

### 3. **Manejo Robusto del Evento**

```typescript
const handleStoreSelected = () => {
  console.log('🎯 Evento storeSelected recibido');
  const saved = localStorage.getItem('clickCollectStore');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      console.log('📦 Datos recuperados del localStorage:', parsed);
      
      setSavedStoreInfo(parsed);
      setShippingCost(parsed.shippingCost ?? null);
      setCompletedSteps(prev => [...new Set([...prev, 1, 2])]);
      setCurrentStep(3);
      
      console.log('✅ Avanzando al paso 3 (Método de Pago)');
    } catch (error) {
      console.error('❌ Error parsing saved store data:', error);
    }
  } else {
    console.warn('⚠️ No hay datos guardados en localStorage');
  }
};
```

### 4. **Corrección de Tipos TypeScript**

```typescript
const payload: SavedStoreInfo = {
  deliveryMethod: 'pickup' as const,
  // ... otros campos
  customerAddress: customerAddress as LocationData || undefined,
  timestamp: Date.now()
};
```

## Flujo Corregido

### Paso a Paso:
1. **Usuario selecciona tienda** en LocationBasedStoreSelector
2. **Se ejecuta onStoreSelected** con datos de la tienda
3. **Se actualiza estado inmediatamente:**
   - `setSavedStoreInfo(payload)`
   - `setShippingCost(0)`
   - `setCompletedSteps([1, 2])`
   - `setCurrentStep(3)`
4. **Se guarda en localStorage** para persistencia
5. **Se dispara evento** para compatibilidad con otros listeners
6. **UI se actualiza** mostrando paso 3 (Método de Pago)

## Herramientas de Debugging

### Script de Prueba: `test-store-selection-flow.js`

**Funciones disponibles en consola del navegador:**

```javascript
// Simular selección de tienda
testStoreSelection();

// Limpiar estado y reiniciar
resetCheckoutFlow();

// Verificar estado actual
checkCurrentState();
```

**Uso:**
1. Abrir `http://localhost:3000/basket`
2. Abrir DevTools → Console
3. Ejecutar: `testStoreSelection()`
4. Verificar que avanza al paso 3

## Beneficios de la Solución

### ✅ **Flujo Inmediato**
- No depende solo de eventos asíncronos
- Actualización directa del estado
- Respuesta instantánea al usuario

### ✅ **Robustez**
- Doble mecanismo: directo + evento
- Manejo de errores mejorado
- Logging detallado para debugging

### ✅ **Compatibilidad**
- Mantiene evento `storeSelected` para otros listeners
- Preserva localStorage para persistencia
- No rompe funcionalidad existente

### ✅ **Debugging**
- Logs claros en cada paso
- Script de prueba incluido
- Fácil identificación de problemas

## Archivos Modificados

### Principales:
- `components/StepByStepCheckout.tsx` - Lógica principal corregida

### Herramientas:
- `test-store-selection-flow.js` - Script de prueba

## Resultado

El flujo ahora funciona correctamente:

1. ✅ Selección de tipo de servicio → Avanza a paso 2
2. ✅ Selección de tienda → **Avanza automáticamente a paso 3**
3. ✅ Selección de método de pago → Completa checkout

La experiencia de usuario es fluida y sin interrupciones, eliminando la confusión de quedarse "atascado" en la selección de tienda.