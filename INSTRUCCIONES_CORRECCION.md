# 🚨 CORRECCIÓN URGENTE - Caracteres Invisibles en Nombres de Tiendas

## Problema Identificado
La tienda "Borona Pizza" contiene caracteres invisibles Unicode que están causando que el API devuelva resultados incorrectos.

## Datos Actuales
- **Tienda**: "Borona Pizza" (con caracteres invisibles)
- **Owner actual**: `user_392Q7p9ahx7GuGwIit2aWNeWaak`
- **Usuario de prueba**: `user_39PQr4Lr2OD4eWNk8Ke8g4UVzFL` (debería tener 0 tiendas)

## Pasos para Corregir

### 1. Acceder a Sanity Studio
Abre: http://localhost:3000/studio

### 2. Buscar la Tienda Problemática
1. Ve a la sección "affiliateStore"
2. Busca la tienda con el nombre que contiene "Borona Pizza"
3. Verás que el nombre parece normal pero contiene caracteres invisibles

### 3. Corregir el Nombre
1. Edita el campo "name" de la tienda
2. **BORRA completamente el contenido actual**
3. Escribe manualmente: `Borona Pizza`
4. Asegúrate de que el owner sea correcto o déjalo en blanco si no tiene owner

### 4. Verificar Owner
- **Opción A**: Si la tienda debe tener un owner, asigna el ID correcto
- **Opción B**: Si es una tienda de prueba, déjala sin owner (`null`)

### 5. Guardar los Cambios
- Haz clic en "Publish" para guardar los cambios

## Verificación Después de la Corrección

Una vez corregido, ejecuta este comando para verificar:

```bash
node clear-sanity-cache.js
```

Deberías ver:
```
👤 Usuario: user_39PQr4Lr2OD4eWNk8Ke8g4UVzFL
Tiendas del usuario: 0
✅ Usuario no tiene tiendas asignadas
```

Y en el navegador, recarga la página y verifica que:
- El usuario `user_39PQr4Lr2OD4eWNk8Ke8g4UVzFL` NO vea el ícono de Manager
- Los logs del frontend muestren `ownedStores: []`

## Causa Raíz
Los caracteres invisibles (Unicode 8203, 8204, 8205, 65279) en el nombre de la tienda estaban causando que las consultas de Sanity se comportaran de manera impredecible, devolviendo resultados incorrectos al API.

## Prevención
Para evitar esto en el futuro:
1. Siempre verifica los nombres al crear/editar tiendas
2. Evita copiar y pegar texto de fuentes externas
3. Considera agregar validación para caracteres invisibles en el frontend

---
**IMPORTANTE**: Esta corrección debe hacerse manualmente en Sanity Studio ya que requiere permisos de escritura en la base de datos.
