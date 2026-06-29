"use client";

import type { Metadata } from "@/actions/createCheckoutSession";
import Loader from "@/components/Loader";
import { imageUrl } from "@/lib/imageUrl";
import Image from "next/image";
import useBasketStore from "@/store/store";
import { SignInButton, useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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

import { getStoreOperationalState } from "@/lib/storeOperationalState";

const getStoreOperationalStateLegacy = (storeData: any): ReturnType<typeof getStoreOperationalState> => {
  return getStoreOperationalState(storeData?.store ?? storeData);
};

const fetchStoreServiceTypes = async (storeId: string) => {
  try {
    const response = await fetch(`/api/store-service-types?storeId=${storeId}`, { cache: "no-store" });
    const data = await response.json();
    return data || null;
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
  const [cardError, setCardError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showCardPhoneForm, setShowCardPhoneForm] = useState(false);
  const [cardPhone, setCardPhone] = useState("");
  const [cardWhatsappConsent, setCardWhatsappConsent] = useState(false);
  const [cardPhoneError, setCardPhoneError] = useState("");
  const [editingPhone, setEditingPhone] = useState(false);
  const checkoutRef = useRef<any>(null);
  const stripeContainerRef = useRef<HTMLDivElement>(null);

  // Derive persisted phone & consent from Clerk publicMetadata (cross-device)
  const clerkPhone = (user?.publicMetadata?.phone as string) ?? "";
  const clerkConsent = (user?.publicMetadata?.whatsappConsent as boolean) ?? false;
  const hasPhoneAndConsent = clerkPhone.length === 10 && clerkConsent;

  // Helper: save phone + consent to Clerk publicMetadata AND localStorage
  const savePhoneToClerk = async (phone: string, consent: boolean) => {
    const digits = phone.replace(/\D/g, "").slice(-10);
    // Optimistic localStorage fallback
    localStorage.setItem("customerPhone", digits);
    try {
      await fetch("/api/user/save-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits, whatsappConsent: consent }),
      });
    } catch (e) {
      console.warn("[savePhoneToClerk] Could not persist to Clerk:", e);
    }
  };

  // Cargar Stripe y montar Checkout embebido en la misma página
  useEffect(() => {
    if (!clientSecret) return;

    let active = true;

    const loadStripeCheckout = async () => {
      // 1. Asegurar que el script de Stripe esté cargado
      if (!(window as any).Stripe) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://js.stripe.com/v3/";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Error al cargar Stripe.js"));
          document.head.appendChild(script);
        });
      }

      if (!active) return;

      try {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
        if (!publishableKey) {
          console.error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY no está configurada");
          return;
        }
        
        const stripe = (window as any).Stripe(publishableKey);
        
        // Desmontar si ya existía uno previo
        if (checkoutRef.current) {
          checkoutRef.current.destroy();
          checkoutRef.current = null;
        }

        const checkout = await stripe.initEmbeddedCheckout({
          clientSecret,
        });

        if (!active) {
          checkout.destroy();
          return;
        }

        // Wait for container to be in the DOM and use it
        let element = stripeContainerRef.current;
        if (!element) {
          element = document.getElementById("stripe-checkout-container") as HTMLDivElement;
        }

        if (!element) {
          console.error("No se encontró el contenedor (#stripe-checkout-container) para montar el Checkout de Stripe");
          return;
        }

        checkout.mount(element);
        checkoutRef.current = checkout;
      } catch (err) {
        console.error("Error al inicializar Checkout embebido:", err);
      }
    };

    loadStripeCheckout();

    return () => {
      active = false;
      if (checkoutRef.current) {
        checkoutRef.current.destroy();
        checkoutRef.current = null;
      }
    };
  }, [clientSecret]);

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
    
    // Precargar teléfono guardado: Clerk tiene prioridad, localStorage como fallback
    const savedPhone = localStorage.getItem("customerPhone");
    const initialPhone = savedPhone || "";
    if (initialPhone) {
      setCardPhone(initialPhone);
      setCashOnDeliveryPhone(initialPhone);
      setPickupPhone(initialPhone);
    }

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

        const storeConfig = await fetchStoreServiceTypes(cartStoreId);
        const normalizedStore = {
          ...store,
          serviceTypes: storeConfig?.serviceTypes || store.serviceTypes,
          isOpen: storeConfig?.isOpen ?? store.isOpen ?? true,
          manualOperationalStatus:
            storeConfig?.manualOperationalStatus ?? store.manualOperationalStatus ?? "auto",
          highDemandMode:
            storeConfig?.highDemandMode ?? store.highDemandMode ?? store.serviceTypes?.onDemand ?? false,
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
          isOpen: normalizedStore.isOpen,
          manualOperationalStatus: normalizedStore.manualOperationalStatus,
          highDemandMode: normalizedStore.highDemandMode,
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
          isOpen: pickupSelection.isOpen,
          manualOperationalStatus: pickupSelection.manualOperationalStatus,
          highDemandMode: pickupSelection.highDemandMode,
          shippingCost: 0,
        }));
      } catch (error) {
        console.error('Error loading pickup store details:', error);

        const fallbackStore = groupedItems[0]?.product?.affiliateStore as any;
        if (!fallbackStore || isCancelled) return;
        const storeConfig = await fetchStoreServiceTypes(cartStoreId);
        const normalizedFallbackStore = {
          ...fallbackStore,
          serviceTypes: storeConfig?.serviceTypes || fallbackStore.serviceTypes,
          isOpen: storeConfig?.isOpen ?? fallbackStore.isOpen ?? true,
          manualOperationalStatus:
            storeConfig?.manualOperationalStatus ?? fallbackStore.manualOperationalStatus ?? "auto",
          highDemandMode:
            storeConfig?.highDemandMode ?? fallbackStore.highDemandMode ?? fallbackStore.serviceTypes?.onDemand ?? false,
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
          isOpen: normalizedFallbackStore.isOpen,
          manualOperationalStatus: normalizedFallbackStore.manualOperationalStatus,
          highDemandMode: normalizedFallbackStore.highDemandMode,
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

  const handleCardPhoneStart = () => {
    setCardPhoneError("");
    setShowCardPhoneForm(true);
    setEditingPhone(false);
  };

  const handleCheckout = async (overridePhone?: string) => {
    if (!isSignedIn) return;
    if (selectedStore && !getStoreOperationalStateLegacy(selectedStore).effectiveIsOpen) {
      setCardPhoneError("La tienda seleccionada esta cerrada temporalmente.");
      return;
    }

    // Determine the phone to use: override > form input > saved Clerk phone
    const phoneToUse = overridePhone ?? (hasPhoneAndConsent && !editingPhone ? clerkPhone : cardPhone);
    const digitsOnly = phoneToUse.replace(/\D/g, "");

    if (digitsOnly.length < 10) {
      setCardPhoneError("Ingresa un número de teléfono válido de 10 dígitos");
      return;
    }

    // If editing, require explicit consent checkbox
    if (editingPhone && !cardWhatsappConsent) {
      setCardPhoneError("Debes aceptar recibir notificaciones por WhatsApp para continuar");
      return;
    }

    setIsLoading(true);
    setCardError("");

    try {
      const subtotal = useBasketStore.getState().getTotalPrice();
      const totalAmount = subtotal + (serviceType === 'delivery' ? (shippingCost ?? 0) : 0);
      if (totalAmount < 10) {
        setCardError("El monto total mínimo para pagar con tarjeta es de $10.00 MXN. Por favor agrega más productos o selecciona un método de pago en efectivo.");
        setIsLoading(false);
        return;
      }

      // Build base metadata
      const metadata: Metadata = {
        orderNumber: crypto.randomUUID(),
        customerName: user?.fullName ?? "Unknown",
        customerEmail: user?.emailAddresses[0].emailAddress ?? "Unknown",
        clerkUserId: user!.id,
        phone: `52${digitsOnly.slice(-10)}`,
        whatsappConsent: "true",
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
        const backendError = data?.details?.message || data?.error || "Error al crear la sesión de checkout";
        throw new Error(backendError);
      }

      if (data?.clientSecret) {
        // Persist phone + consent to Clerk (cross-device) & localStorage (offline fallback)
        await savePhoneToClerk(digitsOnly, true);
        setEditingPhone(false);
        setShowCardPhoneForm(false);
        setClientSecret(data.clientSecret);
      } else {
        throw new Error("No se recibió clientSecret de checkout");
      }
    } catch (error: any) {
      console.error("Error al crear la sesión de checkout", error);
      setCardError(error?.message || "Error al crear la sesión de checkout. Inténtalo de nuevo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCashOnDeliveryStart = () => {
    setCodError("");
    setCashOnDeliveryPhone((prev) => prev || clerkPhone || user?.primaryPhoneNumber?.phoneNumber || "");
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

    if (!getStoreOperationalStateLegacy(selectedStore).effectiveIsOpen) {
      setCodError("La tienda seleccionada esta cerrada temporalmente.");
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
            phone: (hasPhoneAndConsent && !showCodPhoneForm ? clerkPhone : cashOnDeliveryPhone).trim(),
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

      // Persist phone to Clerk for cross-device use
      const codPhone = hasPhoneAndConsent && !showCodPhoneForm ? clerkPhone : cashOnDeliveryPhone.trim();
      await savePhoneToClerk(codPhone, true);
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
    setPickupPhone((prev) => prev || clerkPhone || user?.primaryPhoneNumber?.phoneNumber || "");
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

    if (!getStoreOperationalStateLegacy(selectedStore).effectiveIsOpen) {
      setPickupError("La sucursal seleccionada no esta disponible en este momento.");
      return;
    }

    const resolvedPickupPhone = hasPhoneAndConsent && !showPickupPhoneForm ? clerkPhone : pickupPhone.trim();
    if (!resolvedPickupPhone) {
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
          phone: resolvedPickupPhone,
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

      // Persist phone to Clerk for cross-device use
      await savePhoneToClerk(resolvedPickupPhone, true);
      clearBasket();
      window.location.href = `/success-click-collect?orderNumber=${orderNumber}`;
    } catch (error: any) {
      console.error("Error creating pickup order:", error);
      setPickupError(error.message || "No se pudo procesar la orden.");
    } finally {
      setIsLoading(false);
    }
  };

  const selectedStoreTiming = selectedStore ? getServiceTiming(selectedStore) : null;
  const selectedStoreState = selectedStore ? getStoreOperationalStateLegacy(selectedStore) : null;
  const isSelectedStoreClosed = Boolean(selectedStore && selectedStoreState && !selectedStoreState.effectiveIsOpen);

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
          <div className="w-full lg:w-[420px] xl:w-[480px] lg:sticky lg:top-24 h-fit">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5 md:p-6">
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
                          setClientSecret(null);
                          setShowCardPhoneForm(false);
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
                          setClientSecret(null);
                          setShowCardPhoneForm(false);
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
                            setClientSecret(null);
                            
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
                              isOpen: data.selectedStore.isOpen ?? true,
                              manualOperationalStatus: data.selectedStore.manualOperationalStatus ?? "auto",
                              highDemandMode:
                                data.selectedStore.highDemandMode ?? data.selectedStore.serviceTypes?.onDemand ?? false,
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
                                Tiempo estimado: {selectedStoreTiming?.label}
                              </p>
                              {selectedStoreState?.highDemandMode && (
                                <p className="text-sm text-amber-700 font-medium mt-1">
                                  Alta Demanda activa: el restaurante tiene alta demanda y tu pedido puede tardar un poco mas.
                                </p>
                              )}
                              {isSelectedStoreClosed && (
                                <p className="text-sm text-red-700 font-semibold mt-2">
                                  Tienda cerrada: esta sucursal no esta aceptando pedidos nuevos en este momento.
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
                                Estara listo aproximadamente en {selectedStoreTiming?.label}.
                              </p>
                              {selectedStoreState?.highDemandMode && (
                                <p className="text-sm text-amber-700 font-medium mt-1">
                                  Alta Demanda activa: el restaurante tiene alta demanda y puede tardar un poco mas.
                                </p>
                              )}
                              {isSelectedStoreClosed && (
                                <p className="text-sm text-red-700 font-semibold mt-2">
                                  Tienda cerrada: esta sucursal no esta disponible para retiro en este momento.
                                </p>
                              )}
                              <p className="text-sm text-gray-600 mt-1">
                                {clientSecret 
                                  ? "Pagarás en línea de forma segura con tu tarjeta."
                                  : "Puedes pagar en línea con tarjeta o al recoger en sucursal."
                                }
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
                       
                      {isSelectedStoreClosed ? (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                          <span className="font-semibold block mb-1">Tienda no disponible</span>
                          La tienda seleccionada esta cerrada temporalmente. Cambia de servicio o espera a que vuelva a abrir para continuar.
                        </div>
                      ) : clientSecret ? (
                        <div className="space-y-3">
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-800">
                            <span className="font-semibold block mb-1">Pago seguro con tarjeta:</span>
                            Completa los detalles de tu tarjeta a continuación para finalizar tu pedido.
                          </div>
                          
                          {/* Contenedor de Stripe Embedded Checkout */}
                          <div ref={stripeContainerRef} id="stripe-checkout-container" className="mt-4 bg-white rounded-xl w-full min-h-[400px] -mx-1 sm:mx-0"></div>

                          <button
                            onClick={() => {
                              setClientSecret(null);
                              setShowCardPhoneForm(false);
                            }}
                            className="w-full text-center text-sm font-semibold text-[#eb1902] hover:text-rose-800 underline pt-2"
                          >
                            Cancelar y volver a métodos de pago
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-3">

                          {/* ── TARJETA ── */}
                          {hasPhoneAndConsent && !editingPhone ? (
                            /* Usuario ya tiene teléfono guardado: mostrar pastilla y proceder directo */
                            <div className="space-y-2">
                              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-lg">
                                    📱
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium text-emerald-700">WhatsApp confirmado</p>
                                    <p className="text-sm font-bold text-emerald-900 tracking-wide">
                                      +52 {clerkPhone.slice(0, 3)} {clerkPhone.slice(3, 6)} {clerkPhone.slice(6)}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingPhone(true);
                                    setCardPhone(clerkPhone);
                                    setCardWhatsappConsent(false);
                                    setCardPhoneError("");
                                  }}
                                  className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 underline underline-offset-2 transition-colors"
                                >
                                  Cambiar
                                </button>
                              </div>
                              {cardPhoneError && (
                                <p className="text-xs text-[#eb1902] font-medium">{cardPhoneError}</p>
                              )}
                              <button
                                onClick={() => handleCheckout(clerkPhone)}
                                disabled={isLoading}
                                className="w-full bg-[#eb1902] text-white px-4 py-3.5 rounded-xl hover:bg-[#c11300] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm"
                              >
                                <CreditCard className="w-5 h-5" />
                                {isLoading ? "Procesando..." : "Pagar con tarjeta"}
                              </button>
                            </div>
                          ) : showCardPhoneForm || editingPhone ? (
                            /* Formulario de captura/edición de teléfono */
                            <div className="space-y-3 rounded-xl border-2 border-[#eb1902] bg-white p-4 shadow-sm">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-gray-800">
                                  {editingPhone ? "Actualiza tu número de WhatsApp" : "Número para notificaciones de WhatsApp"}
                                </p>
                              </div>

                              <div className="flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 focus-within:border-[#eb1902] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#eb1902]/20 transition-all">
                                <span className="text-sm font-semibold text-gray-600 whitespace-nowrap select-none">🇲🇽 +52</span>
                                <div className="w-px h-4 bg-gray-300 mx-1" />
                                <input
                                  type="tel"
                                  inputMode="numeric"
                                  autoComplete="tel-national"
                                  maxLength={10}
                                  placeholder="1234567890"
                                  value={cardPhone}
                                  onChange={(e) => {
                                    setCardPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                                    if (cardPhoneError) setCardPhoneError("");
                                  }}
                                  disabled={isLoading}
                                  className="flex-1 bg-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
                                />
                                {cardPhone.replace(/\D/g, "").length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => { setCardPhone(""); setCardPhoneError(""); }}
                                    className="ml-1 text-gray-400 hover:text-gray-600 transition-colors"
                                    aria-label="Limpiar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </div>

                              <label className="flex items-start gap-2.5 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={cardWhatsappConsent}
                                  onChange={(e) => {
                                    setCardWhatsappConsent(e.target.checked);
                                    if (cardPhoneError) setCardPhoneError("");
                                  }}
                                  className="mt-0.5 h-4 w-4 accent-[#eb1902] cursor-pointer"
                                />
                                <span className="text-xs text-gray-600 leading-relaxed group-hover:text-gray-800 transition-colors">
                                  Acepto recibir notificaciones de mi pedido por WhatsApp al número indicado
                                </span>
                              </label>

                              {cardPhoneError && (
                                <div className="flex items-center gap-1.5 text-xs text-[#eb1902] font-medium">
                                  <span>⚠</span> {cardPhoneError}
                                </div>
                              )}

                              <div className="flex gap-2 pt-1">
                                {editingPhone && (
                                  <button
                                    type="button"
                                    onClick={() => { setEditingPhone(false); setCardPhoneError(""); }}
                                    disabled={isLoading}
                                    className="flex-1 border-2 border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl hover:border-gray-300 hover:text-gray-800 transition-colors font-medium text-sm"
                                  >
                                    Cancelar
                                  </button>
                                )}
                                <button
                                  onClick={() => handleCheckout()}
                                  disabled={isLoading}
                                  className="flex-1 bg-[#eb1902] text-white px-4 py-2.5 rounded-xl hover:bg-[#c11300] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors font-semibold text-sm shadow-sm"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  {isLoading ? "Procesando..." : "Continuar al pago"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Botón inicial para pagar con tarjeta */
                            <button
                              onClick={handleCardPhoneStart}
                              disabled={isLoading}
                              className="w-full bg-[#eb1902] text-white px-4 py-3.5 rounded-xl hover:bg-[#c11300] disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm"
                            >
                              <CreditCard className="w-5 h-5" />
                              {isLoading ? "Procesando..." : "Pagar con tarjeta"}
                            </button>
                          )}

                          {cardError && (
                            <div className="flex items-start gap-2 text-sm text-[#eb1902] font-medium bg-rose-50 border border-rose-200 rounded-xl p-3">
                              <span>{cardError}</span>
                            </div>
                          )}

                          {/* ── PAGO AL RECIBIR (delivery) ── */}
                          {serviceType === 'delivery' && (
                            <div className="space-y-2">
                              {hasPhoneAndConsent && !showCodPhoneForm ? (
                                /* Ya tiene teléfono guardado: pastilla + botón directo */
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
                                    <div className="flex items-center gap-2 text-xs text-gray-600">
                                      <span className="font-medium">
                                        +52 {clerkPhone.slice(0, 3)} {clerkPhone.slice(3, 6)} {clerkPhone.slice(6)}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handleCashOnDeliveryStart}
                                      className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                                    >
                                      Cambiar
                                    </button>
                                  </div>
                                  <button
                                    onClick={handleCashOnDeliverySubmit}
                                    disabled={isLoading}
                                    className="w-full bg-white text-[#eb1902] border-2 border-[#eb1902] px-4 py-3.5 rounded-xl hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm"
                                  >
                                    <Banknote className="w-5 h-5" />
                                    {isLoading ? 'Procesando...' : 'Pagar al recibir (Efectivo)'}
                                  </button>
                                </div>
                              ) : (
                                /* Formulario de teléfono para COD */
                                <div
                                  className={`overflow-hidden transition-all duration-300 ease-out ${
                                    showCodPhoneForm ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'
                                  }`}
                                >
                                  <div className="space-y-3 rounded-xl border-2 border-[#eb1902] bg-white p-4 shadow-sm">
                                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                      <span>📱</span> Teléfono de contacto
                                    </p>
                                    <div className="flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 focus-within:border-[#eb1902] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#eb1902]/20 transition-all">
                                      <span className="text-sm font-semibold text-gray-600 whitespace-nowrap select-none">🇲🇽 +52</span>
                                      <div className="w-px h-4 bg-gray-300 mx-1" />
                                      <input
                                        type="tel"
                                        inputMode="numeric"
                                        autoComplete="tel-national"
                                        maxLength={10}
                                        placeholder="4421234567"
                                        value={cashOnDeliveryPhone.replace(/\D/g, "").slice(0, 10)}
                                        onChange={(e) => {
                                          setCashOnDeliveryPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                                          if (codError) setCodError("");
                                        }}
                                        disabled={isLoading}
                                        className="flex-1 bg-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
                                      />
                                    </div>
                                    {codError && (
                                      <p className="text-xs text-[#eb1902] font-medium flex items-center gap-1"><span>⚠</span>{codError}</p>
                                    )}
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setShowCodPhoneForm(false)}
                                        disabled={isLoading}
                                        className="flex-1 border-2 border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl hover:border-gray-300 transition-colors font-medium text-sm"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={handleCashOnDeliverySubmit}
                                        disabled={isLoading}
                                        className="flex-1 bg-[#eb1902] text-white border-2 border-[#eb1902] px-3 py-2.5 rounded-xl hover:bg-[#c11300] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-semibold text-sm"
                                      >
                                        <Banknote className="w-4 h-4" />
                                        {isLoading ? 'Procesando...' : 'Confirmar'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {!hasPhoneAndConsent && !showCodPhoneForm && (
                                <button
                                  onClick={handleCashOnDeliveryStart}
                                  disabled={isLoading}
                                  className="w-full bg-white text-[#eb1902] border-2 border-[#eb1902] px-4 py-3.5 rounded-xl hover:bg-rose-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm"
                                >
                                  <Banknote className="w-5 h-5" />
                                  {isLoading ? 'Procesando...' : 'Pagar al recibir (Efectivo)'}
                                </button>
                              )}

                              {codError && !showCodPhoneForm && (
                                <p className="text-sm text-[#eb1902] font-medium flex items-center gap-1"><span>⚠</span>{codError}</p>
                              )}
                            </div>
                          )}

                          {/* ── PAGO EN TIENDA (pickup) ── */}
                          {serviceType === 'pickup' && (
                            <div className="space-y-2">
                              {hasPhoneAndConsent && !showPickupPhoneForm ? (
                                /* Ya tiene teléfono guardado: pastilla + botón directo */
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5">
                                    <div className="flex items-center gap-2 text-xs text-gray-600">
                                      <span>📱</span>
                                      <span className="font-medium">
                                        +52 {clerkPhone.slice(0, 3)} {clerkPhone.slice(3, 6)} {clerkPhone.slice(6)}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={handlePickupStart}
                                      className="text-xs font-semibold text-gray-500 hover:text-gray-800 underline underline-offset-2 transition-colors"
                                    >
                                      Cambiar
                                    </button>
                                  </div>
                                  <button
                                    onClick={handlePickupPayment}
                                    disabled={isLoading}
                                    className="w-full bg-white text-green-700 border-2 border-green-600 px-4 py-3.5 rounded-xl hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm"
                                  >
                                    <Banknote className="w-5 h-5" />
                                    {isLoading ? 'Procesando...' : 'Pagar en tienda (Efectivo)'}
                                  </button>
                                </div>
                              ) : (
                                /* Formulario de teléfono para pickup */
                                <div
                                  className={`overflow-hidden transition-all duration-300 ease-out ${
                                    showPickupPhoneForm ? 'max-h-72 opacity-100' : 'max-h-0 opacity-0'
                                  }`}
                                >
                                  <div className="space-y-3 rounded-xl border-2 border-green-600 bg-white p-4 shadow-sm">
                                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                      <span>📱</span> Teléfono de contacto
                                    </p>
                                    <div className="flex items-center gap-2 rounded-lg border-2 border-gray-200 bg-gray-50 px-3 py-2.5 focus-within:border-green-600 focus-within:bg-white focus-within:ring-2 focus-within:ring-green-600/20 transition-all">
                                      <span className="text-sm font-semibold text-gray-600 whitespace-nowrap select-none">🇲🇽 +52</span>
                                      <div className="w-px h-4 bg-gray-300 mx-1" />
                                      <input
                                        type="tel"
                                        inputMode="numeric"
                                        autoComplete="tel-national"
                                        maxLength={10}
                                        placeholder="4421234567"
                                        value={pickupPhone.replace(/\D/g, "").slice(0, 10)}
                                        onChange={(e) => {
                                          setPickupPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                                          if (pickupError) setPickupError("");
                                        }}
                                        disabled={isLoading}
                                        className="flex-1 bg-transparent text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
                                      />
                                    </div>
                                    {pickupError && (
                                      <p className="text-xs text-green-700 font-medium flex items-center gap-1"><span>⚠</span>{pickupError}</p>
                                    )}
                                    <div className="flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setShowPickupPhoneForm(false)}
                                        disabled={isLoading}
                                        className="flex-1 border-2 border-gray-200 text-gray-600 px-3 py-2.5 rounded-xl hover:border-gray-300 transition-colors font-medium text-sm"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={handlePickupPayment}
                                        disabled={isLoading}
                                        className="flex-1 bg-green-600 text-white px-3 py-2.5 rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors font-semibold text-sm"
                                      >
                                        <Banknote className="w-4 h-4" />
                                        {isLoading ? 'Procesando...' : 'Confirmar'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {!hasPhoneAndConsent && !showPickupPhoneForm && (
                                <button
                                  onClick={handlePickupStart}
                                  disabled={isLoading}
                                  className="w-full bg-white text-green-700 border-2 border-green-600 px-4 py-3.5 rounded-xl hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 transition-colors font-semibold shadow-sm"
                                >
                                  <Banknote className="w-5 h-5" />
                                  {isLoading ? 'Procesando...' : 'Pagar en tienda (Efectivo)'}
                                </button>
                              )}

                              {pickupError && !showPickupPhoneForm && (
                                <p className="text-sm text-green-700 font-medium flex items-center gap-1"><span>⚠</span>{pickupError}</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
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









