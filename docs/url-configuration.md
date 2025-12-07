# Configuración de URLs

## Problema Resuelto

**Issue:** Los usuarios eran redirigidos a URLs internas de Vercel (`*.vercel.app`) en lugar de la URL pública de la aplicación cuando cancelaban el checkout de Stripe.

**Causa:** Uso incorrecto de `process.env.VERCEL_URL` para URLs públicas.

## Variables de Entorno

### Desarrollo Local
```env
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
```

### Producción
```env
NEXT_PUBLIC_BASE_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_URL="https://tu-dominio-publico.com"
```

## Diferencias Importantes

### `VERCEL_URL`
- **Uso:** URLs internas de Vercel
- **Formato:** `app-name-hash-team.vercel.app`
- **Cuándo usar:** Nunca para redirects públicos
- **Ejemplo:** `store-with-stripe-26hnr4wyd-ignacios-projects-8bce5533.vercel.app`

### `NEXT_PUBLIC_SITE_URL`
- **Uso:** URL pública de la aplicación
- **Formato:** Tu dominio personalizado
- **Cuándo usar:** Redirects de Stripe, webhooks, enlaces públicos
- **Ejemplo:** `https://pixelaplastico.com`

## Utilidades Creadas

### `lib/urls.ts`
- `getPublicUrl()` - Obtiene la URL pública correcta
- `getInternalUrl()` - Obtiene la URL interna (para operaciones del servidor)
- `buildUrl(path)` - Construye URLs completas

## Archivos Actualizados

1. **`actions/createCheckoutSession.ts`**
   - Corregido `cancel_url` y `success_url`
   - Ahora usa `buildUrl()` para URLs consistentes

2. **`sanity/lib/client.ts`**
   - Corregido `studioUrl` para Sanity Studio
   - Usa URL pública en lugar de `VERCEL_URL`

3. **`.env.local`**
   - Agregada `NEXT_PUBLIC_SITE_URL`

## Testing

### Desarrollo
```bash
npm run dev
# Las URLs deberían usar http://localhost:3000
```

### Producción
```bash
npm run build && npm start
# Las URLs deberían usar NEXT_PUBLIC_SITE_URL
```

## Verificación

Para verificar que las URLs están correctas:

1. **Stripe Checkout:** El botón "Atrás" debe redirigir a `/basket` en tu dominio
2. **Sanity Studio:** Debe ser accesible en `tu-dominio.com/studio`
3. **Success Page:** Debe redirigir a `tu-dominio.com/success` después del pago

## Configuración en Vercel

En el dashboard de Vercel, asegúrate de configurar:

```env
NEXT_PUBLIC_SITE_URL=https://tu-dominio-personalizado.com
```

**Nota:** No uses `VERCEL_URL` para redirects públicos, solo para operaciones internas del servidor.