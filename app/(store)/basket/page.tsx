"use client";

import {
  createCheckoutSession,
  Metadata,
} from "@/actions/createCheckoutSession";
import Loader from "@/components/Loader";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import useBasketStore from "@/store/store";
import { SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SafeLocationBasedStoreSelector } from '@/components/SafeLocationBasedStoreSelector';
import { calculateDistance } from '@/lib/clickCollect';
import { Truck, Store, CreditCard, Banknote, MapPin, X } from "lucide-react";

interface SavedStoreInfo {
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  estimatedDelivery: string;
  customerAddress?: unknown;
}

function BasketPage() {
  const groupedItems = useBasketStore((state) => state.getGroupedItems());
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasStoreSaved, setHasStoreSaved] = useState(false);
  const [savedStoreInfo, setSavedStoreInfo] = useState<SavedStoreInfo | null>(null);
  const [selectedStore, setSelectedStore] = useState<any | null>(null);
  const [customerAddress, setCustomerAddress] = useState<any | null>(null);
  const [serviceType, setServiceType] = useState<'delivery' | 'pickup' | null>(null);
  const [shippingCost, setShippingCost] = useState<number | null>(null);

  useEffect(() => {
    setIsClient(true);
    
    // Verificar si hay una tienda guardada
    const checkStoreSaved = () => {
      const savedStore = localStorage.getItem('clickCollectStore');
      if (savedStore) {
        const storeData = JSON.parse(savedStore);
        setHasStoreSaved(true);
        setSavedStoreInfo(storeData);
      } else {
        setHasStoreSaved(false);
        setSavedStoreInfo(null);
      }
    };
    
    checkStoreSaved();
    
    // Escuchar cuando se seleccione una tienda
    const handleStoreSelected = () => {
      checkStoreSaved();
    };
    
    window.addEventListener('storeSelected', handleStoreSelected);
    
    return () => {
      window.removeEventListener('storeSelected', handleStoreSelected);
    };
  }, []);

  // Obtener el ID de la tienda de los productos en el carrito (si aplica)
  const cartStoreId = groupedItems[0]?.product?.affiliateStore?._id;

  useEffect(() => {
    // Si hay un store guardado en localStorage, cargarlo
    const saved = localStorage.getItem('clickCollectStore');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setSelectedStore(parsed);
        setCustomerAddress(parsed.customerAddress || null);
        setShippingCost(parsed.shippingCost ?? null);
        setHasStoreSaved(true);
        setSavedStoreInfo(parsed);
      } catch (e) {
        // ignore
      }
    }
  }, []);

  if (!isClient) {
    return <Loader />;
  }

  if (groupedItems.length === 0) {
    return (
      <div className="container mx-auto p-4 flex flex-col items-center justify-center min-h-[60vh] mt-20">
        <div className="text-center space-y-4">
          <div className="w-24 h-24 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
            <Store className="w-12 h-12 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">Tu carrito está vacío</h1>
          <p className="text-gray-600">Agrega productos para comenzar tu compra</p>
          <button
            onClick={() => router.push('/')}
            className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Ir a comprar
          </button>
        </div>
      </div>
    );
  }

  const handleCheckout = async () => {
    if (!isSignedIn) return;
    setIsLoading(true);

    try {
      const metadata: Metadata = {
        orderNumber: crypto.randomUUID(),
        customerName: user?.fullName ?? "Unknown",
        customerEmail: user?.emailAddresses[0].emailAddress ?? "Unknown",
        clerkUserId: user!.id,
      };

      const checkoutUrl = await createCheckoutSession(groupedItems, metadata);

      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (error) {
      console.error("Error al crear la sesión de checkout", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClickCollect = () => {
    if (hasStoreSaved) {
      // Si ya hay tienda guardada, ir directo al checkout Click & Collect (pago en efectivo)
      router.push('/checkout-click-collect');
    } else {
      // Si no hay tienda, ir a seleccionar una
      router.push('/select-store');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-20 pb-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Tu Carrito
          </h1>
          <p className="text-gray-600 mt-1">
            {groupedItems.reduce((total, item) => total + item.quantity, 0)} {groupedItems.reduce((total, item) => total + item.quantity, 0) === 1 ? 'producto' : 'productos'}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Lista de productos */}
          <div className="flex-1 space-y-3">
            {groupedItems?.map((item) => (
              <div
                key={item.product._id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4">
                  {/* Imagen del producto */}
                  <div
                    className="w-20 h-20 md:w-24 md:h-24 flex-shrink-0 cursor-pointer"
                    onClick={() => router.push(`/product/${item.product.slug?.current}`)}
                  >
                    {item.product.image && (
                      <Image
                        src={imageUrl(item.product.image).url()}
                        alt={item.product.name ?? "Product image"}
                        width={96}
                        height={96}
                        className="rounded-lg object-cover w-full h-full"
                      />
                    )}
                  </div>

                  {/* Info del producto */}
                  <div className="flex-1 min-w-0">
                    <h2
                      className="text-base md:text-lg font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors line-clamp-2"
                      onClick={() => router.push(`/product/${item.product.slug?.current}`)}
                    >
                      {item.product.name}
                    </h2>
                    <p className="text-lg md:text-xl font-bold text-gray-900 mt-1">
                      ${((item.product.price ?? 0) * item.quantity).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-500">
                      ${(item.product.price ?? 0).toFixed(2)} c/u
                    </p>
                  </div>

                  {/* Controles de cantidad */}
                  <div className="flex flex-col items-end justify-between">
                    <button
                      onClick={() => useBasketStore.getState().removeItem(item.product._id)}
                      className="text-gray-400 hover:text-red-600 transition-colors p-1"
                      aria-label="Eliminar producto"
                    >
                      <X className="w-5 h-5" />
                    </button>
                    
                    <div className="flex items-center bg-gray-100 rounded-lg">
                      <button
                        onClick={() => {
                          if (item.quantity > 1) {
                            useBasketStore.getState().removeItem(item.product._id);
                          }
                        }}
                        className="px-3 py-2 text-gray-700 hover:text-gray-900 font-semibold"
                      >
                        -
                      </button>
                      <span className="px-4 py-2 font-semibold text-gray-900 min-w-[2rem] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => useBasketStore.getState().addItem(item.product)}
                        className="px-3 py-2 text-gray-700 hover:text-gray-900 font-semibold"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar de resumen */}
          <div className="lg:w-96 lg:sticky lg:top-24 h-fit">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Resumen</h3>
              
              {/* Subtotal */}
              <div className="space-y-3 pb-4 border-b border-gray-200">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal ({groupedItems.reduce((total, item) => total + item.quantity, 0)} {groupedItems.reduce((total, item) => total + item.quantity, 0) === 1 ? 'producto' : 'productos'})</span>
                  <span className="font-semibold">${useBasketStore.getState().getTotalPrice().toFixed(2)}</span>
                </div>
                {shippingCost !== null && serviceType === 'delivery' && (
                  <div className="flex justify-between text-gray-600">
                    <span>Envío</span>
                    <span className="font-semibold">${shippingCost.toFixed(2)}</span>
                  </div>
                )}
              </div>

              {/* Total */}
              <div className="flex justify-between text-xl font-bold text-gray-900 py-4 border-b border-gray-200">
                <span>Total</span>
                <span>${(useBasketStore.getState().getTotalPrice() + (shippingCost || 0)).toFixed(2)}</span>
              </div>

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

                  {/* Paso 2: Dirección (solo para delivery) */}
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

                  {/* Paso 3: Selección de tienda */}
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
                        {serviceType === 'pickup' ? (
                          <SafeLocationBasedStoreSelector
                                onStoreSelected={async (storeData: any) => {
                                  console.log('🏪 Tienda seleccionada para pickup:', storeData);
                                  setSelectedStore(storeData);
                                  
                                  // Para pickup, solo guardamos info de la tienda, NO del cliente
                                  const payload: any = {
                                    deliveryMethod: 'pickup',
                                    storeId: storeData.store._id,
                                    storeName: storeData.summary.storeName,
                                    storeAddress: storeData.summary.address,
                                    storePhone: storeData.summary.phone,
                                    estimatedDelivery: storeData.summary.estimatedDelivery,
                                    shippingCost: 0, // Gratis para pickup
                                  };
                                  
                                  console.log('💾 Guardando info de pickup:', payload);
                                  localStorage.setItem('clickCollectStore', JSON.stringify(payload));
                                  window.dispatchEvent(new Event('storeSelected'));
                                  setShippingCost(0);
                                }}
                                onAddressChange={() => {
                                  // No hacer nada para pickup
                                }}
                            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                            filterStoreId={cartStoreId}
                          />
                        ) : (
                          <SafeLocationBasedStoreSelector
                            onStoreSelected={async (storeData: any) => {
                              console.log('🏪 Tienda seleccionada:', storeData);
                              
                              // VALIDACIÓN: No permitir continuar sin ubicación del cliente
                              if (!storeData.userLocation && !storeData.customerAddress && !customerAddress) {
                                alert('⚠️ Por favor, detecta tu ubicación o ingresa tu dirección antes de seleccionar una tienda.');
                                return;
                              }
                              
                              setSelectedStore(storeData);
                              
                              // Esperar un momento para que la geocodificación termine
                              await new Promise(resolve => setTimeout(resolve, 500));
                              
                              // Usar la dirección que viene del selector (ya geocodificada)
                              let finalCustomerAddress = storeData.customerAddress || customerAddress;
                              
                              // Si aún no hay dirección pero hay coordenadas, crear una básica
                              if (!finalCustomerAddress && storeData.userLocation) {
                                console.log('⚠️ No hay dirección geocodificada, usando ubicación básica');
                                finalCustomerAddress = {
                                  street: "Dirección detectada automáticamente",
                                  city: storeData.store.address?.city || "",
                                  state: storeData.store.address?.state || "",
                                  postalCode: "",
                                  country: "México",
                                  latitude: storeData.userLocation.lat,
                                  longitude: storeData.userLocation.lng,
                                };
                              }
                              
                              // Si TODAVÍA no hay dirección, usar la de la tienda como referencia (último recurso)
                              if (!finalCustomerAddress) {
                                console.log('⚠️ Usando dirección de la tienda como referencia');
                                finalCustomerAddress = {
                                  street: "Por favor, ingresa tu dirección completa en el checkout",
                                  city: storeData.store.address?.city || "",
                                  state: storeData.store.address?.state || "",
                                  postalCode: "",
                                  country: "México",
                                };
                              }
                              
                              console.log('📍 Dirección final del cliente:', finalCustomerAddress);
                              
                              const payload: any = {
                                deliveryMethod: serviceType,
                                storeId: storeData.store._id,
                                storeName: storeData.summary.storeName,
                                storeAddress: storeData.summary.address,
                                storePhone: storeData.summary.phone,
                                estimatedDelivery: storeData.summary.estimatedDelivery,
                                customerAddress: finalCustomerAddress,
                              };

                              const storeCoords = storeData.store.coordinates;
                              const custCoords = (finalCustomerAddress && (finalCustomerAddress.latitude || finalCustomerAddress.lat)) ? {
                                latitude: finalCustomerAddress.latitude || finalCustomerAddress.lat,
                                longitude: finalCustomerAddress.longitude || finalCustomerAddress.lng || finalCustomerAddress.longitude,
                              } : null;

                              // Calcular costo de envío para delivery
                              if (custCoords && storeCoords) {
                                const dist = calculateDistance(custCoords.latitude, custCoords.longitude, storeCoords.latitude, storeCoords.longitude);
                                const costPerKm = 6;
                                const minCharge = 30;
                                const shipping = Math.max(minCharge, Math.round(dist * costPerKm));
                                setShippingCost(shipping);
                                payload.distanceKm = dist;
                                payload.shippingCost = shipping;
                                console.log('💰 Costo de envío calculado:', shipping);
                              }

                              console.log('💾 Guardando en localStorage:', payload);
                              localStorage.setItem('clickCollectStore', JSON.stringify(payload));
                              window.dispatchEvent(new Event('storeSelected'));
                            }}
                            onAddressChange={(addr) => {
                              console.log('📍 onAddressChange llamado con:', addr);
                              setCustomerAddress(addr);
                              
                              // Guardar dirección inmediatamente en localStorage
                              const currentStore = localStorage.getItem('clickCollectStore');
                              if (currentStore) {
                                try {
                                  const storeData = JSON.parse(currentStore);
                                  storeData.customerAddress = addr;
                                  localStorage.setItem('clickCollectStore', JSON.stringify(storeData));
                                  console.log('💾 Dirección actualizada en localStorage:', addr);
                                } catch (e) {
                                  console.error('❌ Error actualizando dirección:', e);
                                }
                              } else {
                                // Si no hay datos previos, crear un objeto básico con la dirección
                                console.log('💾 Creando nuevo registro con dirección del cliente');
                                const newData = {
                                  deliveryMethod: serviceType,
                                  customerAddress: addr,
                                };
                                localStorage.setItem('clickCollectStore', JSON.stringify(newData));
                                console.log('✅ Dirección guardada:', newData);
                              }
                            }}
                            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                            filterStoreId={cartStoreId}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Paso 4: Método de pago */}
                  {serviceType && selectedStore && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <span className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm">
                          {serviceType === 'delivery' ? '4' : '3'}
                        </span>
                        Método de pago
                      </h4>
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

                  {/* Info de tienda seleccionada */}
                  {selectedStore && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                      <MapPin className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-green-800 font-medium text-sm">{savedStoreInfo?.storeName}</p>
                        <p className="text-green-600 text-xs mt-1">{savedStoreInfo?.estimatedDelivery}</p>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BasketPage;
