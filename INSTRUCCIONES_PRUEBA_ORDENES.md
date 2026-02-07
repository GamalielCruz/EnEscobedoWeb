# Instrucciones para Probar las Órdenes Unificadas

## ✅ Cambios Implementados

Se ha corregido el problema donde las páginas de órdenes no mostraban todas las órdenes. Ahora ambas páginas consultan tanto el schema `Order` como `ClickCollectOrder`.

## 🧪 Pruebas Automatizadas

### 1. Probar las Queries de Sanity

```bash
node test-unified-orders-query.js
```

Este script verifica:
- Conteo de órdenes por tipo (clickCollectOrder vs order)
- Query unificada obtiene todas las órdenes
- Estructura de datos correcta
- Filtrado por estado

### 2. Probar las APIs (requiere servidor corriendo)

```bash
# En una terminal, inicia el servidor
npm run dev

# En otra terminal, ejecuta las pruebas
node test-unified-orders-api.js
```

Este script prueba:
- GET todas las órdenes
- GET órdenes filtradas por estado
- GET orden específica por número

## 🌐 Pruebas en el Navegador

### 1. Página de Click & Collect Orders (Admin)

**URL:** http://localhost:3000/click-collect-orders

**Qué verificar:**
- ✅ Se muestran todas las órdenes (tanto de `Order` como `ClickCollectOrder`)
- ✅ Los filtros funcionan correctamente:
  - Todas
  - Pendientes
  - Pendientes de Recoger (nuevo)
  - Procesando
  - Listas
  - Completadas
  - Canceladas
- ✅ Se muestra correctamente la información:
  - Número de orden
  - Código de recogida
  - Información del cliente
  - Información de la tienda
  - Lista de productos
  - Total
  - Estado
- ✅ Se puede actualizar el estado de las órdenes

### 2. Dashboard del Restaurante

**URL:** http://localhost:3000/dashboard

**Qué verificar:**
- ✅ Se muestran los pedidos del restaurante
- ✅ Se incluyen órdenes de ambos schemas
- ✅ La información se muestra correctamente:
  - Número de orden
  - Código de recogida
  - Nombre del cliente
  - Teléfono
  - Lista de productos
  - Total
  - Estado
- ✅ Se puede cambiar el estado usando el selector
- ✅ El selector incluye la opción "Pendiente de Recoger"
- ✅ Las notificaciones de nuevos pedidos funcionan

## 📊 Estados Disponibles

| Estado | Descripción | Color |
|--------|-------------|-------|
| `pending` | Pendiente | Amarillo |
| `pending_pickup` | Pendiente de Recoger | Amarillo |
| `processing` | Procesando | Azul |
| `ready_for_pickup` | Listo para Recoger | Verde |
| `completed` | Completado | Gris |
| `cancelled` | Cancelado | Rojo |

## 🔍 Verificación de Datos

### Estructura Esperada de las Órdenes

Todas las órdenes (independientemente de su tipo original) deben tener:

```javascript
{
  _id: string,
  _type: "order" | "clickCollectOrder",
  orderNumber: string,
  pickupCode: string,
  customerInfo: {
    name: string,
    email: string,
    phone: string,
    clerkUserId?: string
  },
  storeInfo: {
    storeId: string,
    storeName: string,
    storeAddress: string,
    storePhone?: string
  },
  items: [
    {
      _key: string,
      productName: string,
      productId: string,
      quantity: number,
      price: number
    }
  ],
  totalAmount: number,
  paymentMethod: string,
  status: string,
  estimatedPickupDate?: string,
  readyAt?: string,
  pickedUpAt?: string,
  notes?: string,
  createdAt: string,
  updatedAt: string
}
```

## 🐛 Solución de Problemas

### No se muestran órdenes

1. Verifica que existan órdenes en Sanity:
   ```bash
   node test-unified-orders-query.js
   ```

2. Revisa la consola del navegador para errores

3. Verifica que el servidor esté corriendo

### Las órdenes no se actualizan

1. Haz clic en el botón "Actualizar" (icono de refresh)
2. Verifica que tengas permisos para la tienda
3. Revisa la consola del navegador

### Filtros no funcionan

1. Verifica que el estado de las órdenes sea válido
2. Prueba con el filtro "Todas" primero
3. Revisa la consola del navegador

## 📝 Notas Importantes

1. **Autenticación**: El dashboard requiere que estés autenticado con Clerk
2. **Permisos**: Solo verás las órdenes de tu restaurante en el dashboard
3. **Polling**: El dashboard actualiza automáticamente cada 15 segundos
4. **Notificaciones**: Se reproduce un sonido cuando llega un nuevo pedido

## 🎯 Casos de Prueba Recomendados

### Caso 1: Verificar que se muestren todas las órdenes
1. Ejecuta `node test-unified-orders-query.js`
2. Anota el número total de órdenes
3. Visita `/click-collect-orders`
4. Verifica que el número coincida

### Caso 2: Filtrar por estado
1. Visita `/click-collect-orders`
2. Haz clic en cada filtro
3. Verifica que solo se muestren órdenes del estado seleccionado

### Caso 3: Actualizar estado de orden
1. Visita `/dashboard`
2. Selecciona un nuevo estado en el dropdown
3. Verifica que el estado se actualice
4. Refresca la página y verifica que el cambio persista

### Caso 4: Verificar normalización de datos
1. Crea una orden usando el schema `Order` con `deliveryMethod: "click_collect"`
2. Crea una orden usando el schema `ClickCollectOrder`
3. Verifica que ambas se muestren con la misma estructura en las páginas

## ✅ Checklist de Verificación

- [ ] Script de prueba de queries ejecuta sin errores
- [ ] Script de prueba de APIs ejecuta sin errores (con servidor corriendo)
- [ ] Página `/click-collect-orders` muestra todas las órdenes
- [ ] Filtros funcionan correctamente
- [ ] Se puede actualizar el estado de las órdenes
- [ ] Dashboard muestra los pedidos del restaurante
- [ ] Selector de estado incluye "Pendiente de Recoger"
- [ ] Notificaciones de nuevos pedidos funcionan
- [ ] Datos se muestran correctamente para ambos tipos de órdenes

## 📞 Soporte

Si encuentras algún problema:

1. Revisa la consola del navegador (F12)
2. Revisa los logs del servidor
3. Ejecuta los scripts de prueba para diagnosticar
4. Verifica que las variables de entorno estén configuradas correctamente
