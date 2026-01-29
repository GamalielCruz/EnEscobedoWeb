# Solución: Configuración de Tipos de Servicio para Restaurantes

## Resumen
Se implementó un sistema completo que permite a los restaurantes configurar si ofrecen entrega a domicilio, recogida en tienda, o ambos servicios. Esta configuración se refleja automáticamente en la página del carrito (`http://localhost:3000/basket`).

## Cambios Implementados

### 1. Schema de Sanity Actualizado
**Archivo:** `sanity/schemaTypes/affiliateStoreType.ts`

Se agregó el campo `serviceTypes` con las siguientes opciones:
- **delivery**: Boolean - Si ofrece entrega a domicilio
- **pickup**: Boolean - Si permite recogida en tienda  
- **deliveryRadius**: Número - Radio de entrega en km (solo si delivery está habilitado)
- **minimumOrderDelivery**: Número - Pedido mínimo para entrega (solo si delivery está habilitado)

```typescript
defineField({
  name: "serviceTypes",
  title: "Tipos de Servicio Disponibles",
  type: "object",
  fields: [
    // Campos de configuración...
  ],
  validation: (Rule) => Rule.custom((serviceTypes) => {
    if (!serviceTypes?.delivery && !serviceTypes?.pickup) {
      return 'Debe habilitar al menos un tipo de servicio (entrega o recoger)';
    }
    return true;
  }),
})
```

### 2. Tipos TypeScript Actualizados
**Archivo:** `lib/clickCollect.ts`

Se actualizó la interfaz `AffiliateStore` para incluir:
```typescript
serviceTypes?: {
  delivery: boolean;
  pickup: boolean;
  deliveryRadius?: number;
  minimumOrderDelivery?: number;
};
```

### 3. Nueva API para Tipos de Servicio
**Archivo:** `app/api/store-service-types/route.ts`

API endpoint que devuelve la configuración de servicios de una tienda específica:
- **GET** `/api/store-service-types?storeId={id}`
- Incluye fallback a configuraciones mock para pruebas
- Manejo de errores robusto

### 4. Componente ServiceTypeSelector
**Archivo:** `components/ServiceTypeSelector.tsx`

Nuevo componente que:
- Consulta automáticamente los tipos de servicio disponibles para una tienda
- Muestra solo las opciones habilitadas (delivery/pickup)
- Incluye información específica como radio de entrega y pedido mínimo
- Maneja estados de carga y error
- Proporciona feedback visual claro al usuario

### 5. Integración en StepByStepCheckout
**Archivo:** `components/StepByStepCheckout.tsx`

Se reemplazó la selección manual de servicios con el nuevo `ServiceTypeSelector`:
- Carga automática de configuraciones por tienda
- Respeta las limitaciones configuradas en Sanity
- Experiencia de usuario mejorada

### 6. API nearest-store Actualizada
**Archivo:** `app/api/nearest-store/route.ts`

Se incluyó el campo `serviceTypes` en las consultas y datos mock:
- Query actualizada para incluir `serviceTypes`
- Datos mock con diferentes configuraciones para pruebas

## Configuraciones de Prueba

### Tiendas Mock Configuradas:
1. **mock-pe-centro**: Delivery + Pickup (radio 15km, mínimo $150)
2. **mock-pe-plaza**: Delivery + Pickup (radio 12km, mínimo $100)  
3. **mock-pe-barrio**: Solo Pickup (sin delivery)

## Cómo Funciona

### Para Administradores (Sanity Studio):
1. Acceder al documento de una tienda afiliada
2. Configurar el campo "Tipos de Servicio Disponibles"
3. Habilitar/deshabilitar delivery y pickup según necesidades
4. Configurar radio de entrega y pedido mínimo si aplica

### Para Usuarios (Frontend):
1. Al acceder al carrito, el sistema detecta la tienda del producto
2. Consulta automáticamente los servicios disponibles
3. Muestra solo las opciones habilitadas para esa tienda
4. Proporciona información específica (costos, radios, etc.)

## Validaciones Implementadas

### En Sanity:
- Al menos un tipo de servicio debe estar habilitado
- Campos condicionales (radio y mínimo solo si delivery está habilitado)

### En Frontend:
- Manejo de errores de API
- Fallbacks a configuraciones por defecto
- Estados de carga y error informativos

## Archivos de Soporte

### Scripts Utilitarios:
- `scripts/update-mock-service-types.js`: Actualiza datos mock con serviceTypes
- `scripts/add-service-types-to-stores.ts`: Migra tiendas existentes en Sanity

## Pruebas Realizadas

✅ API `/api/store-service-types` funciona correctamente  
✅ Diferentes configuraciones de tienda (delivery only, pickup only, ambos)  
✅ Manejo de errores y fallbacks  
✅ Integración con componente de checkout  
✅ Servidor de desarrollo funcionando sin errores  

## Próximos Pasos Recomendados

1. **Ejecutar script de migración** para tiendas existentes en Sanity:
   ```bash
   npx ts-node scripts/add-service-types-to-stores.ts
   ```

2. **Configurar tiendas reales** en Sanity Studio con sus tipos de servicio específicos

3. **Probar flujo completo** desde selección de servicio hasta checkout

4. **Considerar validaciones adicionales** como verificación de radio de entrega en tiempo real

## Resultado Final

Los restaurantes ahora pueden configurar fácilmente sus tipos de servicio en Sanity, y esta configuración se refleja automáticamente en la experiencia del usuario en `http://localhost:3000/basket`, proporcionando una experiencia personalizada y precisa según las capacidades de cada establecimiento.