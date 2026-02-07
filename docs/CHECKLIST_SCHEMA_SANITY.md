# Checklist técnico: schema Sanity no carga campo

## Objetivo
Verificar por qué `ownerClerkUserId` no aparece en el formulario de Tienda Afiliada en Sanity Studio.

---

## 1. Verificar que el schema correcto está siendo importado

### Cadena de imports (orden exacto):

```
app/studio/[[...tool]]/page.tsx
  └─ import config from '../../../sanity.config'

sanity.config.ts
  └─ import { schema } from './sanity/schemaTypes'
  └─ defineConfig({ schema, ... })

sanity/schemaTypes/index.ts
  └─ import { affiliateStoreType } from './affiliateStoreType'
  └─ export const schema = { types: [..., affiliateStoreType, ...] }

sanity/schemaTypes/affiliateStoreType.ts
  └─ defineType({ name: "affiliateStore", fields: [..., ownerClerkUserId, ...] })
```

### Comandos de verificación:

```powershell
# 1. Campo en código fuente
Select-String -Path "sanity/schemaTypes/affiliateStoreType.ts" -Pattern "ownerClerkUserId"
# Debe mostrar al menos una coincidencia

# 2. affiliateStoreType en index
Select-String -Path "sanity/schemaTypes/index.ts" -Pattern "affiliateStoreType"

# 3. schema en config
Select-String -Path "sanity.config.ts" -Pattern "schema"
```

---

## 2. Detectar schemas duplicados con el mismo name

Sanity usa el **último** tipo cuando hay duplicados. Si otro archivo define `name: "affiliateStore"`, anularía al tuyo.

```powershell
# Buscar TODAS las definiciones de name: "affiliateStore"
Get-ChildItem -Path sanity -Recurse -Filter *.ts | ForEach-Object {
  $m = Select-String -Path $_.FullName -Pattern 'name:\s*["'']affiliateStore["'']' -AllMatches
  if ($m) { Write-Host "$($_.Name): $($m.Matches.Count) match(es)" }
}
```

**Esperado:** Solo `affiliateStoreType.ts` debe tener la definición del tipo document. Otros archivos pueden tener referencias (ej. `to: [{ type: "affiliateStore" }]`).

---

## 3. Confirmar que _type del documento coincide

El documento debe tener `_type: "affiliateStore"` para que Sanity use el schema de `affiliateStoreType`.

En el RAW JSON del documento:
```json
"_type": "affiliateStore"
```

✅ Tu documento tiene `_type: "affiliateStore"` — correcto.

---

## 4. Verificar schema viejo por error silencioso

### 4a. schema.json (generado por `sanity schema extract`)

El Studio **no** usa `schema.json` directamente. Ese archivo se usa para:
- `npm run typegen` (sanity.types.ts)
- Scripts como `verify-schema.js`

Si `schema.json` tiene `ownerClerkUserId`, el extractor está actualizado. Si no, regenerar:

```powershell
npm run typegen
# O: npx sanity schema extract
```

### 4b. Bundle de Next.js (.next)

El Studio embebido recibe el config (y el schema) desde el bundle de Next.js. Si hay caché:

```powershell
Remove-Item -Recurse -Force .next
npm run dev
```

### 4c. Confirmar schema en tiempo real (en el navegador)

1. Editar `sanity.config.ts`
2. Descomentar el bloque DEBUG (líneas después de `import { structure }`)
3. Guardar
4. Abrir http://localhost:3000/studio
5. Abrir DevTools (F12) → pestaña Console
6. Buscar: `[Sanity] ownerClerkUserId en schema:`

- `true` → El schema correcto llega al Studio; el problema está en otra parte.
- `false` → El schema cargado no incluye el campo; revisar imports o caché.

---

## 5. Script de diagnóstico automatizado

```powershell
node scripts/diagnose-schema.mjs
```

Ejecuta todas las verificaciones anteriores y muestra un reporte.

---

## 6. Archivos clave

| Archivo | Rol |
|---------|-----|
| `sanity/schemaTypes/affiliateStoreType.ts` | Define el tipo y sus campos |
| `sanity/schemaTypes/index.ts` | Exporta schema con affiliateStoreType |
| `sanity.config.ts` | Pasa schema a defineConfig |
| `app/studio/[[...tool]]/page.tsx` | Renderiza NextStudio con config |
| `schema.json` | Extraído; usado por typegen, no por Studio |
| `sanity/structure.ts` | Solo define la barra lateral; no oculta campos |

---

## 7. Si todo está correcto y el campo sigue sin aparecer

Posibles causas:

1. **Caché de Next.js** — Eliminar `.next` y reiniciar `npm run dev`.
2. **Caché del navegador** — Ctrl+Shift+R en `/studio`.
3. **Modo incógnito** — Probar en ventana privada.
4. **Build de producción** — Si usas `npm run build && npm run start`, hacer build de nuevo tras cambios.
