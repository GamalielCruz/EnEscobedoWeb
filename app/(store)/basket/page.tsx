"use client";

import type { Metadata } from "@/actions/createCheckoutSession";
import Loader from "@/components/Loader";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import useBasketStore from "@/store/store";
import { SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SafeLocationBasedStoreSelector } from '@/components/SafeLocationBasedStoreSelector';
import { calculateDistance } from '@/lib/clickCollect';
import { Truck, Store, CreditCard, Banknote, MapPin, X, CheckCircle, Loader2 } from "lucide-react";
import ModernDeliveryFlow from '@/components/ModernDeliveryFlow';

interface SavedStoreInfo {
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  estimatedDelivery: string;
  customerAddress?: unknown;
}

const cleanDisplayText = (value: unknown, fallback = "") => {
  return String(value || fallback)
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .trim();
};

const getServiceTiming = (storeData: any) => {
  const serviceTypes = storeData?.store?.serviceTypes || storeData?.serviceTypes || {};
  const min = Number(storeData?.store?.deliveryTimeMin ?? storeData?.deliveryTimeMin ?? 10) || 10;
  const max = Number(storeData?.store?.deliveryTimeMax ?? storeData?.deliveryTimeMax ?? min) || min;
  const onDemand = Boolean(serviceTypes.onDemand);
  const extra = onDemand ? Number(serviceTypes.onDemandExtraMinutes ?? 15) || 15 : 0;
  const estimatedMin = min + extra;
  const estimatedMax = Math.max(max + extra, estimatedMin);

  return {
    onDemand,
    label: estimatedMin === estimatedMax ? `${estimatedMin} minutos` : `${estimatedMin}-${estimatedMax} minutos`,
  };
};

const fetchStoreServiceTypes = async (storeId: string) => {
  try {
    const response = await fetch(`/api/store-service-types?storeId=${storeId}`, { cache: "no-store" });
    const data = await response.json();
    return data?.serviceTypes || null;
  } catch (error) {
    console.error("Error loading store service types:", error);
    return null;
  }
};

function BasketPage() {
  const groupedItems = useBasketStore((state) => state.getGroupedItems());
  const clearBasket = useBasketStore((state) => state.clearBasket);
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
  const [showCodPhoneForm, setShowCodPhoneForm] = useState(false);
  const [cashOnDeliveryPhone, setCashOnDeliveryPhone] = useState("");
  const [codError, setCodError] = useState("");
  const [isPickupStoreLoading, setIsPickupStoreLoading] = useState(false);
  const [showPickupPhoneForm, setShowPickupPhoneForm] = useState(false);
  const [pickupPhone, setPickupPhone] = useState("");
  const [pickupError, setPickupError] = useState("");

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

  const cartStoreId = (groupedItems[0]?.product?.affiliateStore as any)?._ref || (groupedItems[0]?.product?.affiliateStore as any)?._id;
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

  useEffect(() => {
    if (serviceType !== 'pickup') return;

    if (!cartStoreId) {
      setSelectedStore(null);
      return;
    }

    let isCancelled = false;

    const hydratePickupStore = async () => {
      setIsPickupStoreLoading(true);

      try {
        const response = await fetch(`/api/nearest-store?filterStoreId=${cartStoreId}`);
        const result = await response.json();
        const store = result?.data?.stores?.[0];

        if (!store || isCancelled) throw new Error("No se pudo cargar la sucursal");

        const serviceTypes = await fetchStoreServiceTypes(cartStoreId);
        const normalizedStore = {
          ...store,
          serviceTypes: serviceTypes || store.serviceTypes,
        };

        const storeAddress = [normalizedStore.address?.street, normalizedStore.address?.city, normalizedStore.address?.state]
          .filter(Boolean)
          .join(', ');
        const pickupTiming = getServiceTiming(normalizedStore);

        const pickupSelection = {
          store: normalizedStore,
          summary: {
            storeName: cleanDisplayText(normalizedStore.name, 'Sucursal asignada'),
            address: cleanDisplayText(storeAddress, 'Direccion no disponible'),
            phone: cleanDisplayText(normalizedStore.contact?.phone, 'Telefono no disponible'),
            estimatedDelivery: pickupTiming.label,
          },
          storeId: normalizedStore._id,
          storeName: cleanDisplayText(normalizedStore.name, 'Sucursal asignada'),
          storeAddress: cleanDisplayText(storeAddress),
          storePhone: cleanDisplayText(normalizedStore.contact?.phone),
          estimatedDelivery: pickupTiming.label,
          serviceTypes: normalizedStore.serviceTypes,
        };

        setSelectedStore(pickupSelection);
        setShippingCost(0);

        localStorage.setItem('clickCollectStore', JSON.stringify({
          deliveryMethod: 'pickup',
          storeId: pickupSelection.storeId,
          storeName: pickupSelection.storeName,
          storeAddress: pickupSelection.storeAddress,
          storePhone: pickupSelection.storePhone,
          estimatedDelivery: pickupSelection.estimatedDelivery,
          serviceTypes: pickupSelection.serviceTypes,
          shippingCost: 0,
        }));
      } catch (error) {
        console.error('Error loading pickup store details:', error);

        const fallbackStore = groupedItems[0]?.product?.affiliateStore as any;
        if (!fallbackStore || isCancelled) return;
        const serviceTypes = await fetchStoreServiceTypes(cartStoreId);
        const normalizedFallbackStore = {
          ...fallbackStore,
          serviceTypes: serviceTypes || fallbackStore.serviceTypes,
        };
        const fallbackTiming = getServiceTiming(normalizedFallbackStore);

        setSelectedStore({
          store: normalizedFallbackStore,
          summary: {
            storeName: cleanDisplayText(normalizedFallbackStore.name, 'Sucursal asignada'),
            address: cleanDisplayText(savedStoreInfo?.storeAddress, 'Direccion disponible al confirmar'),
            phone: cleanDisplayText(savedStoreInfo?.storePhone, 'Telefono no disponible'),
            estimatedDelivery: fallbackTiming.label,
          },
          storeId: normalizedFallbackStore._id || cartStoreId,
          storeName: cleanDisplayText(normalizedFallbackStore.name, 'Sucursal asignada'),
          storeAddress: cleanDisplayText(savedStoreInfo?.storeAddress),
          storePhone: cleanDisplayText(savedStoreInfo?.storePhone),
          estimatedDelivery: fallbackTiming.label,
          serviceTypes: normalizedFallbackStore.serviceTypes,
        });
        setShippingCost(0);
      } finally {
        if (!isCancelled) {
          setIsPickupStoreLoading(false);
        }
      }
    };

    hydratePickupStore();

    return () => {
      isCancelled = true;
    };
  }, [serviceType, cartStoreId, groupedItems, savedStoreInfo]);

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
      // Build base metadata
      const metadata: Metadata = {
        orderNumber: crypto.randomUUID(),
        customerName: user?.fullName ?? "Unknown",
        customerEmail: user?.emailAddresses[0].emailAddress ?? "Unknown",
        clerkUserId: user!.id,
      };

      // Add delivery/pickup info if available
      if (serviceType === 'delivery' && selectedStore) {
        metadata.deliveryMethod = 'home_delivery';
        metadata.pickupStoreId = selectedStore.store?._id || selectedStore._id || selectedStore.storeId;
        metadata.pickupStoreName = selectedStore.store?.name || selectedStore.name || selectedStore.storeName;
        metadata.shippingCost = shippingCost ?? undefined;
        if (customerAddress) {
          metadata.customerAddress = typeof customerAddress === 'string'
            ? customerAddress
            : `${customerAddress.street || ''}, ${customerAddress.postalCode || ''} ${customerAddress.city || ''}, ${customerAddress.state || ''}`;
        }
      } else if (serviceType === 'pickup' && selectedStore) {
        metadata.deliveryMethod = 'click_collect';
        metadata.pickupStoreId = selectedStore.store?._id || selectedStore._id || selectedStore.storeId;
        metadata.pickupStoreName = selectedStore.store?.name || selectedStore.name || selectedStore.storeName;
        metadata.shippingCost = 0;
      }


      const response = await fetch("/api/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: groupedItems, metadata }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        console.error("Error en /api/checkout-session", data);
        throw new Error(data?.error || "Error al crear la sesión de checkout");
      }

      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No se recibió URL de checkout");
      }
    } catch (error) {
      console.error("Error al crear la sesión de checkout", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashOnDeliveryStart = () => {
    setCodError("");
    setCashOnDeliveryPhone((prev) => prev || user?.primaryPhoneNumber?.phoneNumber || "");
    setShowCodPhoneForm(true);
  };

  const handleCashOnDeliverySubmit = async () => {
    if (!isSignedIn || !user) {
      setCodError("Debes iniciar sesión para continuar");
      return;
    }

    if (groupedItems.length === 0) {
      setCodError("Tu carrito está vacío");
      return;
    }

    if (serviceType !== 'delivery') {
      setCodError("Este flujo solo aplica para entrega a domicilio");
      return;
    }

    if (!selectedStore) {
      setCodError("Selecciona una tienda antes de confirmar");
      return;
    }

    if (!customerAddress) {
      setCodError("Selecciona tu dirección antes de confirmar");
      return;
    }

    if (shippingCost === null) {
      setCodError("Falta calcular el costo de envío");
      return;
    }

    if (!cashOnDeliveryPhone.trim()) {
      setCodError("Ingresa tu número de teléfono");
      return;
    }

    setIsLoading(true);
    setCodError("");

    try {
      const timestamp = new Date().getTime();
      const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
      const orderNumber = `COD-${timestamp}-${randomStr}`;

      const payloadItems = groupedItems.map((item) => ({
        product: {
          _id: item.product._id,
          name: item.product.name,
          price: item.product.price,
          optionGroups: item.product.optionGroups,
        },
        quantity: item.quantity,
        customizations: item.customizations ?? {},
        customPrice: item.customPrice ?? item.product.price,
      }));

      const selectedStoreId = selectedStore.store?._id || selectedStore._id || selectedStore.storeId;
      const selectedStoreName = selectedStore.store?.name || selectedStore.name || selectedStore.storeName || savedStoreInfo?.storeName || "Tienda afiliada";
      const selectedStoreAddress = selectedStore.store?.address?.street || selectedStore.address || selectedStore.storeAddress || savedStoreInfo?.storeAddress || "";
      const selectedStorePhone = selectedStore.summary?.phone || selectedStore.storePhone || savedStoreInfo?.storePhone || "";
      const estimatedDelivery = selectedStore.summary?.estimatedDelivery || selectedStore.estimatedDelivery || savedStoreInfo?.estimatedDelivery || "";

      const normalizedAddress = {
        line1: customerAddress.street || customerAddress.line1 || "",
        line2: customerAddress.line2 || "",
        city: customerAddress.city || "",
        state: customerAddress.state || "",
        postal_code: customerAddress.postalCode || customerAddress.postal_code || "",
        country: customerAddress.country || "MX",
      };

      const response = await fetch("/api/create-cod-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: payloadItems,
          metadata: {
            orderNumber,
            customerName: user.fullName || user.firstName || "Cliente",
            customerEmail: user.emailAddresses[0]?.emailAddress || "",
            clerkUserId: user.id,
            phone: cashOnDeliveryPhone.trim(),
            shippingAddress: normalizedAddress,
            storeInfo: {
              storeId: selectedStoreId,
              storeName: selectedStoreName,
              storeAddress: selectedStoreAddress,
              storePhone: selectedStorePhone,
              deliveryMethod: "delivery",
              estimatedDelivery,
            },
          },
          shippingCost,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo procesar la orden.");
      }

      clearBasket();
      window.location.href = `/success-cod?orderNumber=${orderNumber}`;
    } catch (error: any) {
      console.error("Error creating inline COD order:", error);
      setCodError(error.message || "No se pudo procesar la orden.");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePickupStart = () => {
    setPickupError("");
    setPickupPhone((prev) => prev || user?.primaryPhoneNumber?.phoneNumber || "");
    setShowPickupPhoneForm(true);
  };

  const handlePickupPayment = async () => {
    if (!isSignedIn || !user) {
      setPickupError("Debes iniciar sesión para continuar");
      return;
    }

    if (groupedItems.length === 0) {
      setPickupError("Tu carrito está vacío");
      return;
    }

    if (serviceType !== 'pickup') {
      setPickupError("Este flujo solo aplica para retiro en local");
      return;
    }

    if (!selectedStore) {
      setPickupError("Selecciona una tienda antes de confirmar");
      return;
    }

    if (!pickupPhone.trim()) {
      setPickupError("Ingresa tu número de teléfono");
      return;
    }

    setIsLoading(true);
    setPickupError("");

    try {
      const timestamp = new Date().getTime();
      const randomStr = Math.random().toString(36).substring(2, 7).toUpperCase();
      const orderNumber = `PICKUP-${timestamp}-${randomStr}`;

      const payloadItems = groupedItems.map((item) => ({
        product: {
          _id: item.product._id,
          name: item.product.name,
          price: item.product.price,
          optionGroups: item.product.optionGroups,
        },
        quantity: item.quantity,
        customizations: item.customizations ?? {},
        customPrice: item.customPrice ?? item.product.price,
      }));

      const selectedStoreId = selectedStore.store?._id || selectedStore._id || selectedStore.storeId;
      const selectedStoreName = selectedStore.store?.name || selectedStore.name || selectedStore.storeName || savedStoreInfo?.storeName || "Tienda afiliada";
      const selectedStoreAddress = selectedStore.store?.address?.street || selectedStore.address || selectedStore.storeAddress || savedStoreInfo?.storeAddress || "";
      const selectedStorePhone = selectedStore.summary?.phone || selectedStore.storePhone || savedStoreInfo?.storePhone || "";
      const estimatedDelivery = selectedStore.summary?.estimatedDelivery || selectedStore.estimatedDelivery || savedStoreInfo?.estimatedDelivery || "";

      const response = await fetch("/api/create-click-collect-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          customerName: user.fullName || user.firstName || "Cliente",
          customerEmail: user.emailAddresses[0]?.emailAddress || "",
          clerkUserId: user.id,
          phone: pickupPhone.trim(),
          storeId: selectedStoreId,
          storeName: selectedStoreName,
          storeAddress: selectedStoreAddress,
          storePhone: selectedStorePhone,
          estimatedDelivery,
          items: payloadItems,
          total: useBasketStore.getState().getTotalPrice(),
          paymentMethod: "cash_on_pickup",
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo procesar la orden.");
      }

      clearBasket();
      window.location.href = `/success-click-collect?orderNumber=${orderNumber}`;
    } catch (error: any) {
      console.error("Error creating pickup order:", error);
      setPickupError(error.message || "No se pudo procesar la orden.");
    } finally {
      setIsLoading(false);
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
            {groupedItems?.map((item, index) => (
              <div
                key={`${item.product._id}-${index}`}
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
                        onClick={() => useBasketStore.getState().addItem(item)}
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
              <h3 className="text-xl font-bold text-gray-900 mb-4">Resumen de Compra</h3>              

              {isSignedIn ? (
                <div className="space-y-4 mt-6">
                  {/* Paso 1: Tipo de servicio */}
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <span className="w-6 h-6 bg-[#eb1901] text-white rounded-full flex items-center justify-center text-sm">1</span>
                      Servicio
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
                            ? 'border-rose-600 bg-rose-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Truck className={`w-6 h-6 mx-auto mb-1 ${serviceType === 'delivery' ? 'text-rose-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${serviceType === 'delivery' ? 'text-rose-600' : 'text-gray-600'}`}>
                          A Domicilio
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
                            ? 'border-rose-600 bg-rose-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Store className={`w-6 h-6 mx-auto mb-1 ${serviceType === 'pickup' ? 'text-rose-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${serviceType === 'pickup' ? 'text-rose-600' : 'text-gray-600'}`}>
                          Retiro en local
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Paso 2: Información de entrega (solo para delivery) */}
                  {serviceType === 'delivery' && !selectedStore && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <span className="w-6 h-6 bg-[#eb1901] text-white rounded-full flex items-center justify-center text-sm">2</span>
                        Ubicación o Dirección 
                      </h4>
                      <div className="border-2 border-rose-200 rounded-lg bg-white p-4 md:p-6">
                        <ModernDeliveryFlow
                          onComplete={(data) => {
                            
                            setCustomerAddress(data.customerAddress);
                            setSelectedStore(data.selectedStore);
                            setShippingCost(data.shippingCost);
                            
                            const timing = getServiceTiming(data.selectedStore);
                            const payload = {
                              deliveryMethod: 'delivery',
                              storeId: data.selectedStore._id,
                              storeName: data.selectedStore.name,
                              storeAddress: `${data.selectedStore.address.street}, ${data.selectedStore.address.city}`,
                              storePhone: data.selectedStore.phone || '',
                              estimatedDelivery: timing.label,
                              customerAddress: data.customerAddress,
                              shippingCost: data.shippingCost,
                              distanceKm: data.distanceKm,
                              serviceTypes: data.selectedStore.serviceTypes,
                            };
                            
                            localStorage.setItem('clickCollectStore', JSON.stringify(payload));
                            window.dispatchEvent(new Event('storeSelected'));
                            
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
                        <span className="w-6 h-6 bg-[#eb1901] text-white rounded-full flex items-center justify-center text-sm">2</span>
                        Tu sucursal de retiro
                      </h4>
                      <div className="border border-rose-200 rounded-lg bg-white p-4">
                        <p className="hidden">
                          🏪 Selecciona donde recogerás tu pedido
                        </p>
                        <p className="hidden">
                          Tu pedido se retira directamente en sucursal
                        </p>
                        <p className="hidden">
                          No necesitamos tu ubicación. Estamos usando la tienda de tus productos para mostrarte dónde pasar por el pedido.
                        </p>
                        <div className="py-6 flex flex-col items-center justify-center gap-3 text-center">
                          <Loader2 className="w-7 h-7 animate-spin text-[#eb1902]" />
                          <p className="text-sm font-medium text-gray-700">Cargando sucursal de retiro...</p>
                        </div>
                        {false && <SafeLocationBasedStoreSelector
                          onStoreSelected={async (storeData: any) => {
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
                        />}
                              
                      </div>
                    </div>
                  )}

                  {/* Paso 3: Método de pago */}
                  {serviceType && selectedStore && (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <span className="w-6 h-6 bg-[#eb1902] text-white rounded-full flex items-center justify-center text-sm">{serviceType === 'pickup' ? '2' : '3'}</span>
                        {serviceType === 'pickup' ? 'Confirma tu retiro' : 'Método de pago'}
                      </h4>
                      
                      {/* Resumen de entrega para delivery */}
                      {serviceType === 'delivery' && customerAddress && (
                        <div className="mb-4 p-4 border border-rose-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 text-[#70E000] flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-[#000]">Todo listo</p>
                              <p className="text-sm mt-1">
                                {customerAddress.street}, {customerAddress.city}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                Tiempo estimado: {getServiceTiming(selectedStore).label}
                              </p>
                              {getServiceTiming(selectedStore).onDemand && (
                                <p className="text-sm text-amber-700 font-medium mt-1">
                                  On Demand activo: el restaurante tiene alta demanda y tu pedido puede tardar un poco mas.
                                </p>
                              )}
                              <br/>
                              <span className="text-sm font-semibold  mt-1">Subtotal ({groupedItems.reduce((total, item) => total + item.quantity, 0)} {groupedItems.reduce((total, item) => total + item.quantity, 0) === 1 ? 'producto' : 'productos'})</span>
                              <span className="text-sm font-semibold  mt-1"> ${useBasketStore.getState().getTotalPrice().toFixed(2)}</span>
                              {shippingCost !== null && (
                                <p className="text-sm font-semibold  mt-1">
                                  Costo de envío: ${shippingCost} MXN
                                </p>
                              )}
                             <br />
                              <div className="flex items-baseline justify-between pt-3 border-t-2 border-rose-200">
                                <span className="text-sm font-semibold text-gray-700">Total:</span>
                                <span className="text-2xl font-bold text-[#000]">
                                  ${(useBasketStore.getState().getTotalPrice() + (shippingCost ?? 0)).toFixed(2).split('.')[0]}
                                  <span className="text-sm">.{(useBasketStore.getState().getTotalPrice() + (shippingCost ?? 0)).toFixed(2).split('.')[1]}</span>
                                </span>
                              </div>

                            </div>
                          </div>
                        </div>
                      )}

                      {serviceType === 'pickup' && (
                        <div className="mb-4 p-4 border border-rose-200 rounded-lg bg-white">
                          <div className="flex items-start gap-2">
                            <CheckCircle className="w-5 h-5 text-[#70E000] flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-semibold text-[#000]">Todo listo para recoger</p>
                              <p className="text-sm mt-1">{cleanDisplayText(selectedStore.summary?.storeName || selectedStore.storeName, 'Sucursal asignada')}</p>
                              <p className="text-sm text-gray-600 mt-1 flex items-start gap-2">
                                <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#eb1902]" />
                                <span>{cleanDisplayText(selectedStore.summary?.address || selectedStore.storeAddress, 'Direccion no disponible')}</span>
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                Telefono: {cleanDisplayText(selectedStore.summary?.phone || selectedStore.storePhone, 'No disponible')}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                Estara listo aproximadamente en {getServiceTiming(selectedStore).label}.
                              </p>
                              {getServiceTiming(selectedStore).onDemand && (
                                <p className="text-sm text-amber-700 font-medium mt-1">
                                  On Demand activo: el restaurante tiene alta demanda y puede tardar un poco mas.
                                </p>
                              )}
                              <p className="text-sm text-gray-600 mt-1">
                                Pagaras al recoger en esta sucursal.
                              </p>
                              <div className="flex items-baseline justify-between pt-3 border-t-2 border-rose-200 mt-3">
                                <span className="text-sm font-semibold text-gray-700">Total:</span>
                                <span className="text-2xl font-bold text-[#000]">
                                  ${useBasketStore.getState().getTotalPrice().toFixed(2).split('.')[0]}
                                  <span className="text-sm">.{useBasketStore.getState().getTotalPrice().toFixed(2).split('.')[1]}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                       
                      <div className="space-y-2">
                        <button
                          onClick={handleCheckout}
                          disabled={isLoading}
                          className="w-full bg-[#eb1902] text-white px-4 py-3 rounded-lg hover:bg-[#c11300] disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors font-medium"
                        >
                          <CreditCard className="w-5 h-5" />
                          {isLoading ? "Procesando..." : "Pagar con tarjeta"}
                        </button>

                        {serviceType === 'delivery' && (
                          <div className="space-y-2">
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-out ${
                                showCodPhoneForm ? 'max-h-48 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-1'
                              }`}
                            >
                              <div className="space-y-2 rounded-lg border-2 border-[#eb1902] bg-white p-3">
                                <input
                                  type="tel"
                                  inputMode="tel"
                                  autoComplete="tel"
                                  placeholder="Ingresa tu número de teléfono"
                                  value={cashOnDeliveryPhone}
                                  onChange={(e) => {
                                    setCashOnDeliveryPhone(e.target.value);
                                    if (codError) setCodError("");
                                  }}
                                  disabled={isLoading}
                                  className="w-full rounded-lg border-2 border-[#eb1902] px-4 py-3 text-[#eb1902] placeholder:text-[#eb1902]/60 focus:outline-none focus:ring-0 disabled:bg-gray-100"
                                />
                                <button
                                  onClick={handleCashOnDeliverySubmit}
                                  disabled={isLoading}
                                  className="w-full bg-white text-[#eb1902] border-2 border-[#eb1902] px-4 py-3 rounded-lg hover:bg-[#efe7e6] disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors font-medium"
                                >
                                  <Banknote className="w-5 h-5" />
                                  {isLoading ? 'Procesando...' : 'Confirmar pedido'}
                                </button>
                              </div>
                            </div>

                            {!showCodPhoneForm && (
                              <button
                                onClick={handleCashOnDeliveryStart}
                                disabled={isLoading}
                                className="w-full bg-white text-[#eb1902] border-2 border-[#eb1902] px-4 py-3 rounded-lg hover:bg-[#efe7e6] disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors font-medium"
                              >
                                <Banknote className="w-5 h-5" />
                                {isLoading ? 'Procesando...' : 'Pagar al recibir (Efectivo)'}
                              </button>
                            )}

                            {codError && (
                              <p className="text-sm text-[#eb1902] font-medium">{codError}</p>
                            )}
                          </div>
                        )}
                        
                        {serviceType === 'pickup' && (
                          <div className="space-y-2">
                            <div
                              className={`overflow-hidden transition-all duration-300 ease-out ${
                                showPickupPhoneForm ? 'max-h-48 opacity-100 translate-y-0' : 'max-h-0 opacity-0 -translate-y-1'
                              }`}
                            >
                              <div className="space-y-2 rounded-lg border-2 border-green-600 bg-white p-3">
                                <input
                                  type="tel"
                                  inputMode="tel"
                                  autoComplete="tel"
                                  placeholder="Ingresa tu número de teléfono"
                                  value={pickupPhone}
                                  onChange={(e) => {
                                    setPickupPhone(e.target.value);
                                    if (pickupError) setPickupError("");
                                  }}
                                  disabled={isLoading}
                                  className="w-full rounded-lg border-2 border-green-600 px-4 py-3 text-green-600 placeholder:text-green-600/60 focus:outline-none focus:ring-0 disabled:bg-gray-100"
                                />
                                <button
                                  onClick={handlePickupPayment}
                                  disabled={isLoading}
                                  className="w-full bg-white text-green-600 border-2 border-green-600 px-4 py-3 rounded-lg hover:bg-green-50 disabled:bg-gray-100 flex items-center justify-center gap-2 transition-colors font-medium"
                                >
                                  <Banknote className="w-5 h-5" />
                                  {isLoading ? 'Procesando...' : 'Confirmar pedido'}
                                </button>
                              </div>
                            </div>

                            {!showPickupPhoneForm && (
                              <button
                                onClick={handlePickupStart}
                                disabled={isLoading}
                                className="w-full bg-white text-green-600 border-2 border-green-600 px-4 py-3 rounded-lg hover:bg-green-50 disabled:bg-gray-400 flex items-center justify-center gap-2 transition-colors font-medium"
                              >
                                <Banknote className="w-5 h-5" />
                                {isLoading ? 'Procesando...' : 'Pagar en tienda (Efectivo)'}
                              </button>
                            )}

                            {pickupError && (
                              <p className="text-sm text-green-600 font-medium">{pickupError}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}


                  {/* Beneficios */}
                  {serviceType && (
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-xs text-gray-600">
                      <div className="flex items-center justify-center py-2">
                        <Image
                          src="/Powered by Stripe - blurple.svg"
                          alt="Powered by Stripe"
                          width={120}
                          height={40}
                          className="h-auto"
                        />
                      </div>
                      
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
