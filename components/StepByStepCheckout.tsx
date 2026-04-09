"use client";

import { useState, useEffect } from "react";
import { Check, ChevronRight, ArrowLeft, ShoppingCart, MapPin, CreditCard, User, Navigation } from "lucide-react";
import { useAuth, useUser, SignInButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import SimpleAddressInputFixed from './SimpleAddressInputFixed';
import { SafeLocationBasedStoreSelector } from './SafeLocationBasedStoreSelector';
import type { Metadata } from "@/actions/createCheckoutSession";
import InteractiveLocationPicker from './InteractiveLocationPicker';
import ServiceTypeSelector from './ServiceTypeSelector';

interface StepByStepCheckoutProps {
  groupedItems: Array<{
    product: {
      _id: string;
      name?: string;
      price?: number;
      image?: {
        asset: {
          _ref: string;
        };
      };
      slug?: { current: string };
      affiliateStore?: { _id: string };
    };
    quantity: number;
  }>;
  totalPrice: number;
  cartStoreId?: string;
  forceStartFromStep1?: boolean; // Nueva prop para forzar inicio
  onCheckoutComplete?: () => void; // Callback cuando se completa el checkout
  restrictedServiceType?: 'delivery' | 'pickup'; // Restringir a un tipo específico
}

interface SavedStoreInfo {
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  estimatedDelivery: string;
  deliveryMethod?: 'delivery' | 'pickup';
  customerAddress?: {
    formatted_address?: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  };
  shippingCost?: number;
  timestamp?: number; // Para validar sesión
}

interface StoreData {
  store: {
    _id: string;
    name: string;
    distanceKm?: number;
    address: {
      street: string;
      city: string;
      state: string;
    };
    contact?: {
      phone?: string;
    };
  };
  summary: {
    storeName: string;
    distance: string;
    estimatedDelivery: string;
    address: string;
    phone: string;
  };
}

const steps = [
  { id: 1, name: 'Tipo de Servicio', icon: ShoppingCart, description: 'Elige cómo quieres recibir tu pedido' },
  { id: 2, name: 'Ubicación', icon: MapPin, description: 'Confirma tu dirección o tienda' },
  { id: 3, name: 'Método de Pago', icon: CreditCard, description: 'Selecciona cómo pagar' },
];

export default function StepByStepCheckout({ 
  groupedItems, 
  totalPrice, 
  cartStoreId, 
  forceStartFromStep1 = false,
  onCheckoutComplete,
  restrictedServiceType
}: StepByStepCheckoutProps) {
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [serviceType, setServiceType] = useState<'delivery' | 'pickup' | null>(null);
  const [savedStoreInfo, setSavedStoreInfo] = useState<SavedStoreInfo | null>(null);
  const [customerAddress, setCustomerAddress] = useState<unknown | null>(null);
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<LocationData | null>(null);

  interface LocationData {
    formatted_address?: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    latitude?: number;
    longitude?: number;
  }

  // Cargar datos guardados
  useEffect(() => {
    console.log('🔍 StepByStepCheckout useEffect ejecutándose...');
    console.log('🚀 forceStartFromStep1:', forceStartFromStep1);
    
    // Si se fuerza el inicio desde el paso 1, limpiar todo y empezar
    if (forceStartFromStep1) {
      console.log('🔄 Forzando inicio desde paso 1...');
      localStorage.removeItem('clickCollectStore');
      setCurrentStep(1);
      setCompletedSteps([]);
      setSavedStoreInfo(null);
      setServiceType(null);
      setCustomerAddress(null);
      setShippingCost(null);
      return;
    }
    
    const saved = localStorage.getItem('clickCollectStore');
    console.log('📦 Datos en localStorage:', saved);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        console.log('� Datos aparseados:', parsed);
        
        // IMPORTANTE: Solo restaurar si es la misma sesión de checkout
        // Verificar si los datos son realmente válidos y recientes
        const isValidSession = parsed.deliveryMethod && 
                              parsed.storeId && 
                              parsed.storeName &&
                              // Agregar verificación de timestamp para evitar datos antiguos
                              parsed.timestamp && 
                              (Date.now() - parsed.timestamp) < 30 * 60 * 1000; // 30 minutos
        
        console.log('✅ ¿Sesión válida?', isValidSession);
        
        if (isValidSession) {
          console.log('🔄 Restaurando sesión válida...');
          setSavedStoreInfo(parsed);
          setServiceType(parsed.deliveryMethod);
          setCustomerAddress(parsed.customerAddress || null);
          setShippingCost(parsed.shippingCost ?? null);
          setCompletedSteps([1, 2]);
          setCurrentStep(3);
        } else {
          console.log('🗑️ Limpiando datos inválidos o antiguos...');
          localStorage.removeItem('clickCollectStore');
          setCurrentStep(1);
          setCompletedSteps([]);
        }
      } catch (error) {
        console.error('❌ Error parsing saved store:', error);
        localStorage.removeItem('clickCollectStore');
        setCurrentStep(1);
        setCompletedSteps([]);
      }
    } else {
      console.log('🆕 No hay datos guardados, empezando desde el paso 1');
      setCurrentStep(1);
      setCompletedSteps([]);
    }

    const handleStoreSelected = () => {
      console.log('🎯 Evento storeSelected recibido');
      const saved = localStorage.getItem('clickCollectStore');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          console.log('📦 Datos recuperados del localStorage:', parsed);
          
          setSavedStoreInfo(parsed);
          setShippingCost(parsed.shippingCost ?? null);
          setCompletedSteps(prev => [...new Set([...prev, 1, 2])]);
          setCurrentStep(3);
          
          console.log('✅ Avanzando al paso 3 (Método de Pago)');
        } catch (error) {
          console.error('❌ Error parsing saved store data:', error);
        }
      } else {
        console.warn('⚠️ No hay datos guardados en localStorage');
      }
    };

    window.addEventListener('storeSelected', handleStoreSelected);
    return () => window.removeEventListener('storeSelected', handleStoreSelected);
  }, [forceStartFromStep1]);

  const handleServiceTypeSelect = (type: 'delivery' | 'pickup') => {
    setServiceType(type);
    setCompletedSteps(prev => [...new Set([...prev, 1])]);
    setCurrentStep(2);
  };

  const handleBackStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            address: 'Ubicación actual',
            city: '',
            state: '',
            postal_code: '',
            country: '',
            formatted_address: 'Ubicación detectada automáticamente'
          };
          
          setSelectedAddress(locationData);
          setShowLocationPicker(true);
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('No se pudo obtener tu ubicación. Por favor, ingresa tu dirección manualmente.');
        }
      );
    } else {
      alert('Tu navegador no soporta geolocalización.');
    }
  };

  const handleLocationConfirmed = async (locationData: LocationData) => {
    try {
      setCustomerAddress(locationData);
      setShowLocationPicker(false);
      
      // Validar que tenemos coordenadas
      if (!locationData.latitude || !locationData.longitude) {
        alert('Error: No se pudieron obtener las coordenadas de la ubicación.');
        return;
      }
      
      // Buscar tienda más cercana usando la API
      const requestBody: {
        latitude: string;
        longitude: string;
        filterStoreId?: string;
        address?: {
          street: string;
          city: string;
          state: string;
          postalCode: string;
          country: string;
          latitude: number;
          longitude: number;
        };
      } = {
        latitude: locationData.latitude.toString(),
        longitude: locationData.longitude.toString(),
        filterStoreId: cartStoreId,
      };

      // Solo agregar address si tenemos datos válidos
      if (locationData.address && locationData.city) {
        requestBody.address = {
          street: locationData.address,
          city: locationData.city,
          state: locationData.state || 'Querétaro',
          postalCode: locationData.postal_code || '',
          country: locationData.country || 'México',
          latitude: locationData.latitude,
          longitude: locationData.longitude
        };
      }

      console.log('Sending request to API:', requestBody); // Debug log

      const response = await fetch('/api/nearest-store', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('API Response:', data); // Debug log
        
        if (data.success && data.data?.stores && Array.isArray(data.data.stores) && data.data.stores.length > 0) {
          const nearestStore = data.data.stores[0];
          
          // Validar que la tienda tiene la estructura esperada
          if (!nearestStore._id || !nearestStore.name) {
            console.error('Invalid store data:', nearestStore);
            alert('Error: Datos de tienda inválidos.');
            return;
          }
          
          const deliveryMinutes = nearestStore.distanceKm <= 2 ? 20 : 
                                nearestStore.distanceKm <= 5 ? 30 : 
                                nearestStore.distanceKm <= 10 ? 45 : 60;
          const shippingCostCalculated = nearestStore.distanceKm <= 3 ? 25 :
                                       nearestStore.distanceKm <= 7 ? 35 :
                                       nearestStore.distanceKm <= 15 ? 50 : 70;
          
          const payload: SavedStoreInfo = {
            deliveryMethod: 'delivery' as const,
            storeId: nearestStore._id,
            storeName: nearestStore.name,
            storeAddress: nearestStore.address ? 
              `${nearestStore.address.street || ''}, ${nearestStore.address.city || ''}`.trim() : 
              'Dirección no disponible',
            storePhone: nearestStore.contact?.phone || 'No disponible',
            estimatedDelivery: `Listo en ${deliveryMinutes} minutos`,
            customerAddress: locationData,
            shippingCost: shippingCostCalculated,
            timestamp: Date.now() // Agregar timestamp para validar sesión
          };
          
          setShippingCost(shippingCostCalculated);
          setSavedStoreInfo(payload);
          localStorage.setItem('clickCollectStore', JSON.stringify(payload));
          window.dispatchEvent(new Event('storeSelected'));
          
          // Marcar pasos como completados y avanzar al siguiente paso
          setCompletedSteps(prev => [...new Set([...prev, 1, 2])]);
          setCurrentStep(3);
        } else {
          console.log('No stores found or invalid response structure:', data);
          alert('No se encontraron tiendas cercanas a tu ubicación. Intenta con una dirección más específica.');
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Error de respuesta' }));
        console.error('API Error:', errorData);
        alert(`Error buscando tiendas: ${errorData.error || 'Error desconocido'}`);
      }
    } catch (error) {
      console.error('Error completo en handleLocationConfirmed:', error);
      alert('Error de conexión. Por favor intenta de nuevo.');
    }
  };

  const handleCheckout = async (paymentMethod: 'card' | 'cod') => {
    console.log('🎯 handleCheckout iniciado con:', paymentMethod);
    console.log('🔐 isSignedIn:', isSignedIn);
    console.log('⏳ isLoading:', isLoading);
    console.log('👤 user:', user ? 'Presente' : 'Ausente');
    console.log('🏪 savedStoreInfo:', savedStoreInfo ? 'Presente' : 'Ausente');
    
    if (!isSignedIn) {
      console.log('❌ Usuario no autenticado - terminando función');
      return;
    }
    
    console.log('⏳ Estableciendo isLoading a true...');
    setIsLoading(true);

    try {
      if (paymentMethod === 'card') {
        console.log('💳 Procesando pago con tarjeta...');
        
        // Obtener información de envío del localStorage
        const savedStore = localStorage.getItem('clickCollectStore');
        let deliveryMethod = 'delivery';
        let shippingCostForStripe = 0;
        let pickupStoreId = undefined;
        let pickupStoreName = undefined;
        let customerAddress = undefined;
        
        if (savedStore) {
          try {
            const parsed = JSON.parse(savedStore);
            deliveryMethod = parsed.deliveryMethod || 'delivery';
            shippingCostForStripe = parsed.shippingCost || 0;
            if (parsed.deliveryMethod === 'pickup') {
              deliveryMethod = 'click_collect';
              pickupStoreId = parsed.storeId;
              pickupStoreName = parsed.storeName;
            }
            if (parsed.customerAddress && parsed.deliveryMethod !== 'pickup') {
              customerAddress = parsed.customerAddress.formatted_address || parsed.customerAddress.address;
            }
          } catch (error) {
            console.error('Error parsing saved store data:', error);
          }
        }
        
        const metadata: Metadata = {
          orderNumber: crypto.randomUUID(),
          customerName: user?.fullName ?? "Unknown",
          customerEmail: user?.emailAddresses[0].emailAddress ?? "Unknown",
          clerkUserId: user!.id,
          deliveryMethod: deliveryMethod,
          shippingCost: shippingCostForStripe, // Pasar el costo real de envío
          pickupStoreId: pickupStoreId,
          pickupStoreName: pickupStoreName,
          customerAddress: customerAddress,
        };

        console.log('📦 Metadata para Stripe:', metadata);

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
      } else if (paymentMethod === 'cod') {
        console.log('💵 Procesando pago en efectivo...');
        
        // Verificar localStorage antes de navegar
        const savedStore = localStorage.getItem('clickCollectStore');
        console.log('📦 localStorage data:', savedStore ? 'Presente' : 'Ausente');
        if (savedStore) {
          console.log('📦 Datos en localStorage:', JSON.parse(savedStore));
        }
        
        // IMPORTANTE: Guardar los productos específicos de este grupo en localStorage
        // para que CashOnDeliveryCheckout use solo estos productos
        const groupSpecificData = {
          groupedItems: groupedItems,
          totalPrice: totalPrice,
          timestamp: Date.now()
        };
        localStorage.setItem('checkoutGroupData', JSON.stringify(groupSpecificData));
        console.log('💾 Datos del grupo guardados para checkout:', groupSpecificData);
        
        console.log('🚀 Navegando a /checkout-cod...');
        router.push('/checkout-cod');
        console.log('✅ router.push ejecutado');
      }
      
      // Llamar callback si se proporciona
      if (onCheckoutComplete) {
        console.log('📞 Ejecutando callback onCheckoutComplete...');
        onCheckoutComplete();
      }
    } catch (error) {
      console.error("❌ Error al crear la sesión de checkout:", error);
      alert('Error al procesar el pago. Por favor intenta de nuevo.');
    } finally {
      console.log('⏳ Estableciendo isLoading a false...');
      setIsLoading(false);
    }
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-between mb-4">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                completedSteps.includes(step.id)
                  ? 'bg-green-500 border-green-500 text-white'
                  : currentStep === step.id
                  ? 'bg-blue-500 border-blue-500 text-white'
                  : 'bg-gray-100 border-gray-300 text-gray-400'
              }`}
            >
              {completedSteps.includes(step.id) ? (
                <Check className="h-4 w-4 sm:h-5 sm:w-5" />
              ) : (
                <step.icon className="h-4 w-4 sm:h-5 sm:w-5" />
              )}
            </div>
            <div className="mt-1 text-center">
              <p className={`text-xs sm:text-sm font-medium ${
                currentStep === step.id ? 'text-blue-600' : 
                completedSteps.includes(step.id) ? 'text-green-600' : 'text-gray-400'
              }`}>
                {step.name}
              </p>
            </div>
          </div>
          {index < steps.length - 1 && (
            <ChevronRight className={`h-4 w-4 mx-2 sm:mx-4 ${
              completedSteps.includes(step.id) ? 'text-green-400' : 'text-gray-300'
            }`} />
          )}
        </div>
      ))}
    </div>
  );

  const StepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <ServiceTypeSelector
            storeId={cartStoreId}
            onServiceTypeSelect={handleServiceTypeSelect}
            selectedType={serviceType}
            restrictedType={restrictedServiceType}
          />
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {serviceType === 'delivery' ? '📍 Confirma tu Dirección' : '🏪 Selecciona una Tienda'}
                </h2>
                <p className="text-sm text-gray-600">
                  {serviceType === 'delivery' 
                    ? 'Ingresa la dirección donde quieres recibir tu pedido'
                    : 'Elige la tienda más conveniente para recoger tu pedido'
                  }
                </p>
              </div>
              <button
                onClick={handleBackStep}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Cambiar</span>
              </button>
            </div>

            {serviceType === 'delivery' ? (
              <div className="space-y-4">
                {showLocationPicker ? (
                  <InteractiveLocationPicker
                    apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                    initialLocation={selectedAddress || undefined}
                    onLocationConfirmed={handleLocationConfirmed}
                    onCancel={() => {
                      setShowLocationPicker(false);
                      setSelectedAddress(null);
                    }}
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4">
                    <button
                      onClick={handleUseCurrentLocation}
                      className="flex items-center gap-3 p-6 border-2 border-blue-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 group"
                    >
                      <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                        <Navigation className="h-6 w-6 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900 mb-1">Usar Mi Ubicación</h3>
                        <p className="text-sm text-gray-600">Detectar automáticamente</p>
                        <p className="text-xs text-blue-600 mt-1">Podrás ajustar en el mapa</p>
                      </div>
                    </button>
                    
                    <div className="border-2 border-gray-200 rounded-xl p-6 hover:border-gray-300 transition-colors">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                          <MapPin className="h-6 w-6 text-gray-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900 mb-1">Escribir Dirección</h3>
                          <p className="text-sm text-gray-600">Ingresa manualmente</p>
                        </div>
                      </div>
                      
                      <SimpleAddressInputFixed
                        apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                        onAddressSelected={(addressData) => {
                          console.log('Address selected in StepByStepCheckout:', addressData);
                          try {
                            setSelectedAddress(addressData);
                            setShowLocationPicker(true);
                          } catch (error) {
                            console.error('Error handling address selection:', error);
                          }
                        }}
                        placeholder="Ej: 5 de Febrero 123, Pedro Escobedo, Querétaro"
                      />
                      
                      <div className="mt-3 flex items-center text-xs text-gray-500">
                        <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                        Podrás ajustar la ubicación exacta en el mapa
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-80 overflow-auto">
                <SafeLocationBasedStoreSelector
                  onStoreSelected={(storeData: StoreData) => {
                    console.log('🏪 Tienda seleccionada:', storeData);
                    
                    const payload: SavedStoreInfo = {
                      deliveryMethod: 'pickup' as const,
                      storeId: storeData.store._id,
                      storeName: storeData.summary.storeName,
                      storeAddress: storeData.summary.address,
                      storePhone: storeData.summary.phone,
                      estimatedDelivery: storeData.summary.estimatedDelivery,
                      customerAddress: customerAddress as LocationData || undefined,
                      shippingCost: 0,
                      timestamp: Date.now() // Agregar timestamp para validar sesión
                    };

                    console.log('💾 Guardando payload:', payload);
                    
                    setShippingCost(0);
                    setSavedStoreInfo(payload);
                    localStorage.setItem('clickCollectStore', JSON.stringify(payload));
                    
                    // Marcar pasos como completados y avanzar directamente
                    setCompletedSteps(prev => [...new Set([...prev, 1, 2])]);
                    setCurrentStep(3);
                    
                    // También disparar el evento para compatibilidad
                    window.dispatchEvent(new Event('storeSelected'));
                  }}
                  onAddressChange={(addr) => setCustomerAddress(addr)}
                  apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
                  filterStoreId={cartStoreId}
                />
              </div>
            )}
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900">💳 Método de Pago</h2>
                <p className="text-sm text-gray-600">Elige cómo quieres pagar tu pedido</p>
              </div>
              <button
                onClick={handleBackStep}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Cambiar</span>
              </button>
            </div>

            {/* Resumen del pedido compacto */}
            {savedStoreInfo && (
              <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-4 mb-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-green-800 text-sm mb-1">
                      {savedStoreInfo.deliveryMethod === 'delivery' ? '🏠 Entrega Confirmada' : '🏪 Tienda Seleccionada'}
                    </h3>
                    <p className="text-green-700 font-medium text-sm">{savedStoreInfo.storeName}</p>
                    <p className="text-green-600 text-xs">{savedStoreInfo.estimatedDelivery}</p>
                    {savedStoreInfo.deliveryMethod === 'delivery' && savedStoreInfo.customerAddress && (
                      <p className="text-green-600 text-xs mt-1 truncate">
                        📍 {savedStoreInfo.customerAddress.formatted_address || savedStoreInfo.customerAddress.address}
                      </p>
                    )}
                    {shippingCost !== null && (
                      <p className="text-green-600 text-xs mt-1">
                        {shippingCost === 0 ? '🎉 Envío gratis' : `Envío: $${shippingCost} MXN`}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isSignedIn ? (
              <div className="text-center py-8">
                <User className="h-12 w-12 mx-auto text-gray-400 mb-3" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Inicia Sesión para Continuar</h3>
                <p className="text-sm text-gray-600 mb-4">Necesitas una cuenta para completar tu compra</p>
                <SignInButton mode="modal">
                  <button className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-2 rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all duration-200">
                    Iniciar Sesión
                  </button>
                </SignInButton>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleCheckout('card')}
                  disabled={isLoading}
                  className="group p-4 sm:p-6 rounded-xl border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                      <CreditCard className="h-6 w-6 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Pagar con Tarjeta</h3>
                    <p className="text-sm text-gray-600 mb-3">Pago seguro en línea</p>
                    <div className="space-y-1 text-xs text-gray-500">
                      <p>✓ Pago inmediato</p>
                      <p>✓ Seguro y encriptado</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => {
                    console.log('🖱️ Click en botón "Pagar en Tienda" detectado');
                    console.log('🔒 Botón deshabilitado?', isLoading);
                    handleCheckout('cod');
                  }}
                  disabled={isLoading}
                  className="group p-4 sm:p-6 rounded-xl border-2 border-gray-200 hover:border-green-300 hover:bg-green-50 transition-all duration-300 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
                      <span className="text-2xl">💵</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {serviceType === 'delivery' ? 'Pagar al Recibir' : 'Pagar en Tienda'}
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      {serviceType === 'delivery' ? 'Efectivo al repartidor' : 'Efectivo en la tienda'}
                    </p>
                    <div className="space-y-1 text-xs text-gray-500">
                      <p>✓ Sin comisiones extra</p>
                      <p>✓ Pago en efectivo</p>
                    </div>
                  </div>
                </button>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex-1">
          <StepIndicator />
        </div>
        {(savedStoreInfo || currentStep > 1) && (
          <button
            onClick={() => {
              localStorage.removeItem('clickCollectStore');
              setSavedStoreInfo(null);
              setServiceType(null);
              setCustomerAddress(null);
              setShippingCost(null);
              setCompletedSteps([]);
              setCurrentStep(1);
              setShowLocationPicker(false);
              setSelectedAddress(null);
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline ml-4"
          >
            Empezar de nuevo
          </button>
        )}
      </div>
      <div className="bg-white rounded-xl shadow-md p-4 sm:p-6">
        <StepContent />
      </div>
    </div>
  );
}
