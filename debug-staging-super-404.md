# Debug Session: staging-super-404
- **Status**: [OPEN]
- **Issue**: `https://staging.elmenu.site/super` responde 404 ("Página no encontrada")
- **Debug Server**: (pending)
- **Log File**: .dbg/trae-debug-log-staging-super-404.ndjson

## Reproduction Steps
1. Abrir `https://staging.elmenu.site/super`
2. Observar que aparece `404 Página no encontrada`

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `getStoreBySlug("super")` falla en staging (dataset/env distintos) y dispara `notFound()` | High | Low | Confirmed |
| B | Rewrites/middleware config cambió y ya no enruta `/super` a `app/(store)/[slug]` | Med | Med | Rejected |
| C | Staging apunta a un deployment distinto (alias correcto pero route missing por build/output) | Med | Low | Rejected |
| D | Hay protección/redirect (Clerk/Vercel) que altera la ruta y termina en 404 de app | Low | Med | Rejected |

## Log Evidence
- Pre-fix: `.dbg/trae-debug-log-staging-super-404.ndjson` lines 1-6 muestran `slug: "super"`, `exactId: null`, `legacyMatchId: null`.
- Sanity test dataset: la tienda existe con slug `abarrotes-pilot` y `_id/storeId` `abarrotes-pilot`.
- Post-fix: `.dbg/trae-debug-log-staging-super-404.ndjson` lines 11-14 muestran `slug: "super"`, `resolvedSlug: "abarrotes-pilot"`, `exactId: "abarrotes-pilot"`.
- Verificación local adicional: `curl -I http://localhost:3001/super` devuelve `307 Temporary Redirect` con `location: /abarrotes-pilot`.

## Verification Conclusion
- Root cause: `/super` no tenía correspondencia con un slug real en Sanity; la tienda del super está publicada como `abarrotes-pilot`.
- Fix aplicado:
  1. alias explícito `super -> abarrotes-pilot` en `sanity/lib/products/getStoreBySlug.ts`
  2. redirect explícito `/super -> /abarrotes-pilot` en `middleware.ts`
- Pre-fix vs post-fix: antes el lookup devolvía `null`; después resuelve correctamente el `exactId` y localmente la ruta ya redirige a la URL real.
