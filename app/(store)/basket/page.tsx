"use client";

import Loader from "@/components/Loader";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import useBasketStore from "@/store/store";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GoogleMapsProvider } from '@/components/GoogleMapsLoader';
import StepByStepCheckout from '@/components/StepByStepCheckout';
import ServiceConflictHandler from '@/components/ServiceConflictHandler';
import MultiGroupCheckout from '@/components/MultiGroupCheckout';
import CurrentStoreIndicator from '@/components/CurrentStoreIndicator';
import { useAuth, SignInButton } from "@clerk/nextjs";
import { type ServiceTypeGroup } from "@/lib/serviceTypeConflicts";

function BasketPage() {
  const groupedItems = useBasketStore((state) => state.getGroupedItems());
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const [isClient, setIsClient] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState<'single' | 'multi' | 'conflict'>('single');
  const [serviceGroups, setServiceGroups] = useState<ServiceTypeGroup[]>([]);

  useEffect(() => {
    setIsClient(true);
    
    // Limpiar datos antiguos o incompletos del localStorage al cargar la página
    const cleanupOldData = () => {
      const saved = localStorage.getItem('clickCollectStore');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Si los datos están incompletos o son muy antiguos, limpiarlos
          const isIncomplete = !parsed.deliveryMethod || !parsed.storeId || !parsed.storeName;
          const isOld = parsed.timestamp && (Date.now() - parsed.timestamp) > 60 * 60 * 1000; // 1 hora
          
          if (isIncomplete || isOld) {
            console.log('🗑️ Limpiando datos antiguos o incompletos del localStorage');
            localStorage.removeItem('clickCollectStore');
          }
        } catch (error) {
          console.error('Error parsing localStorage data:', error);
          localStorage.removeItem('clickCollectStore');
        }
      }
    };
    
    cleanupOldData();
  }, []);

  // Obtener el ID de la tienda de los productos en el carrito (si aplica)
  const cartStoreId = groupedItems[0]?.product?.affiliateStore && 
    typeof groupedItems[0]?.product?.affiliateStore === 'object' && 
    '_id' in groupedItems[0]?.product?.affiliateStore 
    ? (groupedItems[0]?.product?.affiliateStore as { _id: string })._id 
    : null;

  // Convertir BasketItem[] a GroupedBasketItem[] para el ServiceConflictHandler
  const convertedGroupedItems = groupedItems.map(item => ({
    product: {
      _id: item.product._id,
      name: item.product.name,
      price: item.product.price,
      affiliateStore: item.product.affiliateStore && 
        typeof item.product.affiliateStore === 'object' && 
        '_id' in item.product.affiliateStore 
        ? {
            _id: (item.product.affiliateStore as { _id: string })._id,
            name: (item.product.affiliateStore as { _id: string; name?: string })?.name
          }
        : undefined
    },
    quantity: item.quantity
  }));

  // Convertir BasketItem[] para StepByStepCheckout
  const convertedForCheckout = groupedItems.map(item => ({
    product: {
      _id: item.product._id,
      name: item.product.name,
      price: item.product.price,
      image: item.product.image?.asset ? {
        asset: {
          _ref: item.product.image.asset._ref
        }
      } : undefined,
      slug: item.product.slug?.current ? {
        current: item.product.slug.current
      } : undefined,
      affiliateStore: item.product.affiliateStore && 
        typeof item.product.affiliateStore === 'object' && 
        '_id' in item.product.affiliateStore 
        ? {
            _id: (item.product.affiliateStore as { _id: string })._id
          }
        : undefined
    },
    quantity: item.quantity
  }));

  const handleConflictResolved = (groups: ServiceTypeGroup[]) => {
    setServiceGroups(groups);
    setCheckoutMode(groups.length > 1 ? 'multi' : 'single');
  };

  const handleNoConflicts = () => {
    setCheckoutMode('single');
  };

  const handleBackToCart = () => {
    setCheckoutMode('single');
    setServiceGroups([]);
  };

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

  return (
    <GoogleMapsProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}>
      <div className="container mx-auto p-4 max-w-7xl translate-y-[70px] pb-8">
        <h1 className="text-md font-bold mb-4 text-gray-800">
          Articulos en el carrito
        </h1>

        {/* Modo de checkout múltiple */}
        {checkoutMode === 'multi' && serviceGroups.length > 0 && (
          <MultiGroupCheckout 
            groups={serviceGroups}
            onBackToCart={handleBackToCart}
          />
        )}

        {/* Modo de checkout normal */}
        {checkoutMode === 'single' && (
          <div className="flex flex-col xl:flex-row gap-6">
            <div className="flex-grow space-y-3">
              {/* Indicador de tienda actual */}
              <CurrentStoreIndicator />
              
              {groupedItems?.map((item) => (
                <div
                  key={item.product._id}
                  className="p-3 border rounded flex items-center justify-between bg-white shadow-sm"
                >
                  <div
                    className="flex items-center cursor-pointer flex-1 min-w-0"
                    onClick={() =>
                      router.push(`/product/${item.product.slug?.current}`)
                    }
                  >
                    <div className="w-12 h-12 sm:w-16 sm:h-16 flex-shrink-0 mr-3">
                      {item.product.image && (
                        <Image
                          src={imageUrl(item.product.image).url()}
                          alt={item.product.name ?? "Product image"}
                          width={64}
                          height={64}
                          className="rounded-md object-cover w-full h-full"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm sm:text-base font-semibold truncate">
                        {item.product.name}
                      </h2>
                      <p className="text-xs sm:text-sm text-gray-600">
                        precio: $
                        {((item.product.price ?? 0) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center ml-3 flex-shrink-0">
                    <div className="bg-[#D3F263] rounded flex items-center">
                      <button
                        onClick={() =>
                          useBasketStore.getState().removeItem(item.product._id)
                        }
                        className="p-2 text-sm hover:bg-[#EFF2D8] rounded-l"
                      >
                        -
                      </button>
                      <span className="px-3 py-2 text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() =>
                          useBasketStore.getState().addItem(item.product)
                        }
                        className="p-2 text-sm hover:bg-[#EFF2D8] rounded-r"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              className="w-full xl:w-96 xl:sticky xl:top-4 h-fit bg-white p-4 sm:p-6 border rounded-xl shadow-sm
                order-first xl:order-last
                "
            >
              <h3 className="text-lg font-semibold mb-3">Resumen de compra</h3>
              <div className="space-y-2 mb-4">
                <p className="flex justify-between text-sm">
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
                
                {/* Subtotal de productos */}
                <p className="flex justify-between text-sm">
                  <span>Subtotal:</span>
                  <span>
                    ${useBasketStore.getState().getTotalPrice().toFixed(2)}
                  </span>
                </p>

                {/* Costo de envío - mostrar cuando esté disponible */}
                <ShippingCostDisplay />
               
                <p className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>
                    <TotalWithShipping />
                  </span>
                </p>
              </div>

              {isSignedIn ? (
                <div className="space-y-4">
                  {/* Detector de conflictos de servicio */}
                  <ServiceConflictHandler
                    groupedItems={convertedGroupedItems}
                    onGroupsResolved={handleConflictResolved}
                    onNoConflicts={handleNoConflicts}
                  />
                  
                  {/* Componente de checkout paso a paso (solo si no hay conflictos) */}
                  {checkoutMode === 'single' && (
                    <StepByStepCheckout 
                      groupedItems={serviceGroups.length > 0 ? 
                        serviceGroups[0].items.map(item => ({
                          product: {
                            _id: item.product._id,
                            name: item.product.name,
                            price: item.product.price,
                            image: undefined, // ServiceTypeGroup items don't have image info
                            slug: undefined,
                            affiliateStore: item.product.affiliateStore ? {
                              _id: item.product.affiliateStore._id
                            } : undefined
                          },
                          quantity: item.quantity
                        })) : 
                        convertedForCheckout
                      }
                      totalPrice={serviceGroups.length > 0 ? serviceGroups[0].totalPrice : useBasketStore.getState().getTotalPrice()}
                      cartStoreId={cartStoreId || undefined}
                      forceStartFromStep1={true}
                    />
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
                    className="w-full bg-[#D3F263] text-black px-4 py-2 rounded hover:bg-[#EFF2D8]"
                  >
                    Iniciá sesión para completar la compra.
                  </button>
                </SignInButton>
              )}
            </div>
          </div>
        )}
      </div>
    </GoogleMapsProvider>
  );
}

// Componente para mostrar el costo de envío
function ShippingCostDisplay() {
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string | null>(null);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);

  useEffect(() => {
    const updateShippingCost = () => {
      const saved = localStorage.getItem('clickCollectStore');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Solo mostrar si tenemos método de entrega Y ubicación confirmada
          if (parsed.deliveryMethod && 
              parsed.storeId && 
              parsed.storeName && 
              parsed.shippingCost !== undefined) {
            setShippingCost(parsed.shippingCost);
            setDeliveryMethod(parsed.deliveryMethod);
            setIsLocationConfirmed(true);
          } else {
            // Si los datos están incompletos, no mostrar
            setShippingCost(null);
            setDeliveryMethod(null);
            setIsLocationConfirmed(false);
          }
        } catch (error) {
          console.error('Error parsing shipping cost:', error);
          setShippingCost(null);
          setDeliveryMethod(null);
          setIsLocationConfirmed(false);
        }
      } else {
        // Si no hay datos guardados, no mostrar
        setShippingCost(null);
        setDeliveryMethod(null);
        setIsLocationConfirmed(false);
      }
    };

    // Actualizar inmediatamente
    updateShippingCost();

    // Escuchar cambios en localStorage
    const handleStorageChange = () => {
      updateShippingCost();
    };

    const handleStoreSelected = () => {
      setTimeout(updateShippingCost, 100); // Pequeño delay para asegurar que localStorage se actualizó
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('storeSelected', handleStoreSelected);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('storeSelected', handleStoreSelected);
    };
  }, []);

  // Solo mostrar si la ubicación está confirmada
  if (!isLocationConfirmed || deliveryMethod === null || shippingCost === null) {
    return null;
  }

  return (
    <p className="flex justify-between text-sm">
      <span>Envío:</span>
      <span className={shippingCost === 0 ? "text-green-600 font-medium" : ""}>
        {shippingCost === 0 ? "Gratis" : `$${shippingCost?.toFixed(2)}`}
      </span>
    </p>
  );
}

// Componente para mostrar el total con envío
function TotalWithShipping() {
  const [shippingCost, setShippingCost] = useState<number>(0);
  const [isLocationConfirmed, setIsLocationConfirmed] = useState(false);
  const getTotalPrice = useBasketStore((state) => state.getTotalPrice);

  useEffect(() => {
    const updateShippingCost = () => {
      const saved = localStorage.getItem('clickCollectStore');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          // Solo incluir costo de envío si la ubicación está confirmada
          if (parsed.deliveryMethod && 
              parsed.storeId && 
              parsed.storeName && 
              parsed.shippingCost !== undefined) {
            setShippingCost(parsed.shippingCost || 0);
            setIsLocationConfirmed(true);
          } else {
            setShippingCost(0);
            setIsLocationConfirmed(false);
          }
        } catch (error) {
          console.error('Error parsing shipping cost:', error);
          setShippingCost(0);
          setIsLocationConfirmed(false);
        }
      } else {
        setShippingCost(0);
        setIsLocationConfirmed(false);
      }
    };

    // Actualizar inmediatamente
    updateShippingCost();

    // Escuchar cambios
    const handleStorageChange = () => {
      updateShippingCost();
    };

    const handleStoreSelected = () => {
      setTimeout(updateShippingCost, 100);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('storeSelected', handleStoreSelected);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('storeSelected', handleStoreSelected);
    };
  }, []);

  // Solo incluir costo de envío si la ubicación está confirmada
  const totalWithShipping = getTotalPrice() + (isLocationConfirmed ? shippingCost : 0);

  return <>${totalWithShipping.toFixed(2)}</>;
}

export default BasketPage;