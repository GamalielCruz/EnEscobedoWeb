"use client";

import {
  createCheckoutSession,
  Metadata,
} from "@/actions/createCheckoutSession";
import AddToBasketButton from "@/components/AddToBasketButton";
import Loader from "@/components/Loader";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import { categoryType } from "@/sanity/schemaTypes/categoryType";
import useBasketStore from "@/store/store";
import { SignInButton, useAuth, useUser } from "@clerk/nextjs";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Store } from "lucide-react";
import { SafeLocationBasedStoreSelector } from '@/components/SafeLocationBasedStoreSelector';
import { calculateDistance } from '@/lib/clickCollect';

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
      <div
        className="container mx-auto p-4 flex flex-col items-center justify-center translate-y-[70px]"
      >
        <h1 className="text-2xl font-bold mb-6 text-gray-800 ">Tu Carrito</h1>
        <p>Tu carrito esta vacio.</p>
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
    <div className="container mx-auto p-4 max-w-6xl translate-y-[70px] pb-8">
      <h1 className="text-md font-bold mb-4 text-gray-800">
        Articulos en el carrito
      </h1>
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-grow space-y-4">
          {groupedItems?.map((item) => (
            <div
              key={item.product._id}
              className="p-4 border rounded flex items-center justify-between bg-white shadow-sm"
            >
              <div
                className="flex items-center cursor-pointer flex-1 min-w-0"
                onClick={() =>
                  router.push(`/product/${item.product.slug?.current}`)
                }
              >
                <div className="w-15 h-15 sm:w-20 flex-shrink-0 mr-4">
                  {item.product.image && (
                    <Image
                      src={imageUrl(item.product.image).url()}
                      alt={item.product.name ?? "Product image"}
                      width={96}
                      height={96}
                      className="rounded-md"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-semibold truncate">
                    {item.product.name}
                  </h2>
                  <p className="text-sm sm:text-base">
                    precio: $
                    {((item.product.price ?? 0) * item.quantity).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="flex items-center ml-4 flex-shrink-0">
                <p className="bg-[#D3F263] text-bold">
                  <button
                    onClick={() =>
                      useBasketStore.getState().removeItem(item.product._id)
                    }
                    className="p-4 text-sm sm:text-base"
                  >
                    -
                  </button>
                  {item.quantity}
                  <button
                    onClick={() =>
                      useBasketStore.getState().addItem(item.product)
                    }
                    className="p-4 text-sm sm:text-base"
                  >
                    +
                  </button>
                </p>
              </div>
            </div>
          ))}
        </div>
        <div
          className="w-full lg:w-80 lg:sticky lg:top-4 h-fit bg-white p-6 border rounded-2xl shadow-sm
            order-first lg:order-last
            "
        >
          <h3 className="text-lg font-semibold mb-3">Resumen de compra</h3>
          <div className="space-y-2">
            <p className="flex justify-between">
              <span>
                {groupedItems.reduce(
                  (total, item) => total + item.quantity,
                  0
                ) > 1
                  ? "Productos:"
                  : "Producto:"}
              </span>
              <span>
                {groupedItems.reduce((total, item) => total + item.quantity, 0)}
              </span>
            </p>
           
            <p className="flex justify-between text-xl font-bold border-t pt-2">
              <span>Total:</span>
              <span>
                ${useBasketStore.getState().getTotalPrice().toFixed(2)}
              </span>
            </p>
          </div>

          {isSignedIn ? (
            <div className="space-y-4 mt-4">
                {/* Selector de tipo de servicio + selector de tienda/ubicación embebido */}
                <div className="border-2 border-gray-200 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-gray-900">Tipo de Servicio</h3>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => setServiceType('delivery')}
                      className={`w-full sm:flex-1 px-3 py-2 rounded ${serviceType === 'delivery' ? 'bg-blue-600 text-white' : 'border'}`}
                    >Servicio a Domicilio</button>
                    <button
                      onClick={() => setServiceType('pickup')}
                      className={`w-full sm:flex-1 px-3 py-2 rounded ${serviceType === 'pickup' ? 'bg-green-600 text-white' : 'border'}`}
                    >Recoger en Tienda</button>
                  </div>

                  {serviceType && (
                    <div className="space-y-3">
                      <div className="p-2 bg-white rounded max-h-64 sm:max-h-80 overflow-auto">
                        <SafeLocationBasedStoreSelector
                          onStoreSelected={(storeData: any) => {
                          // Guardar tienda seleccionada y notificar al resto de la app
                          setSelectedStore(storeData);
                          // Si el selector envía address con coords, lo guardamos
                          // storeData.store.coordinates debería existir
                          const payload: any = {
                            deliveryMethod: serviceType,
                            storeId: storeData.store._id,
                            storeName: storeData.summary.storeName,
                            storeAddress: storeData.summary.address,
                            storePhone: storeData.summary.phone,
                            estimatedDelivery: storeData.summary.estimatedDelivery,
                            customerAddress: customerAddress || null,
                          };

                          // intentar calcular shipping si tenemos coords del cliente y de la tienda
                          const storeCoords = storeData.store.coordinates;
                          const custCoords = (customerAddress && (customerAddress.latitude || customerAddress.lat)) ? {
                            latitude: customerAddress.latitude || customerAddress.lat,
                            longitude: customerAddress.longitude || customerAddress.lng || customerAddress.longitude,
                          } : null;

                          if (serviceType === 'delivery' && custCoords && storeCoords) {
                            const dist = calculateDistance(custCoords.latitude, custCoords.longitude, storeCoords.latitude, storeCoords.longitude);
                            const costPerKm = 6;
                            const minCharge = 30;
                            const shipping = Math.max(minCharge, Math.round(dist * costPerKm));
                            setShippingCost(shipping);
                            payload.distanceKm = dist;
                            payload.shippingCost = shipping;
                          }

                          localStorage.setItem('clickCollectStore', JSON.stringify(payload));
                          window.dispatchEvent(new Event('storeSelected'));
                        }}
                        onAddressChange={(addr) => {
                          setCustomerAddress(addr);
                        }}
                        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                        filterStoreId={cartStoreId}
                      />
                    </div>
                  </div>
                  )}

                  {/* Botones de pago — ambos disponibles para pickup y delivery */}
                  <div className="space-y-2 mt-2">
                    <button
                      onClick={handleCheckout}
                      disabled={isLoading}
                      className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      {isLoading ? "Espera..." : serviceType === 'delivery' ? 'Pagar y Enviar (Stripe)' : 'Pagar en Línea'}
                    </button>

                    <button
                      onClick={() => {
                        // Pago en efectivo en tienda o con repartidor — ir a checkout COD
                        router.push('/checkout-cod');
                      }}
                      disabled={isLoading}
                      className="w-full bg-gray-800 text-white px-4 py-3 rounded-lg hover:bg-gray-900 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors"
                    >
                      {isLoading ? 'Espera...' : serviceType === 'delivery' ? 'Pagar al Repartidor / Contra entrega' : 'Pagar en Tienda (Efectivo)'}
                    </button>

                    {shippingCost !== null && serviceType === 'delivery' && (
                      <p className="text-sm text-gray-600 text-center">Costo de envío estimado: ${shippingCost} MXN</p>
                    )}
                  </div>
                </div>
              
              {/* Información de tienda guardada (si existe) */}
              {hasStoreSaved && savedStoreInfo && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-800 text-sm mb-1">
                    <span>✓ Tienda seleccionada:</span>
                  </div>
                  <p className="text-green-700 font-medium text-sm">{savedStoreInfo.storeName}</p>
                  <p className="text-green-600 text-xs">{savedStoreInfo.estimatedDelivery}</p>
                  <button
                    onClick={() => router.push('/select-store')}
                    disabled={isLoading}
                    className="mt-2 text-green-600 text-xs underline hover:text-green-800"
                  >
                    Cambiar tienda
                  </button>
                </div>
              )}
              
              {/* Nota informativa */}
              <div className="text-xs text-gray-600 text-center space-y-1">
                <p>💳 Pago seguro con Stripe</p>
                <p>📦 Envío gratis en recoger en tienda</p>
              </div>
            </div>
          ) : (
            <SignInButton mode="modal">
              <button
                className="mt-4 w-full bg-[#D3F263] text-black px-4 py-2 rounded
                        hover:bg-[#EFF2D8"
              >
                Iniciá sesión para completar la compra.
              </button>
            </SignInButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default BasketPage;
