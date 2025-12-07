# 🔧 Solución: Error "can't access property 'phone', store.contact is null"

## 🚨 Error Específico
```
TypeError: can't access property "phone", store.contact is null
Error buscando tiendas cercanas
```

## 🔍 Causa del Problema
El error ocurre cuando las tiendas obtenidas de la base de datos (Sanity) tienen el campo `contact` como `null`, pero el código intenta acceder a `store.contact.phone` sin verificar si `contact` existe.

## ✅ Soluciones Implementadas

### 1. **Acceso Seguro con Optional Chaining**
```typescript
// ANTES (causaba error):
phone: store.contact.phone,

// DESPUÉS (seguro):
phone: store.contact?.phone || "Teléfono no disponible",
```

### 2. **Validación Completa en el Mapeo**
```typescript
const storesWithDistance: Store[] = data.data.stores.map((store: any) => ({
  _id: store._id || 'unknown',
  name: store.name || 'Tienda sin nombre',
  address: {
    street: store.address?.street || 'Dirección no disponible',
    city: store.address?.city || 'Ciudad no disponible',
    state: store.address?.state || 'Estado no disponible',
    postalCode: store.address?.postalCode || '00000',
  },
  coordinates: {
    latitude: store.coordinates?.latitude || 0,
    longitude: store.coordinates?.longitude || 0,
  },
  contact: {
    phone: store.contact?.phone || "Teléfono no disponible",
  },
  operatingHours: store.operatingHours || {},
  // ...
}));
```

### 3. **Validación en la API**
```typescript
// En app/api/nearest-store/route.ts
stores = stores.map(store => ({
  ...store,
  contact: store.contact || { 
    phone: 'Teléfono no disponible', 
    email: '', 
    manager: '' 
  },
  address: store.address || { 
    street: '', 
    city: '', 
    state: '', 
    postalCode: '', 
    country: 'México' 
  },
  coordinates: store.coordinates || { 
    latitude: 0, 
    longitude: 0 
  },
  operatingHours: store.operatingHours || {},
  averageDeliveryTime: store.averageDeliveryTime || 1
}));
```

### 4. **Corrección en Todos los Lugares**
Se corrigieron todos los accesos a `contact.phone` en:
- Mapeo de tiendas
- Info windows del mapa
- Función `selectStore`
- Lista de tiendas en la UI

## 🧪 Cómo Verificar la Solución

### **Paso 1: Ejecutar el Script de Prueba**
```bash
node test-api-stores.js
```

Este script verificará:
- ✅ Estructura de datos de cada tienda
- ✅ Campos críticos presentes
- ✅ Cálculo de distancias
- ❌ Problemas encontrados

### **Paso 2: Probar en la Aplicación**
1. Abrir DevTools (F12) → Console
2. Ir a la página de selección de tienda
3. Probar cualquier método de ubicación
4. Verificar que no aparezcan errores en la consola

### **Paso 3: Verificar Datos en Sanity**
Si usas Sanity CMS, verificar que las tiendas tengan:
```json
{
  "_id": "store-id",
  "name": "Nombre de la tienda",
  "contact": {
    "phone": "+52 442 123 4567",
    "email": "tienda@email.com",
    "manager": "Nombre del gerente"
  },
  "address": {
    "street": "Calle Principal 123",
    "city": "Ciudad",
    "state": "Estado",
    "postalCode": "12345",
    "country": "México"
  },
  "coordinates": {
    "latitude": 20.5089,
    "longitude": -100.1456
  }
}
```

## 🛡️ Prevención de Errores Futuros

### **1. Validación de Tipos**
```typescript
interface StoreContact {
  phone: string;
  email?: string;
  manager?: string;
}

interface StoreAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}
```

### **2. Función de Validación**
```typescript
function validateStore(store: any): boolean {
  return !!(
    store._id &&
    store.name &&
    store.contact?.phone &&
    store.address?.street &&
    store.coordinates?.latitude &&
    store.coordinates?.longitude
  );
}
```

### **3. Filtrar Tiendas Inválidas**
```typescript
const validStores = stores.filter(validateStore);
console.log(`Tiendas válidas: ${validStores.length}/${stores.length}`);
```

## 📋 Checklist de Verificación

- [ ] ✅ No hay errores en la consola al buscar tiendas
- [ ] ✅ Se muestran teléfonos (o "Teléfono no disponible")
- [ ] ✅ Se muestran direcciones completas
- [ ] ✅ Los marcadores aparecen en el mapa
- [ ] ✅ Se pueden seleccionar tiendas
- [ ] ✅ Se muestran rutas correctamente

## 🎯 Resultado

El error **"can't access property 'phone', store.contact is null"** está completamente solucionado. Ahora el sistema:

- ✅ **Maneja datos faltantes** con valores por defecto
- ✅ **Usa optional chaining** para acceso seguro
- ✅ **Valida datos** en la API
- ✅ **Muestra información** incluso con datos incompletos
- ✅ **No se rompe** con tiendas mal configuradas

La aplicación es ahora **robusta y tolerante a fallos** en los datos.