# ⚡ INSTRUCCIONES RÁPIDAS - QUÉ HACER AHORA

## Paso a Paso Inmediato

### 1️⃣ Reinicia el servidor
```bash
npm run dev
```
Espera a que compile completamente.

### 2️⃣ Migra los productos existentes
En una nueva terminal (sin detener `npm run dev`):
```bash
npm run migrate:products
```

Se te pedirá que proporciones tu token de Sanity. Sigue estos pasos:

**Cómo obtener el token:**
1. Ve a https://manage.sanity.io
2. Selecciona tu proyecto
3. Ve a "API" en el menú izquierdo
4. Ve a "Tokens"
5. Crea un nuevo token con permisos de lectura/escritura
6. Copia el token
7. Pégalo en la terminal cuando se te pida

**Salida esperada:**
```
🔄 Iniciando migración de productos...
📦 Encontrados X productos
⚙️  Actualizando Producto 1...
⚙️  Actualizando Producto 2...
✅ Migración completada!
```

### 3️⃣ Verifica en Sanity Studio
1. Abre http://localhost:3000/studio
2. Haz clic en un producto
3. Desplázate hasta el final
4. Deberías ver una nueva sección "Aprobación" con los campos nuevos
5. Cierra sin guardar

### 4️⃣ Prueba el flujo completo

**Como Dueño (usuario normal):**
1. Ve a http://localhost:3000/dashboard
2. Haz clic en "Productos"
3. Crea un nuevo producto o edita uno existente
4. Deberías ver:
   - Badge amarillo "Pendiente de revisión"
   - Botón "Editar" deshabilitado
   - Mensaje: "Producto enviado para revisión"

**Como Admin:**
1. Asegúrate de estar logueado con la cuenta correcta
2. Ve a http://localhost:3000/pending-products
3. Deberías ver:
   - Lista de productos pendientes
   - Box azul con "Cambios propuestos"
   - Botones "Aprobar" y "Rechazar"
4. Haz clic en "Aprobar"
5. Debería desaparecer de la lista

**Vuelve como Dueño:**
1. Recarga el dashboard
2. El producto debería estar actualizado
3. Badge desaparecido
4. Botón "Editar" habilitado

---

## 📋 Checklist de Verificación

```
[ ] npm run dev inicia sin errores
[ ] Sanity Studio abre correctamente
[ ] Script de migración completa sin errores
[ ] Nuevos campos visibles en Sanity Studio
[ ] Crear producto muestra badge "Pendiente"
[ ] Admin ve producto en /pending-products
[ ] Aprobar funciona
[ ] Dueño ve cambios actualizado
```

---

## 🆘 Si Algo Falla

### Error: "No autorizado" en /pending-products
- Verifica tu Clerk ID en el archivo:
  `app/(admin)/pending-products/page.tsx` línea 32
- Abre la consola (F12) y copia tu ID:
  ```javascript
  // En la consola del navegador
  console.log(document.querySelector('[data-user-id]')?.textContent)
  // O busca en el Clerk dashboard
  ```
- Actualiza el array `ADMIN_USERS` con tu ID correcto

### Error: Migración falla
```bash
# Asegúrate de que tienes el token correcto
# Intenta de nuevo:
npm run migrate:products

# O manualmente sin script:
npx sanity exec scripts/migrate-products.js --with-user-token
```

### Cambios no aparecen
1. Recarga la página (F5)
2. Haz clic en botón "Actualizar" en el dashboard
3. Espera 10 segundos (auto-refresco)
4. Verifica que estés logueado correctamente

---

## 📖 Documentación Completa

Para más detalles, consulta:
- `SOLUCION_APROBACION_COMPLETA.md` - Análisis técnico completo
- `MIGRACION_PRODUCTOS_APROBACION.md` - Guía de migración detallada
- `RESUMEN_FINAL_APROBACION.md` - Resumen ejecutivo

---

## 🎉 ¡Listo!

Una vez completados estos pasos, tu sistema de aprobación de productos estará 100% funcional.

**Tiempo estimado:** 5-10 minutos

¿Preguntas? Revisa la documentación o ejecuta de nuevo los pasos.
