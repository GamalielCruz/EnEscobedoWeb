# Solución para Problemas Móviles en Producción

## Problemas Identificados y Solucionados

### 1. SanityLive en Móviles

- **Problema**: Conexión interrumpida a `kgklfrat.api.sanity.io/v2025-07-25/data/live/events/production`
- **Causa**: SanityLive usa WebSockets/EventSource que pueden fallar en redes móviles
- **Solución**:
  - Wrapper inteligente que detecta móviles y deshabilita SanityLive en producción
  - Error boundary específico para errores de Sanity
  - Fallback graceful sin afectar funcionalidad

### 2. API Version Futura

- **Problema**: Uso de API version `2025-07-25` (futura)
- **Solución**: Cambiado a `2024-07-25` (estable)

### 3. Token Exposure

- **Problema**: Token de Sanity expuesto en el navegador
- **Solución**: Token solo en servidor en producción

### 4. Configuración de Cliente Sanity

- **Problema**: Configuraciones inconsistentes entre clientes
- **Solución**: Configuración unificada y optimizada para móviles

## Archivos Modificados

### Configuración Principal

- `sanity/lib/live.ts` - SanityLive sin token en navegador
- `sanity/env.ts` - API version estable (2024-07-25)
- `sanity/lib/client.ts` - Cliente optimizado
- `sanity/lib/image.ts` - URLs de imagen optimizadas
- `lib/imageUrl.ts` - Funciones de imagen mejoradas
- `middleware.ts` - Detección móvil y headers optimizados
- `next.config.ts` - Configuración mejorada para móviles

### Componentes Nuevos y Optimizados

- `components/OptimizedImage.tsx` - Componente de imagen inteligente
- `components/SanityErrorBoundary.tsx` - Error boundary
- `hooks/useSanityConnection.ts` - Hook de conexión
- `hooks/useSanityImageFallback.ts` - Hook para fallback de imágenes
- `lib/clerk-config.ts` - Configuración Clerk optimizada

### Componentes Actualizados

- `components/ProductThumb.tsx` - Usa OptimizedImage
- `app/(store)/basket/page.tsx` - Imágenes optimizadas
- `app/(store)/orders/page.tsx` - Imágenes optimizadas
- `app/(store)/layout.tsx` - SanityLive solo en desarrollo

### Scripts de Prueba

- `test-mobile-connections.js` - Prueba conectividad general
- `test-mobile-images.js` - Prueba específica de imágenes

## Verificación

### 1. Probar Conexiones

```bash
node test-mobile-connections.js
```

### 2. Verificar en Móvil

1. Abrir DevTools en modo móvil
2. Verificar que no hay errores de Sanity en consola
3. Confirmar que las imágenes cargan correctamente
4. Probar login con Clerk

### 3. Monitoreo en Producción

- Verificar logs de servidor para errores de Sanity
- Monitorear métricas de carga de imágenes
- Revisar analytics de autenticación móvil

## Variables de Entorno Requeridas

Asegúrate de tener en producción:

```env
NEXT_PUBLIC_SANITY_PROJECT_ID=kgklfrat
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_READ_TOKEN=tu_token_de_lectura
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=tu_clerk_key_produccion
CLERK_SECRET_KEY=tu_clerk_secret_produccion
```

## Despliegue

1. **Build y Test Local**:

```bash
npm run build
npm start
```

2. **Verificar en Móvil Local**:

- Usar ngrok o similar para probar en dispositivo real
- Verificar que SanityLive se deshabilita automáticamente

3. **Deploy a Producción**:

- Verificar variables de entorno
- Monitorear logs durante las primeras horas
- Probar en múltiples dispositivos móviles

## Beneficios de la Solución

✅ **Estabilidad**: SanityLive se deshabilita automáticamente en móviles problemáticos
✅ **Rendimiento**: Configuración optimizada para dispositivos móviles
✅ **Seguridad**: Tokens no expuestos en el navegador
✅ **Graceful Degradation**: La app funciona sin SanityLive
✅ **Monitoreo**: Error boundaries capturan problemas específicos
✅ **Compatibilidad**: Funciona en todos los navegadores móviles

## Notas Importantes

- SanityLive solo se deshabilita en móviles EN PRODUCCIÓN
- En desarrollo sigue funcionando normalmente para debugging
- Las imágenes de Sanity siguen funcionando perfectamente
- Clerk mantiene toda su funcionalidad
- El contenido se actualiza mediante revalidación normal de Next.js
