# 🏪 Sistema Click & Collect - Configuración Querétaro

## 📍 **CONFIGURADO PARA PEDRO ESCOBEDO, QUERÉTARO**

El sistema Click & Collect está ahora configurado específicamente para Pedro Escobedo, Querétaro, México, utilizando Google Maps API para geocodificación precisa.

---

## 🔧 **CONFIGURACIÓN REQUERIDA**

### 1. **Google Maps API Key**

Agrega tu API key de Google Maps en `.env.local`:

```env
# Google Maps API Key para geocodificación
GOOGLE_MAPS_API_KEY=TU_API_KEY_AQUI
```

**APIs necesarias en Google Cloud Console:**
- ✅ Geocoding API
- ✅ Maps JavaScript API (opcional para futuras mejoras)

### 2. **Poblar Tiendas de Querétaro**

```bash
# Ejecutar script específico para Querétaro
npx tsx scripts/populate-stores-queretaro.ts

# Regenerar tipos de Sanity
npm run typegen
```

---

## 🏪 **TIENDAS CONFIGURADAS EN PEDRO ESCOBEDO**

### **Tiendas Principales (5 ubicaciones):**

1. **Tienda Centro Pedro Escobedo**
   - 📍 Calle Hidalgo 15, Centro
   - 📞 +52 442 123 4567
   - ⏰ Lun-Vie: 8:00-19:00, Sáb: 8:00-17:00, Dom: 9:00-15:00
   - 🚚 Entrega: 1 día

2. **Tienda Plaza San Miguel**
   - 📍 Av. Constitución 45, Col. San Miguel
   - 📞 +52 442 234 5678
   - ⏰ Lun-Vie: 9:00-20:00, Sáb: 9:00-18:00, Dom: 10:00-16:00
   - 🚚 Entrega: 1 día

3. **Tienda Barrio Alto**
   - 📍 Calle Morelos 78, Barrio Alto
   - 📞 +52 442 345 6789
   - ⏰ Lun-Vie: 8:30-18:30, Sáb: 8:30-16:00, Dom: Cerrado
   - 🚚 Entrega: 1 día

4. **Tienda La Estación**
   - 📍 Av. Ferrocarril 123, La Estación
   - 📞 +52 442 456 7890
   - ⏰ Lun-Vie: 7:00-19:00, Sáb: 7:00-17:00, Dom: 8:00-14:00
   - 🚚 Entrega: 1 día

5. **Tienda El Pueblito**
   - 📍 Calle Juárez 56, El Pueblito
   - 📞 +52 442 567 8901
   - ⏰ Lun-Vie: 8:00-18:00, Sáb: 8:00-16:00, Dom: 9:00-15:00
   - 🚚 Entrega: 1 día

### **Tienda de Comparación:**

6. **Tienda Querétaro Centro**
   - 📍 Calle 5 de Mayo 89, Centro Histórico, Santiago de Querétaro
   - 📞 +52 442 678 9012
   - ⏰ Lun-Vie: 9:00-20:00, Sáb: 9:00-18:00, Dom: 10:00-16:00
   - 🚚 Entrega: 2 días (más distante)

---

## 🧪 **DIRECCIONES DE PRUEBA RECOMENDADAS**

### **Para probar en Pedro Escobedo:**

```javascript
// Centro de Pedro Escobedo (más cercana a Tienda Centro)
{
  street: "Calle Hidalgo 10",
  city: "Pedro Escobedo",
  state: "Querétaro"
}

// Colonia San Miguel (más cercana a Plaza San Miguel)
{
  street: "Av. Constitución 30", 
  city: "Pedro Escobedo",
  state: "Querétaro"
}

// Barrio Alto (más cercana a Tienda Barrio Alto)
{
  street: "Calle Morelos 50",
  city: "Pedro Escobedo", 
  state: "Querétaro"
}

// La Estación (más cercana a Tienda La Estación)
{
  street: "Av. Ferrocarril 100",
  city: "Pedro Escobedo",
  state: "Querétaro"
}
```

---

## 🗺️ **COORDENADAS DE REFERENCIA**

### **Pedro Escobedo (Centro):**
- **Latitud:** 20.5089
- **Longitud:** -100.1456

### **Área de Cobertura:**
- **Radio aproximado:** 3-5 km
- **Todas las tiendas** están dentro del municipio
- **Tiempo de entrega:** 1 día (local)

---

## 🚀 **CÓMO PROBAR EL SISTEMA**

### **Flujo Completo:**

1. **Agregar productos al carrito**
   - Visita: `http://localhost:3000/`

2. **Seleccionar Click & Collect**
   - Ve al carrito: `http://localhost:3000/basket`
   - Haz clic: "🏪 Click & Collect - Recoger en Tienda"

3. **Seleccionar tienda**
   - Ingresa una dirección de Pedro Escobedo
   - El sistema usará **Google Maps** para geocodificar
   - Calculará distancias precisas a todas las tiendas
   - Seleccionará automáticamente la **más cercana**

4. **Completar pago**
   - Procede al checkout normal con **Stripe**
   - El envío será **GRATUITO** (Click & Collect)
   - No se solicitará dirección de envío

5. **Recibir confirmación**
   - Código de recogida único
   - Información de la tienda seleccionada
   - Notificaciones automáticas (simuladas)

---

## 🔧 **CARACTERÍSTICAS TÉCNICAS**

### **Geocodificación:**
- ✅ **Google Maps API** (principal)
- ✅ **Fallback a OpenStreetMap** si falla Google
- ✅ **Coordenadas de emergencia** para Pedro Escobedo

### **Cálculo de Distancias:**
- ✅ **Fórmula de Haversine** para precisión geográfica
- ✅ **Resultados en kilómetros** con 2 decimales
- ✅ **Selección automática** de tienda más cercana

### **Integración con Stripe:**
- ✅ **Sin opciones de envío** para Click & Collect
- ✅ **Sin recolección de dirección** de envío
- ✅ **Metadata personalizado** con información de tienda
- ✅ **Webhook actualizado** para manejar órdenes Click & Collect

---

## 📊 **VENTAJAS DE LA CONFIGURACIÓN LOCAL**

### **Para Pedro Escobedo:**
- ✅ **Entrega rápida** (1 día vs 2-5 días de envío)
- ✅ **Costo cero** de envío
- ✅ **Múltiples ubicaciones** para conveniencia
- ✅ **Horarios extendidos** (algunas desde 7:00 AM)
- ✅ **Cobertura completa** del municipio

### **Para el Negocio:**
- ✅ **Reducción de costos** de envío
- ✅ **Mayor satisfacción** del cliente local
- ✅ **Entrega más rápida** que envío tradicional
- ✅ **Red de socios** locales

---

## 🔮 **PRÓXIMAS MEJORAS SUGERIDAS**

### **Mapas Interactivos:**
- Integrar Google Maps embed
- Mostrar ubicación de tiendas en mapa
- Rutas desde ubicación del cliente

### **Notificaciones Reales:**
- WhatsApp Business API
- SMS con Twilio
- Emails con SendGrid

### **Optimizaciones Locales:**
- Horarios especiales por tienda
- Capacidad en tiempo real
- Promociones por ubicación

---

## ✅ **SISTEMA LISTO PARA PEDRO ESCOBEDO**

El sistema Click & Collect está **completamente configurado** para Pedro Escobedo, Querétaro con:

- 🗺️ **Google Maps** para geocodificación precisa
- 🏪 **5 tiendas locales** + 1 en Querétaro capital
- ⚡ **Entrega en 1 día** para ubicaciones locales
- 💰 **Envío gratuito** para todos los pedidos
- 📱 **Integración completa** con el sistema existente

**¡Prueba el sistema con direcciones reales de Pedro Escobedo!** 🎉