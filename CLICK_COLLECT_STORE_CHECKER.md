# Sistema de Verificación de Tiendas Click & Collect

Este documento describe los nuevos componentes creados para permitir a los usuarios verificar rápidamente si hay tiendas cercanas disponibles para el servicio Click & Collect antes de añadir productos al carrito.

## Componentes Creados

### 1. QuickStoreChecker (`components/QuickStoreChecker.tsx`)
Componente principal para verificar la disponibilidad de tiendas cercanas.

**Características:**
- Búsqueda por dirección
- Muestra información detallada de la tienda encontrada
- Información sobre distancia y tiempo de entrega
- Manejo de estados de carga y errores
- Guarda automáticamente la tienda encontrada en localStorage

**Props:**
```typescript
interface QuickStoreCheckerProps {
  onStoreFound?: (store: StoreInfo) => void;
  className?: string;
}
```

**Uso:**
```tsx
import QuickStoreChecker from "@/components/QuickStoreChecker";

<QuickStoreChecker 
  onStoreFound={(store) => {
    console.log("Tienda encontrada:", store);
  }}
/>
```

### 2. ClickCollectBanner (`components/ClickCollectBanner.tsx`)
Banner promocional para mostrar información sobre Click & Collect.

**Características:**
- Versión compacta y expandida
- Información sobre beneficios del servicio
- Enlace directo a la página de verificación
- Diseño responsive

**Props:**
```typescript
interface ClickCollectBannerProps {
  className?: string;
  compact?: boolean;
}
```

**Uso:**
```tsx
import ClickCollectBanner from "@/components/ClickCollectBanner";

// Versión compacta
<ClickCollectBanner compact={true} />

// Versión completa
<ClickCollectBanner />
```

### 3. ClickCollectAvailability (`components/ClickCollectAvailability.tsx`)
Indicador de disponibilidad para mostrar en páginas de productos.

**Características:**
- Muestra si hay una tienda guardada en localStorage
- Información resumida de la tienda disponible
- Enlace para verificar disponibilidad si no hay tienda guardada
- Diseño compacto para integrar en productos

**Props:**
```typescript
interface ClickCollectAvailabilityProps {
  className?: string;
  showFullInfo?: boolean;
}
```

**Uso:**
```tsx
import ClickCollectAvailability from "@/components/ClickCollectAvailability";

// En página de producto
<ClickCollectAvailability showFullInfo={true} />

// Versión simple
<ClickCollectAvailability />
```

### 4. Hook useStoreSearch (`hooks/useStoreSearch.ts`)
Hook personalizado para manejar la lógica de búsqueda de tiendas.

**Características:**
- Búsqueda de tiendas cercanas
- Manejo de estados de carga y errores
- Funciones para guardar/recuperar de localStorage
- Reutilizable en múltiples componentes

**Funciones disponibles:**
```typescript
const {
  isSearching,           // Estado de carga
  searchResult,          // Resultado de la búsqueda
  searchNearestStore,    // Función para buscar tiendas
  clearResult,           // Limpiar resultado
  saveStoreToLocalStorage, // Guardar tienda
  getStoredStore         // Obtener tienda guardada
} = useStoreSearch();
```

**Uso:**
```tsx
import { useStoreSearch } from "@/hooks/useStoreSearch";

const { searchNearestStore, isSearching, searchResult } = useStoreSearch();

const handleSearch = async () => {
  const result = await searchNearestStore("Calle Hidalgo 20");
  if (result.success) {
    console.log("Tienda encontrada:", result.store);
  }
};
```

## Página de Verificación

### CheckStoresPage (`app/(store)/check-stores/page.tsx`)
Página dedicada para verificar la disponibilidad de tiendas.

**Características:**
- Interfaz completa para búsqueda de tiendas
- Información sobre beneficios del Click & Collect
- Navegación de regreso a la tienda
- Call-to-action para comenzar a comprar

**URL:** `/check-stores`

## Integración en la Aplicación

### 1. Página Principal
El banner compacto se ha integrado en la página principal:

```tsx
// En app/(store)/page.tsx
{currentPage === 1 && (
  <div className="max-w-6xl mx-auto px-4 py-4">
    <ClickCollectBanner compact={true} />
  </div>
)}
```

### 2. Páginas de Productos
Se puede integrar el indicador de disponibilidad:

```tsx
// En páginas de productos
<ClickCollectAvailability showFullInfo={true} />
```

### 3. Header o Navigation
Se puede añadir un enlace directo:

```tsx
<Link href="/check-stores" className="text-blue-600 hover:text-blue-800">
  Verificar Tiendas
</Link>
```

## Flujo de Usuario

1. **Verificación Inicial:** El usuario ve el banner en la página principal
2. **Búsqueda:** Hace clic para ir a `/check-stores` y busca su dirección
3. **Resultado:** Ve si hay tiendas disponibles y la información detallada
4. **Compra:** Si hay tienda disponible, puede proceder a añadir productos al carrito
5. **Checkout:** En el checkout de Click & Collect, la tienda ya está preseleccionada

## Datos Guardados en localStorage

### `nearestStore`
```json
{
  "storeId": "store-1",
  "name": "Tienda Principal",
  "address": "Calle Hidalgo 20, Pedro Escobedo",
  "phone": "+52 442 123 4567",
  "distanceKm": 2.5,
  "estimatedDelivery": "1-2 días hábiles"
}
```

### `clickCollectStore`
```json
{
  "storeId": "store-1",
  "storeName": "Tienda Principal",
  "storeAddress": "Calle Hidalgo 20, Pedro Escobedo",
  "storePhone": "+52 442 123 4567",
  "estimatedDelivery": "1-2 días hábiles"
}
```

## API Utilizada

Los componentes utilizan la API existente:
- `GET /api/nearest-store` - Obtener todas las tiendas disponibles
- `POST /api/nearest-store` - Buscar tienda más cercana por dirección

## Estilos y Diseño

- Utiliza Tailwind CSS para el diseño
- Iconos de Lucide React
- Colores consistentes con el tema de la aplicación
- Diseño responsive para móviles y desktop
- Estados de carga y error bien definidos

## Beneficios para el Usuario

1. **Transparencia:** Saben de antemano si el servicio está disponible
2. **Confianza:** Pueden ver la tienda exacta y la distancia
3. **Conveniencia:** No pierden tiempo añadiendo productos si no hay servicio
4. **Información Clara:** Entienden cómo funciona el Click & Collect

## Próximos Pasos

1. **Integrar en más páginas:** Añadir el indicador en páginas de categorías
2. **Notificaciones:** Alertar cuando cambie la disponibilidad
3. **Geolocalización:** Usar la ubicación del usuario automáticamente
4. **Múltiples tiendas:** Mostrar varias opciones si están disponibles
5. **Horarios:** Mostrar horarios de atención de las tiendas