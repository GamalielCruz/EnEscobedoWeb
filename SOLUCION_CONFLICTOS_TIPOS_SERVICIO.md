# Solución: Manejo de Conflictos de Tipos de Servicio

## Problema Identificado

**Escenario:** Un usuario tiene productos en el carrito de diferentes restaurantes con tipos de servicio incompatibles:
- Restaurante A: Solo ofrece **entrega a domicilio**
- Restaurante B: Solo ofrece **recogida en tienda**
- **Conflicto:** No existe un tipo de servicio común para ambos productos

## Solución Implementada

### 🎯 Enfoque: Separación Automática de Pedidos

La solución detecta automáticamente conflictos y ofrece al usuario opciones inteligentes para resolverlos.

## Componentes Implementados

### 1. **Utilidad de Análisis de Conflictos**
**Archivo:** `lib/serviceTypeConflicts.ts`

**Funciones principales:**
- `getStoresServiceConfig()`: Obtiene configuraciones de servicio de múltiples tiendas
- `analyzeServiceTypeConflicts()`: Detecta conflictos y agrupa productos compatibles
- `generateConflictSummary()`: Genera resúmenes legibles de conflictos

**Lógica de agrupación:**
```typescript
// Ejemplo de agrupación automática
Productos originales:
- Pizza (Restaurante A: solo delivery)
- Sushi (Restaurante B: solo pickup)

Grupos resultantes:
- Grupo 1: Pizza → Solo delivery
- Grupo 2: Sushi → Solo pickup
```

### 2. **Componente Detector de Conflictos**
**Archivo:** `components/ServiceConflictHandler.tsx`

**Características:**
- ✅ Detección automática al cargar el carrito
- ✅ Análisis en tiempo real de compatibilidad
- ✅ Interfaz clara para mostrar conflictos
- ✅ Opciones de resolución intuitivas

**Estados manejados:**
- **Cargando:** Analizando compatibilidad de tiendas
- **Sin conflictos:** Procede con checkout normal
- **Conflictos detectados:** Muestra opciones de resolución

### 3. **Componente de Checkout Múltiple**
**Archivo:** `components/MultiGroupCheckout.tsx`

**Funcionalidades:**
- 📦 Vista de múltiples pedidos separados
- 🔄 Checkout secuencial por grupo
- 📊 Progreso visual de completado
- 💰 Totales individuales y generales

**Experiencia de usuario:**
```
┌─ Checkout de Múltiples Pedidos ─────────────┐
│                                             │
│ Pedido 1: Entrega a Domicilio    $25.00    │
│ ├─ Pizza Margherita                         │
│ └─ [Checkout expandido]                     │
│                                             │
│ Pedido 2: Recoger en Tienda      $18.00    │
│ ├─ Sushi Roll                               │
│ └─ [Pendiente]                              │
│                                             │
│ Total General: $43.00                       │
└─────────────────────────────────────────────┘
```

### 4. **Actualizaciones en Componentes Existentes**

#### ServiceTypeSelector
- ✅ Soporte para restricciones de tipo (`restrictedType`)
- ✅ Mensajes informativos sobre limitaciones
- ✅ Validación de servicios efectivos

#### StepByStepCheckout
- ✅ Callback `onCheckoutComplete` para notificar finalización
- ✅ Soporte para `restrictedServiceType`
- ✅ Integración con sistema de grupos

#### Página del Carrito
- ✅ Detección automática de conflictos
- ✅ Modos de checkout: single/multi
- ✅ Navegación fluida entre modos

## Flujo de Usuario

### 1. **Detección Automática**
```
Usuario agrega productos → 
Análisis automático de compatibilidad →
¿Conflictos detectados?
```

### 2. **Sin Conflictos**
```
Checkout normal →
Selección de tipo de servicio común →
Proceso estándar
```

### 3. **Con Conflictos**
```
Mostrar advertencia →
Opciones de resolución:
├─ Separar en múltiples pedidos (Recomendado)
└─ Elegir solo un tipo de servicio
```

### 4. **Resolución: Múltiples Pedidos**
```
Grupo 1: Productos delivery →
├─ Checkout completo
├─ Selección de dirección
└─ Pago

Grupo 2: Productos pickup →
├─ Checkout completo  
├─ Selección de tienda
└─ Pago

Finalización: Todos los pedidos completados
```

### 5. **Resolución: Selección Única**
```
Usuario elige tipo de servicio →
Mantener solo productos compatibles →
Checkout normal con productos filtrados
```

## Casos de Uso Cubiertos

### ✅ Caso 1: Restaurantes Mixtos
- **Escenario:** Restaurante A (delivery + pickup), Restaurante B (solo pickup)
- **Resultado:** Opciones disponibles = solo pickup
- **Acción:** Checkout normal con pickup

### ✅ Caso 2: Servicios Incompatibles
- **Escenario:** Restaurante A (solo delivery), Restaurante B (solo pickup)
- **Resultado:** Sin servicios comunes
- **Acción:** Separación en 2 pedidos

### ✅ Caso 3: Múltiples Conflictos
- **Escenario:** 3+ restaurantes con diferentes limitaciones
- **Resultado:** Agrupación inteligente por compatibilidad
- **Acción:** Múltiples grupos de checkout

### ✅ Caso 4: Sin Conflictos
- **Escenario:** Todos los restaurantes ofrecen ambos servicios
- **Resultado:** Usuario elige libremente
- **Acción:** Checkout normal

## Ventajas de la Solución

### 🎯 **Para el Usuario**
- **Transparencia:** Información clara sobre limitaciones
- **Flexibilidad:** Opciones para resolver conflictos
- **Conveniencia:** Proceso automático sin intervención manual
- **Control:** Puede elegir cómo proceder

### 🏪 **Para los Restaurantes**
- **Autonomía:** Cada restaurante mantiene sus políticas de servicio
- **Ventas:** No se pierden pedidos por incompatibilidades
- **Claridad:** Configuración simple en Sanity Studio

### 💻 **Para el Sistema**
- **Escalabilidad:** Maneja cualquier número de restaurantes y conflictos
- **Mantenibilidad:** Lógica centralizada y reutilizable
- **Robustez:** Fallbacks y manejo de errores

## Configuración en Sanity Studio

Los administradores pueden configurar fácilmente los tipos de servicio:

```
Restaurante "Pizza Express":
├─ ✅ Entrega a Domicilio
├─ ✅ Recoger en Tienda
├─ 📍 Radio: 15 km
└─ 💰 Mínimo: $200 MXN

Restaurante "Sushi Local":
├─ ❌ Entrega a Domicilio
├─ ✅ Recoger en Tienda
├─ 📍 Radio: 0 km
└─ 💰 Mínimo: $0 MXN
```

## Pruebas Recomendadas

### Escenario de Prueba 1: Conflicto Básico
1. Configurar Tienda A: solo delivery
2. Configurar Tienda B: solo pickup
3. Agregar productos de ambas al carrito
4. Verificar detección de conflicto
5. Probar separación en múltiples pedidos

### Escenario de Prueba 2: Resolución por Selección
1. Mismo setup que Escenario 1
2. Elegir "Seleccionar solo un tipo"
3. Verificar filtrado correcto de productos
4. Completar checkout con productos restantes

### Escenario de Prueba 3: Sin Conflictos
1. Configurar todas las tiendas con ambos servicios
2. Agregar productos variados
3. Verificar checkout normal
4. Probar selección libre de tipo de servicio

## Archivos Modificados/Creados

### Nuevos Archivos:
- `lib/serviceTypeConflicts.ts`
- `components/ServiceConflictHandler.tsx`
- `components/MultiGroupCheckout.tsx`

### Archivos Modificados:
- `components/ServiceTypeSelector.tsx`
- `components/StepByStepCheckout.tsx`
- `app/(store)/basket/page.tsx`

## Resultado Final

La solución proporciona una experiencia de usuario fluida y profesional que:
- **Detecta automáticamente** conflictos de tipos de servicio
- **Ofrece opciones claras** para resolverlos
- **Mantiene la flexibilidad** de cada restaurante
- **Garantiza que no se pierdan ventas** por incompatibilidades técnicas

Los usuarios pueden completar sus compras sin frustración, los restaurantes mantienen su autonomía operativa, y el sistema escala eficientemente para manejar cualquier combinación de servicios.