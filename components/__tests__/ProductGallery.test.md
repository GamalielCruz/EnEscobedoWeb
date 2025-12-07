# Test Cases para ProductGallery

## Casos de Prueba Manual

### 📱 **Dispositivos Móviles (iPhone/Android)**

#### Test 1: Miniaturas Visibles
- [ ] Las miniaturas se muestran horizontalmente
- [ ] Todas las imágenes son visibles sin cortes
- [ ] El scroll horizontal funciona suavemente
- [ ] Los indicadores de posición aparecen (si >3 imágenes)

#### Test 2: Interacción Táctil
- [ ] Tap en miniatura cambia imagen principal
- [ ] Feedback visual en tap (escala 95%)
- [ ] Transiciones suaves entre estados
- [ ] Snap scrolling funciona correctamente

#### Test 3: Imagen Principal
- [ ] Se muestra centrada y completa
- [ ] Padding interno evita cortes
- [ ] Aspect ratio se mantiene
- [ ] Carga con prioridad

### 📱 **iPad/Tablets**

#### Test 4: Área Táctil Adecuada
- [ ] Miniaturas de 96x96px son fáciles de tocar
- [ ] Gap de 12px entre miniaturas es suficiente
- [ ] No hay toques accidentales
- [ ] Feedback visual claro

#### Test 5: Orientación
- [ ] Funciona en portrait y landscape
- [ ] Layout se adapta correctamente
- [ ] Scroll no se corta en los bordes
- [ ] Imagen principal mantiene proporciones

### 💻 **Desktop**

#### Test 6: Layout Vertical
- [ ] Miniaturas se muestran en columna
- [ ] Scroll vertical funciona
- [ ] Hover effects funcionan
- [ ] Dimensiones de 112x112px apropiadas

#### Test 7: Interacción con Mouse
- [ ] Hover escala miniatura (105%)
- [ ] Click cambia imagen principal
- [ ] Focus ring visible con teclado
- [ ] Transiciones suaves

## Casos Edge

### Test 8: Una Sola Imagen
- [ ] No se muestran miniaturas
- [ ] Solo imagen principal visible
- [ ] Layout correcto sin miniaturas

### Test 9: Muchas Imágenes (>5)
- [ ] Scroll funciona correctamente
- [ ] Indicadores de posición precisos
- [ ] Performance no se degrada
- [ ] Snap scrolling efectivo

### Test 10: Imágenes de Diferentes Ratios
- [ ] object-contain mantiene proporciones
- [ ] Padding interno consistente
- [ ] No hay distorsión
- [ ] Centrado correcto

## Accesibilidad

### Test 11: Navegación por Teclado
- [ ] Tab navega entre miniaturas
- [ ] Enter/Space selecciona miniatura
- [ ] Focus ring visible
- [ ] Orden lógico de navegación

### Test 12: Screen Readers
- [ ] Alt text descriptivo
- [ ] Roles apropiados
- [ ] Estados anunciados correctamente
- [ ] Navegación comprensible

## Performance

### Test 13: Carga de Imágenes
- [ ] Imagen principal carga con prioridad
- [ ] Miniaturas cargan progresivamente
- [ ] Sizes attribute optimiza carga
- [ ] No hay layout shift

### Test 14: Animaciones
- [ ] 60fps en transiciones
- [ ] No lag en dispositivos lentos
- [ ] GPU acceleration activa
- [ ] Smooth scrolling

## Responsive Design

### Test 15: Breakpoints
- [ ] 320px (móvil pequeño): 80x80px miniaturas
- [ ] 640px (móvil): 96x96px miniaturas  
- [ ] 768px (tablet): Layout cambia a vertical
- [ ] 1024px+ (desktop): 112x112px miniaturas

### Test 16: Orientación
- [ ] Portrait: Layout vertical en móvil
- [ ] Landscape: Más espacio para miniaturas
- [ ] Rotación no rompe layout
- [ ] Imagen seleccionada se mantiene

## Casos de Error

### Test 17: Imágenes Faltantes
- [ ] Placeholder o error graceful
- [ ] No rompe el layout
- [ ] Otras imágenes siguen funcionando
- [ ] Mensaje de error apropiado

### Test 18: Conexión Lenta
- [ ] Loading states visibles
- [ ] Progresive enhancement
- [ ] Fallbacks apropiados
- [ ] UX no se degrada

## Checklist de Aprobación

Para considerar las mejoras exitosas, todos estos puntos deben cumplirse:

### ✅ **Funcionalidad Core**
- [ ] Selección de miniaturas funciona
- [ ] Imagen principal cambia correctamente
- [ ] Layout responsivo en todos los dispositivos
- [ ] Performance aceptable (<100ms transiciones)

### ✅ **UX/UI**
- [ ] Feedback visual claro en todas las interacciones
- [ ] Transiciones suaves y naturales
- [ ] Área táctil adecuada (mínimo 44x44px)
- [ ] Contraste suficiente para accesibilidad

### ✅ **Compatibilidad**
- [ ] iOS Safari (iPhone/iPad)
- [ ] Chrome Mobile (Android)
- [ ] Desktop browsers principales
- [ ] Tablets de diferentes tamaños

### ✅ **Accesibilidad**
- [ ] WCAG 2.1 AA compliance
- [ ] Navegación por teclado completa
- [ ] Screen reader compatible
- [ ] Alto contraste soportado

## Herramientas de Testing

### **Dispositivos Físicos**
- iPhone (diferentes tamaños)
- iPad (diferentes generaciones)
- Android tablets
- Desktop con diferentes resoluciones

### **Herramientas de Desarrollo**
- Chrome DevTools (device simulation)
- Firefox Responsive Design Mode
- Safari Web Inspector
- Lighthouse (performance/accessibility)

### **Testing Automatizado**
```bash
# Performance testing
npm run lighthouse

# Accessibility testing  
npm run axe-core

# Visual regression testing
npm run percy
```