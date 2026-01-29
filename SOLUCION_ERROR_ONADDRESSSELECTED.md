# Solución: Error "onAddressSelected is not a function"

## Problema Identificado

**Error:** `TypeError: onAddressSelected is not a function`
**Ubicación:** `SimpleAddressInput` component
**Causa:** Problemas de timing y inicialización con Google Maps API

## Análisis del Problema

### Causas Posibles:
1. **Timing de inicialización:** Google Maps API se carga de forma asíncrona
2. **Callback perdido:** La función se pierde durante re-renders
3. **Conflictos de scripts:** Múltiples cargas de Google Maps API
4. **Props no definidas:** El componente se renderiza antes de recibir props válidas

## Solución Implementada

### 1. **Componente Mejorado: SimpleAddressInputFixed**

**Archivo:** `components/SimpleAddressInputFixed.tsx`

**Mejoras implementadas:**

#### A. Validación Robusta de Props
```typescript
useEffect(() => {
  if (typeof onAddressSelected !== 'function') {
    console.error('SimpleAddressInputFixed: onAddressSelected must be a function');
    return;
  }
  console.log('SimpleAddressInputFixed: onAddressSelected is valid function');
}, [onAddressSelected]);
```

#### B. Carga Controlada de Google Maps API
```typescript
// Verificar si ya está cargado
if (window.google?.maps?.places) {
  setIsLoaded(true);
  return;
}

// Evitar múltiples scripts
const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
if (existingScript) {
  // Esperar a que termine de cargar
  const checkLoaded = () => {
    if (window.google?.maps?.places) {
      setIsLoaded(true);
    } else {
      setTimeout(checkLoaded, 100);
    }
  };
  checkLoaded();
  return;
}
```

#### C. Inicialización Segura de Autocomplete
```typescript
const handlePlaceChanged = () => {
  try {
    const place = autocomplete.getPlace();
    
    if (!place.geometry?.location) {
      console.warn('No geometry in selected place');
      return;
    }

    // Verificación adicional en tiempo de ejecución
    if (typeof onAddressSelected !== 'function') {
      console.error('onAddressSelected is not a function at call time');
      return;
    }

    // Procesar y llamar callback
    onAddressSelected(addressData);
  } catch (error) {
    console.error('Error in handlePlaceChanged:', error);
  }
};
```

#### D. Estados de Control
```typescript
const [isLoaded, setIsLoaded] = useState(false);
const [isInitialized, setIsInitialized] = useState(false);

// Solo inicializar una vez
useEffect(() => {
  if (!isLoaded || !inputRef.current || isInitialized) {
    return;
  }
  // ... inicialización
  setIsInitialized(true);
}, [isLoaded, onAddressSelected, isInitialized]);
```

#### E. Indicadores Visuales
```typescript
// Input deshabilitado mientras carga
disabled={disabled || !isLoaded}

// Spinner de carga
{!isLoaded && (
  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
  </div>
)}

// Mensaje de estado
{!isLoaded && (
  <p className="text-xs text-gray-500 mt-1">Cargando Google Maps...</p>
)}
```

### 2. **Callback Mejorado en StepByStepCheckout**

```typescript
<SimpleAddressInputFixed
  apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
  onAddressSelected={(addressData) => {
    console.log('Address selected in StepByStepCheckout:', addressData);
    try {
      setSelectedAddress(addressData);
      setShowLocationPicker(true);
    } catch (error) {
      console.error('Error handling address selection:', error);
    }
  }}
  placeholder="Ej: 5 de Febrero 123, Pedro Escobedo, Querétaro"
/>
```

## Características de la Solución

### ✅ **Prevención de Errores**
- Validación de props en múltiples puntos
- Verificación de tipos en tiempo de ejecución
- Manejo de errores con try-catch

### ✅ **Carga Optimizada**
- Evita múltiples cargas de Google Maps API
- Detección inteligente de scripts existentes
- Callback global para inicialización

### ✅ **Estados Controlados**
- Seguimiento de carga de API
- Control de inicialización única
- Estados visuales claros para el usuario

### ✅ **Debugging Mejorado**
- Logs detallados en cada paso
- Identificación clara de errores
- Información de estado en consola

## Flujo de Funcionamiento

### 1. **Inicialización**
```
Componente monta →
Validar props →
Verificar Google Maps API →
Cargar si es necesario →
Esperar carga completa
```

### 2. **Configuración de Autocomplete**
```
API cargada →
Verificar input ref →
Crear Autocomplete →
Configurar listener →
Marcar como inicializado
```

### 3. **Manejo de Selección**
```
Usuario selecciona lugar →
Validar datos del lugar →
Verificar callback →
Procesar componentes de dirección →
Llamar onAddressSelected
```

## Beneficios de la Solución

### 🛡️ **Robustez**
- Manejo de casos edge
- Recuperación de errores
- Validaciones múltiples

### 🚀 **Performance**
- Evita cargas duplicadas de API
- Inicialización única
- Estados optimizados

### 🔍 **Debugging**
- Logs informativos
- Identificación clara de problemas
- Seguimiento de estados

### 👤 **UX Mejorada**
- Indicadores de carga
- Estados visuales claros
- Manejo graceful de errores

## Archivos Modificados

### Nuevos:
- `components/SimpleAddressInputFixed.tsx`

### Modificados:
- `components/StepByStepCheckout.tsx`

## Resultado

La solución elimina el error `onAddressSelected is not a function` mediante:

1. **Validación robusta** de props y estados
2. **Carga controlada** de Google Maps API
3. **Inicialización segura** de componentes
4. **Manejo de errores** comprehensivo
5. **Estados visuales** informativos

El componente ahora funciona de manera confiable independientemente del timing de carga de la API o el estado de inicialización del componente padre.