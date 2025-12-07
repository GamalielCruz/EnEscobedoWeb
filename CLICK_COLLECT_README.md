# Sistema Click & Collect - Implementación Completa

## 🎯 Resumen

Se ha implementado un sistema completo de **Click & Collect con red de tiendas afiliadas** que permite a los clientes:

1. Ingresar su dirección
2. Encontrar automáticamente la tienda más cercana
3. Recibir estimaciones de tiempo de entrega
4. Generar códigos únicos de recogida
5. Gestionar el proceso completo de pedidos

## 📁 Archivos Creados

### Esquemas de Sanity

- `sanity/schemaTypes/affiliateStoreType.ts` - Esquema para tiendas afiliadas
- `sanity/schemaTypes/orderType.ts` - Actualizado con campos Click & Collect
- `sanity/schemaTypes/index.ts` - Actualizado para incluir nuevo esquema

### APIs

- `app/api/nearest-store/route.ts` - Encuentra la tienda más cercana
- `app/api/create-click-collect-order/route.ts` - Crea órdenes Click & Collect

### Utilidades

- `lib/clickCollect.ts` - Funciones de geocodificación y cálculo de distancias

### Componentes React

- `components/ClickCollectSelector.tsx` - Selector de tienda interactivo
- `components/ui/radio-group.tsx` - Componente de radio buttons
- `components/ui/separator.tsx` - Separador visual

### Páginas

- `app/(store)/checkout-click-collect/page.tsx` - Página de checkout completa
- `app/(store)/success-click-collect/page.tsx` - Página de confirmación

### Scripts y Documentación

- `scripts/populate-stores.ts` - Script para poblar tiendas de ejemplo
- `docs/click-collect-guide.md` - Guía completa del sistema

## 🚀 Cómo Probar

### 1. Instalar Dependencias Adicionales (si es necesario)

```bash
npm install @radix-ui/react-radio-group @radix-ui/react-separator
```

### 2. Poblar Base de Datos con Tiendas

```bash
# Instalar tsx globalmente si no lo tienes
npm install -g tsx

# Ejecutar script de población
npx tsx scripts/populate-stores.ts
```

### 3. Regenerar Tipos de Sanity

```bash
npm run typegen
```

### 4. Probar las APIs

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

### 5. Probar la Interfaz

1. Visita: `http://localhost:3000/checkout-click-collect`
2. Selecciona "Click & Collect"
3. Ingresa una dirección de ejemplo:
   - **Calle:** Av. Francisco I. Madero 50
   - **Ciudad:** Ciudad de México
   - **Estado:** CDMX
4. Haz clic en "Encontrar Tienda Más Cercana"
5. Confirma el pedido

## 🏪 Tiendas de Ejemplo Incluidas

El script crea 6 tiendas en diferentes ubicaciones:

- **Ciudad de México (4 tiendas):**
  - Centro Histórico
  - Polanco
  - Roma Norte
  - Coyoacán

- **Guadalajara (1 tienda):**
  - Centro

- **Monterrey (1 tienda):**
  - San Pedro Garza García

## 🔧 Características Técnicas

### Geocodificación

- **Gratuita:** OpenStreetMap/Nominatim (por defecto)
- **Premium:** Google Maps (configurar `GOOGLE_MAPS_API_KEY`)

### Cálculo de Distancias

- Fórmula de Haversine para precisión geográfica
- Resultados en kilómetros con 2 decimales

### Generación de Códigos

- Códigos únicos de 8 caracteres alfanuméricos
- Fáciles de leer y escribir

### Estados de Pedido

- `in_transit` - En camino a la tienda
- `ready_for_pickup` - Listo para recoger
- `picked_up` - Recogido
- `expired` - No recogido a tiempo

## 📱 Flujo de Usuario

1. **Selección de método:** Cliente elige Click & Collect
2. **Ingreso de dirección:** Proporciona su ubicación
3. **Búsqueda automática:** Sistema encuentra tienda más cercana
4. **Confirmación:** Muestra distancia, horarios y tiempo estimado
5. **Checkout:** Procesa el pago (simulado)
6. **Confirmación:** Genera código de recogida único
7. **Notificación:** Email/SMS cuando esté listo (por implementar)

## 🔮 Próximas Mejoras

- [ ] Sistema de notificaciones (Email/WhatsApp)
- [ ] Integración con Google Maps para visualización
- [ ] Dashboard para administradores de tienda
- [ ] Reserva de capacidad en tiempo real
- [ ] Múltiples idiomas
- [ ] Horarios especiales y días festivos

## 🛠️ Variables de Entorno Opcionales

```env
# .env.local
GOOGLE_MAPS_API_KEY=tu_api_key_aqui  # Para geocodificación premium
```

## 📞 Soporte

Para dudas o problemas:

1. Revisa la documentación en `docs/click-collect-guide.md`
2. Verifica que las tiendas estén pobladas correctamente
3. Confirma que los tipos de Sanity estén actualizados

¡El sistema está listo para usar! 🎉
