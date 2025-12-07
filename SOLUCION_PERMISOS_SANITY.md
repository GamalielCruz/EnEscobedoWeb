# 🔧 Solución: Permisos de Sanity

## 🚨 Problema Identificado
```
Error guardando la orden en la base de datos: transaction failed: 
Insufficient permissions; permission "create" required
```

## 🔍 Causa Raíz
El token de API de Sanity (`SANITY_API_TOKEN`) **no tiene permisos de escritura** para crear documentos.

## ✅ Solución

### **Paso 1: Verificar Token Actual**
El token actual en `.env.local`:
```
SANITY_API_TOKEN=skTKqpKJegWPIvjfxNKsTViWyZf3kWj45UhoAlj1nHiAEYI5FyD0tXKEjNPpH7t9HeI7LE0DL77ZDmKdBNmbY3cPpU02Nsx4Hx9KMwqCLIwRSjMpwMwg76oT6AGHK7tXvYMrOjPFldQ8H9aKQvfLC6E5svNz3yLkfZwbiT2iF3FGoPGuMIIC
```

### **Paso 2: Crear Nuevo Token con Permisos de Escritura**

1. **Ir a Sanity Management Console:**
   ```
   https://www.sanity.io/manage
   ```

2. **Seleccionar tu proyecto** (`kgklfrat`)

3. **Ir a API → Tokens**

4. **Crear nuevo token:**
   - **Name**: `Write Token for Click & Collect`
   - **Permissions**: **Editor** (o **Admin** para máximos permisos)
   - **Dataset**: `production`

5. **Copiar el token generado**

### **Paso 3: Actualizar Variables de Entorno**

Reemplazar en `.env.local`:
```env
# Token con permisos de escritura
SANITY_API_TOKEN=tu_nuevo_token_aqui
```

### **Paso 4: Reiniciar Servidor**
```bash
# Detener el servidor (Ctrl+C)
# Reiniciar
npm run dev
```

## 🧪 Verificar la Solución

### **Opción 1: Script de Prueba**
```bash
node test-simple-order.js
```

**Resultado esperado:**
```
✅ Orden Click & Collect creada en Sanity: {
  orderId: "abc123...",
  orderNumber: "TEST-1234567890",
  pickupCode: "ABC123"
}
```

### **Opción 2: Verificar en Sanity Studio**
```
http://localhost:3333/studio
```
- Ir a "Click & Collect Orders"
- Verificar que aparece la orden creada

## 🔐 Tipos de Permisos en Sanity

### **Viewer** (Solo lectura)
- ❌ No puede crear documentos
- ❌ No puede actualizar documentos
- ✅ Puede leer documentos

### **Editor** (Lectura y escritura)
- ✅ Puede crear documentos
- ✅ Puede actualizar documentos
- ✅ Puede leer documentos
- ❌ No puede eliminar documentos

### **Admin** (Todos los permisos)
- ✅ Puede crear documentos
- ✅ Puede actualizar documentos
- ✅ Puede leer documentos
- ✅ Puede eliminar documentos
- ✅ Puede gestionar esquemas

## 💡 Recomendación

Para **desarrollo y producción** de Click & Collect:
- **Usar permisos de Editor** (suficiente para crear/actualizar órdenes)
- **No usar Admin** a menos que sea necesario (principio de menor privilegio)

## 📋 Checklist de Verificación

- [ ] ✅ Token creado con permisos de **Editor** o **Admin**
- [ ] ✅ Token actualizado en `.env.local`
- [ ] ✅ Servidor reiniciado
- [ ] ✅ Script de prueba ejecutado exitosamente
- [ ] ✅ Orden visible en Sanity Studio

## 🎯 Resultado Esperado

Después de actualizar el token:
- ✅ **Órdenes se crean** en Sanity
- ✅ **API funciona** correctamente
- ✅ **Panel de admin** muestra órdenes
- ✅ **Sistema completo** operativo

**Una vez solucionado este problema de permisos, todo el sistema de Click & Collect funcionará correctamente.** 🚀