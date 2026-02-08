# 🔧 Ejemplo de Integración - ModernDeliveryFlow en Basket

## Cambios en `app/(store)/basket/page.tsx`

### 1. Importar el nuevo componente

```tsx
// Al inicio del archivo, agregar:
import ModernDeliveryFlow from '@/components/ModernDeliveryFlow';
```

### 2. Reemplazar la sección de delivery

Busca esta sección en el código actual:

```tsx
{/* CÓDIGO ACTUAL - REEMPLAZAR */}
{serviceType === 'delivery' && !customerAddress && (
  <div className="space-y-3">
    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">2</span>
      Ingresa tu dirección
    </h4>
    <div className="border-2 border-blue-200 rounded-lg bg-blue-50 p-4">
      <p className="text-sm text-blue-800 mb-3">
        📍 Necesitamos tu dirección para calcular el costo de envío y encontrar la tienda más cercana
      </p>
      <SafeLocationBasedStoreSelector
        onStoreSelected={() => {
          // No hacer nada aquí, solo queremos la dirección
        }}
        onAddressChange={(addr) => {
          console.log('📍 Dirección ingresada:', addr);
          setCustomerAddress(addr);
          
          // Guardar dirección inmediatamente
          const newData = {
            deliveryMethod: serviceType,
            customerAddress: addr,
          };
          localStorage.setItem('clickCollectStore', JSON.stringify(newData));
          console.log('✅ Dirección guardada');
        }}
        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
        filterStoreId={cartStoreId}
      />
    </div>
  </div>
)}
```

Reemplazar con:

```tsx
{/* NUEVO CÓDIGO - MEJORADO */}
{serviceType === 'delivery' && !selectedStore && (
  <div className="space-y-3">
    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">2</span>
      Información de entrega
    </h4>
    <div className="border-2 border-blue-200 rounded-lg bg-white p-4 md:p-6">
      <ModernDeliveryFlow
        onComplete={(data) => {
          console.log('✅ Flujo de delivery completado:', data);
          
          // Actualizar estados
          setCustomerAddress(data.customerAddress);
          setSelectedStore(data.selectedStore);
          setShippingCost(data.shippingCost);
          
          // Preparar payload para localStorage
          const payload = {
            deliveryMethod: 'delivery',
            storeId: data.selectedStore._id,
            storeName: data.selectedStore.name,
            storeAddress: `${data.selectedStore.address.street}, ${data.selectedStore.address.city}`,
            storePhone: data.selectedStore.phone || '',
            estimatedDelivery: '30-45 minutos',
            customerAddress: data.customerAddress,
            shippingCost: data.shippingCost,
            distanceKm: data.distanceKm,
          };
          
          // Guardar en localStorage
          localStorage.setItem('clickCollectStore', JSON.stringify(payload));
          
          // Disparar evento para actualizar UI
          window.dispatchEvent(new Event('storeSelected'));
          
          console.log('💾 Datos guardados en localStorage:', payload);
        }}
        filterStoreId={cartStoreId}
      />
    </div>
  </div>
)}
```

### 3. Eliminar la sección redundante de selección de tienda

Busca y **ELIMINA** esta sección (ya no es necesaria):

```tsx
{/* ELIMINAR - Ya no es necesario */}
{serviceType && (serviceType === 'pickup' || customerAddress) && (
  <div className="space-y-3">
    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">
        {serviceType === 'delivery' ? '3' : '2'}
      </span>
      Selecciona tu tienda
    </h4>
    <div className="border-2 border-green-200 rounded-lg bg-green-50 p-4">
      <p className="text-sm text-green-800 mb-3">
        {serviceType === 'delivery' 
          ? '🏪 Selecciona la tienda que preparará tu pedido' 
          : '🏪 Selecciona donde recogerás tu pedido'}
      </p>
      {/* ... código de SafeLocationBasedStoreSelector ... */}
    </div>
  </div>
)}
```

### 4. Actualizar la condición del paso de método de pago

Cambiar la condición para mostrar los botones de pago:

```tsx
{/* ANTES */}
{serviceType && selectedStore && (
  <div className="space-y-3">
    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">
        {serviceType === 'delivery' ? '4' : '3'}
      </span>
      Método de pago
    </h4>
    {/* ... botones de pago ... */}
  </div>
)}

{/* DESPUÉS */}
{serviceType && selectedStore && (
  <div className="space-y-3">
    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
      <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">3</span>
      Método de pago
    </h4>
    
    {/* Mostrar resumen de entrega para delivery */}
    {serviceType === 'delivery' && customerAddress && (
      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-900">Entrega confirmada</p>
            <p className="text-sm text-green-700 mt-1">
              {customerAddress.street}, {customerAddress.city}
            </p>
            <p className="text-sm text-green-700">
              Desde: {selectedStore.name}
            </p>
          </div>
        </div>
      </div>
    )}
    
    {/* Botones de pago */}
    <div className="space-y-2">
      {/* ... resto del código de botones ... */}
    </div>
  </div>
)}
```

### 5. Agregar import de CheckCircle

```tsx
// En la línea de imports de lucide-react, agregar CheckCircle:
import { Truck, Store, CreditCard, Banknote, MapPin, X, CheckCircle } from "lucide-react";
```

## Código Completo de la Sección Modificada

```tsx
{isSignedIn ? (
  <div className="space-y-4 mt-6">
    {/* Paso 1: Tipo de servicio */}
    <div>
      <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
        <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">1</span>
        Tipo de servicio
      </h4>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => {
            setServiceType('delivery');
            setShippingCost(null);
            setSelectedStore(null);
            setCustomerAddress(null);
          }}
          className={`p-3 rounded-lg border-2 transition-all ${
            serviceType === 'delivery'
              ? 'border-blue-600 bg-blue-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <Truck className={`w-6 h-6 mx-auto mb-1 ${serviceType === 'delivery' ? 'text-blue-600' : 'text-gray-400'}`} />
          <span className={`text-sm font-medium ${serviceType === 'delivery' ? 'text-blue-600' : 'text-gray-600'}`}>
            Domicilio
          </span>
        </button>
        <button
          onClick={() => {
            setServiceType('pickup');
            setShippingCost(0);
            setSelectedStore(null);
            setCustomerAddress(null);
          }}
          className={`p-3 rounded-lg border-2 transition-all ${
            serviceType === 'pickup'
              ? 'border-green-600 bg-green-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}
        >
          <Store className={`w-6 h-6 mx-auto mb-1 ${serviceType === 'pickup' ? 'text-green-600' : 'text-gray-400'}`} />
          <span className={`text-sm font-medium ${serviceType === 'pickup' ? 'text-green-600' : 'text-gray-600'}`}>
            Recoger
          </span>
        </button>
      </div>
    </div>

    {/* Paso 2: Información de entrega (NUEVO COMPONENTE) */}
    {serviceType === 'delivery' && !selectedStore && (
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">2</span>
          Información de entrega
        </h4>
        <div className="border-2 border-blue-200 rounded-lg bg-white p-4 md:p-6">
          <ModernDeliveryFlow
            onComplete={(data) => {
              console.log('✅ Flujo de delivery completado:', data);
              
              setCustomerAddress(data.customerAddress);
              setSelectedStore(data.selectedStore);
              setShippingCost(data.shippingCost);
              
              const payload = {
                deliveryMethod: 'delivery',
                storeId: data.selectedStore._id,
                storeName: data.selectedStore.name,
                storeAddress: `${data.selectedStore.address.street}, ${data.selectedStore.address.city}`,
                storePhone: data.selectedStore.phone || '',
                estimatedDelivery: '30-45 minutos',
                customerAddress: data.customerAddress,
                shippingCost: data.shippingCost,
                distanceKm: data.distanceKm,
              };
              
              localStorage.setItem('clickCollectStore', JSON.stringify(payload));
              window.dispatchEvent(new Event('storeSelected'));
              
              console.log('💾 Datos guardados:', payload);
            }}
            filterStoreId={cartStoreId}
          />
        </div>
      </div>
    )}

    {/* Paso 2 alternativo: Selección de tienda para pickup */}
    {serviceType === 'pickup' && !selectedStore && (
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">2</span>
          Selecciona tu tienda
        </h4>
        <div className="border-2 border-green-200 rounded-lg bg-green-50 p-4">
          <p className="text-sm text-green-800 mb-3">
            🏪 Selecciona donde recogerás tu pedido
          </p>
          <SafeLocationBasedStoreSelector
            onStoreSelected={async (storeData: any) => {
              console.log('🏪 Tienda seleccionada para pickup:', storeData);
              setSelectedStore(storeData);
              
              const payload: any = {
                deliveryMethod: 'pickup',
                storeId: storeData.store._id,
                storeName: storeData.summary.storeName,
                storeAddress: storeData.summary.address,
                storePhone: storeData.summary.phone,
                estimatedDelivery: storeData.summary.estimatedDelivery,
                shippingCost: 0,
              };
              
              localStorage.setItem('clickCollectStore', JSON.stringify(payload));
              window.dispatchEvent(new Event('storeSelected'));
              setShippingCost(0);
            }}
            onAddressChange={() => {}}
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
            filterStoreId={cartStoreId}
          />
        </div>
      </div>
    )}

    {/* Paso 3: Método de pago */}
    {serviceType && selectedStore && (
      <div className="space-y-3">
        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">3</span>
          Método de pago
        </h4>
        
        {/* Resumen de entrega para delivery */}
        {serviceType === 'delivery' && customerAddress && (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-green-900">Entrega confirmada</p>
                <p className="text-sm text-green-700 mt-1">
                  {customerAddress.street}, {customerAddress.city}
                </p>
                <p className="text-sm text-green-700">
                  Desde: {selectedStore.store?.name || selectedStore.name}
                </p>
                {shippingCost !== null && (
                  <p className="text-sm font-semibold text-green-900 mt-1">
                    Costo de envío: ${shippingCost} MXN
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Botones de pago */}
        <div className="space-y-2">
          <button
            onClick={handleCheckout}
            disabled={isLoading}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors font-medium"
          >
            <CreditCard className="w-5 h-5" />
            {isLoading ? "Procesando..." : "Pagar con tarjeta (Stripe)"}
          </button>

          {serviceType === 'delivery' && (
            <button
              onClick={() => router.push('/checkout-cod')}
              disabled={isLoading}
              className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg hover:bg-gray-900 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <Banknote className="w-5 h-5" />
              {isLoading ? 'Procesando...' : 'Pagar al recibir (Efectivo)'}
            </button>
          )}
          
          {serviceType === 'pickup' && (
            <button
              onClick={() => router.push('/checkout-click-collect')}
              disabled={isLoading}
              className="w-full bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors font-medium"
            >
              <Store className="w-5 h-5" />
              {isLoading ? 'Procesando...' : 'Confirmar pedido (Pagar en tienda)'}
            </button>
          )}
        </div>
      </div>
    )}

    {/* Beneficios */}
    {serviceType && (
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs text-gray-600">
        <p className="flex items-center gap-2">
          <span className="text-green-600">✓</span>
          Pago seguro con Stripe
        </p>
        {serviceType === 'pickup' && (
          <>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              Sin costo de envío
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-600">✓</span>
              Recoge cuando te convenga
            </p>
          </>
        )}
        {serviceType === 'delivery' && shippingCost !== null && (
          <p className="flex items-center gap-2">
            <span className="text-blue-600">ℹ️</span>
            Envío: ${shippingCost.toFixed(2)} MXN
          </p>
        )}
      </div>
    )}
  </div>
) : (
  <SignInButton mode="modal">
    <button className="mt-6 w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium">
      Inicia sesión para continuar
    </button>
  </SignInButton>
)}
```

## Testing Checklist

Después de implementar, probar:

- [ ] Flujo completo de delivery en desktop
- [ ] Flujo completo de delivery en móvil
- [ ] Detección de ubicación funciona
- [ ] Entrada manual de dirección funciona
- [ ] Se muestran las 3 tiendas más cercanas
- [ ] Cálculo de costo de envío es correcto
- [ ] Se guarda correctamente en localStorage
- [ ] Botones de pago aparecen después de seleccionar tienda
- [ ] Flujo de pickup sigue funcionando
- [ ] Cambio entre delivery y pickup resetea estados
- [ ] Mensajes de error se muestran correctamente
- [ ] Loaders aparecen en los momentos correctos
- [ ] Responsive en diferentes tamaños de pantalla

## Notas Importantes

1. **No eliminar SafeLocationBasedStoreSelector**: Todavía se usa para el flujo de pickup
2. **Mantener lógica de localStorage**: El nuevo componente usa la misma estructura
3. **Verificar API key**: Asegurarse de que `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` esté configurada
4. **Testing en móvil**: La mayor mejora se verá en dispositivos móviles

## Rollback Plan

Si algo sale mal, simplemente:

1. Revertir los cambios en `basket/page.tsx`
2. Eliminar el import de `ModernDeliveryFlow`
3. El componente antiguo seguirá funcionando

El nuevo componente no afecta ninguna otra parte del sistema.
