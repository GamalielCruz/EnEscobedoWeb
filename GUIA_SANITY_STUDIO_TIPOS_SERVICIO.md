# Guía: Acceder a los Tipos de Servicio en Sanity Studio

## ✅ Verificación Completada
- El schema está correctamente configurado
- Los campos `serviceTypes` están presentes
- El servidor está funcionando en `http://localhost:3000`

## 📋 Pasos para ver los nuevos campos:

### 1. Acceder a Sanity Studio
1. Abre tu navegador
2. Ve a: **`http://localhost:3000/studio`**
3. Inicia sesión si es necesario

### 2. Navegar a las Tiendas Afiliadas
1. En el menú lateral, busca **"Tienda Afiliada"** o **"Affiliate Store"**
2. Haz clic para ver la lista de tiendas

### 3. Abrir una Tienda Existente
1. Selecciona cualquier tienda de la lista
2. O crea una nueva tienda haciendo clic en **"Create"**

### 4. Buscar la Sección "Tipos de Servicio Disponibles"
Los nuevos campos deberían aparecer **después** del campo "Activa" con el título:
**"Tipos de Servicio Disponibles"**

### 5. Campos Disponibles:
- ✅ **Entrega a Domicilio** (checkbox)
- ✅ **Recoger en Tienda** (checkbox)
- 📍 **Radio de Entrega (km)** (número - solo visible si "Entrega a Domicilio" está habilitado)
- 💰 **Pedido Mínimo para Entrega (MXN)** (número - solo visible si "Entrega a Domicilio" está habilitado)

## 🔧 Si no ves los campos:

### Opción 1: Refrescar la página
1. Presiona **F5** o **Ctrl+R** para refrescar Sanity Studio
2. Vuelve a abrir la tienda

### Opción 2: Limpiar caché del navegador
1. Presiona **Ctrl+Shift+R** (hard refresh)
2. O abre las herramientas de desarrollador (F12)
3. Haz clic derecho en el botón de refrescar y selecciona "Empty Cache and Hard Reload"

### Opción 3: Crear una nueva tienda
1. En lugar de editar una existente, crea una nueva tienda
2. Los campos deberían aparecer inmediatamente

## 📸 Cómo debería verse:

```
┌─ Tienda Afiliada ─────────────────────────┐
│                                           │
│ Nombre de la Tienda: [_______________]    │
│ ...otros campos...                        │
│                                           │
│ ☑️ Activa                                 │
│ Si la tienda está activa para recibir     │
│ pedidos                                   │
│                                           │
│ 📋 Tipos de Servicio Disponibles         │
│ Configura qué tipos de servicio ofrece   │
│ esta tienda                               │
│                                           │
│   ☑️ Entrega a Domicilio                 │
│   ¿Esta tienda ofrece servicio de        │
│   entrega a domicilio?                    │
│                                           │
│   ☑️ Recoger en Tienda                   │
│   ¿Esta tienda permite recoger pedidos   │
│   en el local?                            │
│                                           │
│   📍 Radio de Entrega (km): [10____]     │
│   Radio máximo de entrega en kilómetros  │
│                                           │
│   💰 Pedido Mínimo para Entrega (MXN):   │
│   [100____]                               │
│   Monto mínimo requerido para entrega    │
│                                           │
└───────────────────────────────────────────┘
```

## ⚠️ Validaciones Importantes:
- **Al menos uno** de los servicios (Entrega o Recogida) debe estar habilitado
- Los campos de **Radio** y **Pedido Mínimo** solo aparecen si **Entrega a Domicilio** está habilitado
- Si intentas deshabilitar ambos servicios, aparecerá un error de validación

## 🎯 Configuraciones Recomendadas:

### Para Restaurantes con Delivery:
- ✅ Entrega a Domicilio: **Habilitado**
- ✅ Recoger en Tienda: **Habilitado**
- 📍 Radio de Entrega: **10-15 km**
- 💰 Pedido Mínimo: **100-200 MXN**

### Para Restaurantes Solo Pickup:
- ❌ Entrega a Domicilio: **Deshabilitado**
- ✅ Recoger en Tienda: **Habilitado**

## 🚀 Próximos Pasos:
1. Configura al menos una tienda con diferentes tipos de servicio
2. Ve a `http://localhost:3000/basket` para probar la funcionalidad
3. Agrega productos al carrito y verifica que solo aparezcan las opciones configuradas

---

**¿Necesitas ayuda?** Si los campos aún no aparecen después de seguir estos pasos, avísame y podemos investigar más a fondo.