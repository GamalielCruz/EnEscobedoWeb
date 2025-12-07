# Guía del Sistema Click & Collect

## Descripción General

El sistema Click & Collect permite a los clientes seleccionar una tienda afiliada cercana para recoger sus pedidos, en lugar de recibir envío a domicilio. El sistema automáticamente encuentra la tienda más cercana basándose en la dirección del cliente.

## Características Principales

- ✅ Geocodificación automática de direcciones
- ✅ Cálculo de distancias usando fórmula de Haversine
- ✅ Selección automática de la tienda más cercana
- ✅ Estimación de tiempo de entrega
- ✅ Generación de códigos de recogida únicos
- ✅ Integración con Sanity CMS
- ✅ Soporte para múltiples ciudades
- ✅ API gratuita (OpenStreetMap) y premium (Google Maps)

## Configuración Inicial

### 1. Variables de Entorno (Opcional)

Para usar Google Maps en lugar de OpenStreetMap:

```env
# .env.local
GOOGLE_MAPS_API_KEY=tu_api_key_aqui
```

### 2. Poblar Base de Datos con Tiendas

```bash
# Instalar tsx si no lo tienes
npm install -g tsx

# Ejecutar script de población
npx tsx scripts/populate-stores.ts
```

### 3. Regenerar Tipos de Sanity

```bash
npm run typegen
```

## Uso de las APIs

### 1. Encontrar Tienda Más Cercana

**Endpoint:** `POST /api/nearest-store`

```javascript
const response = await fetch('/api/nearest-store', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    address: {
      street: 'Av. Reforma 123',
      city: 'Ciudad de México',
      state: 'CDMX',
      postalCode: '06600',
      country: 'México'
    },
    useGoogleMaps: false // true para usar Google Maps
  })
});

const data = await response.json();
console.log(data.data.summary);
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "store": {
      "_id": "store-id",
      "name": "Tienda Centro Histórico",
      "distanceKm": 2.5,
      "estimatedDeliveryDate": "2025-10-20T00:00:00.000Z"
    },
    "summary": {
      "storeName": "Tienda Centro Histórico",
      "distance": "2.5 km",
      "estimatedDelivery": "lunes, 20 de octubre de 2025",
      "address": "Av. Francisco I. Madero 17, Ciudad de México, CDMX",
      "phone": "+52 55 1234 5678"
    }
  }
}
```

### 2. Crear Orden Click & Collect

**Endpoint:** `POST /api/create-click-collect-order`

```javascript
const orderResponse = await fetch('/api/create-click-collect-order', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    customerName: 'Juan Pérez',
    email: 'juan@example.com',
    phone: '+52 55 1234 5678',
    clerkUserId: 'user_123',
    customerAddress: {
      street: 'Av. Reforma 123',
      city: 'Ciudad de México',
      state: 'CDMX',
      postalCode: '06600'
    },
    products: [
      {
        productId: 'product_id_1',
        quantity: 2,
        price: 299.99
      }
    ],
    totalPrice: 599.98,
    currency: 'MXN',
    paymentMethod: 'card',
    stripePaymentIntentId: 'pi_123456789',
    deliveryNotes: 'Llamar al llegar'
  })
});
```

## Uso del Componente React

```tsx
import ClickCollectSelector from '@/components/ClickCollectSelector';

function CheckoutPage() {
  const handleStoreSelected = (storeData) => {
    console.log('Tienda seleccionada:', storeData);
    // Guardar información de la tienda para el checkout
  };

  const handleAddressChange = (address) => {
    console.log('Dirección actualizada:', address);
  };

  return (
    <div>
      <h1>Selecciona tu método de entrega</h1>
      <ClickCollectSelector 
        onStoreSelected={handleStoreSelected}
        onAddressChange={handleAddressChange}
      />
    </div>
  );
}
```

## Estructura de Datos

### Tienda Afiliada (affiliateStore)

```typescript
interface AffiliateStore {
  _id: string;
  name: string;
  storeId: string;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  contact: {
    phone: string;
    email?: string;
    manager?: string;
  };
  operatingHours: {
    monday: string;
    tuesday: string;
    // ... otros días
  };
  isActive: boolean;
  capacity: number;
  averageDeliveryTime: number;
}
```

### Orden con Click & Collect

Las órdenes incluyen campos adicionales:
- `deliveryMethod`: "click_collect"
- `pickupStore`: Referencia a la tienda
- `estimatedPickupDate`: Fecha estimada
- `pickupStatus`: Estado de la recogida
- `pickupCode`: Código único de recogida

## Flujo de Trabajo

1. **Cliente ingresa dirección** → Componente `ClickCollectSelector`
2. **Sistema geocodifica dirección** → API de OpenStreetMap/Google Maps
3. **Calcula distancias** → Fórmula de Haversine
4. **Selecciona tienda más cercana** → Algoritmo de distancia mínima
5. **Muestra información de tienda** → Distancia, horarios, tiempo estimado
6. **Cliente confirma** → Procede al checkout
7. **Se crea orden** → Con información de Click & Collect
8. **Se genera código de recogida** → Código único de 8 caracteres
9. **Notificación al cliente** → Email/SMS con detalles

## Estados de Recogida

- `in_transit`: Producto en camino a la tienda
- `ready_for_pickup`: Listo para recoger
- `picked_up`: Recogido por el cliente
- `expired`: No recogido en tiempo límite

## Pruebas

### Direcciones de Ejemplo para Probar

```javascript
// Centro de CDMX
{
  street: "Av. Francisco I. Madero 50",
  city: "Ciudad de México",
  state: "CDMX"
}

// Polanco
{
  street: "Av. Presidente Masaryk 200",
  city: "Ciudad de México", 
  state: "CDMX"
}

// Roma Norte
{
  street: "Av. Álvaro Obregón 100",
  city: "Ciudad de México",
  state: "CDMX"
}
```

### Probar API Directamente

```bash
# Obtener todas las tiendas
curl -X GET http://localhost:3000/api/nearest-store

# Encontrar tienda más cercana
curl -X POST http://localhost:3000/api/nearest-store \
  -H "Content-Type: application/json" \
  -d '{
    "address": {
      "street": "Av. Reforma 123",
      "city": "Ciudad de México",
      "state": "CDMX"
    }
  }'
```

## Consideraciones de Producción

### Rendimiento
- Implementar caché para geocodificación
- Usar índices geoespaciales en la base de datos
- Limitar número de tiendas por consulta

### Seguridad
- Validar y sanitizar direcciones de entrada
- Implementar rate limiting en APIs
- Verificar códigos de recogida

### Escalabilidad
- Considerar usar servicios de geocodificación en lote
- Implementar sistema de notificaciones asíncronas
- Usar CDN para mapas y recursos estáticos

### Monitoreo
- Logs de geocodificación fallida
- Métricas de distancia promedio
- Tiempo de respuesta de APIs

## Próximas Mejoras

- [ ] Integración con Google Maps para visualización
- [ ] Sistema de notificaciones por WhatsApp
- [ ] Reserva de capacidad en tiendas
- [ ] Horarios especiales y días festivos
- [ ] Múltiples idiomas
- [ ] Integración con sistemas de inventario
- [ ] Dashboard para administradores de tienda