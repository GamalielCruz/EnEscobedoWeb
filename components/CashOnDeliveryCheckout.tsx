"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useBasketStore from "@/store/store";
import { useUser } from "@clerk/nextjs";
import { createCashOnDeliveryOrder } from "@/actions/createCashOnDeliveryOrder";
import { formatCurrency } from "@/lib/formatCurrency";
import { Truck, MapPin, DollarSign, Store, Edit } from "lucide-react";

interface SavedStoreInfo {
  deliveryMethod: 'delivery' | 'pickup';
  storeId: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  estimatedDelivery: string;
  customerAddress?: {
    formatted_address?: string;
    address?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    latitude?: number;
    longitude?: number;
    street?: string;
    line2?: string;
    locality?: string;
    administrative_area_level_1?: string;
    zip?: string;
    country?: string;
  };
  shippingCost?: number;
  distanceKm?: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
}

function CashOnDeliveryCheckout() {
  const router = useRouter();
  const { user } = useUser();
  const { items: allItems, getTotalPrice: getAllTotalPrice, clearBasket } = useBasketStore();
  const [isLoading, setIsLoading] = useState(false);
  const [savedStoreInfo, setSavedStoreInfo] = useState<SavedStoreInfo | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  
  // Estados para manejar los productos específicos del grupo
  const [groupItems, setGroupItems] = useState<Array<{
    product: any;
    quantity: number;
  }>>([]);
  const [groupTotalPrice, setGroupTotalPrice] = useState<number>(0);
  
  const [formData, setFormData] = useState({
    phone: "",
    address: {
      line1: "",
      line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "MX",
    },
  });

  // Usar los datos del grupo específico si están disponibles, sino usar todos los items
  const items = groupItems.length > 0 ? groupItems : allItems;
  const subtotal = groupItems.length > 0 ? groupTotalPrice : getAllTotalPrice();
  const shippingCost = savedStoreInfo?.deliveryMethod === 'pickup' ? 0 : (savedStoreInfo?.shippingCost || 0);
  const total = subtotal + shippingCost;

  // Función para corregir textos antiguos de tiempo de entrega
  const correctOldDeliveryText = (text: string | undefined | null, distanceKm?: number, storeData?: SavedStoreInfo): string => {
    // Validar que text no sea undefined o null
    if (!text || typeof text !== 'string') {
      // Si no hay texto válido, generar uno basado en los datos de la tienda
      if (storeData?.deliveryTimeMin != null && storeData?.deliveryTimeMax != null) {
        const avgTime = Math.round((storeData.deliveryTimeMin + storeData.deliveryTimeMax) / 2);
        return `Listo en ${avgTime} minutos`;
      }
      
      // Fallback: calcular basado en distancia
      const distance = distanceKm || 5;
      if (distance <= 2) {
        return "Listo en 20 minutos";
      } else if (distance <= 5) {
        return "Listo en 30 minutos";
      } else if (distance <= 10) {
        return "Listo en 45 minutos";
      } else if (distance <= 15) {
        return "Listo en 60 minutos";
      } else {
        return "Listo en 90 minutos";
      }
    }

    // Si el texto contiene referencias a días, corregirlo
    if (text.includes('días') || text.includes('día') || text.includes('mañana')) {
      
      // Si la tienda tiene tiempos configurados en Sanity, usarlos
      if (storeData?.deliveryTimeMin != null && storeData?.deliveryTimeMax != null) {
        const avgTime = Math.round((storeData.deliveryTimeMin + storeData.deliveryTimeMax) / 2);
        return `Listo en ${avgTime} minutos`;
      }
      
      // Fallback: calcular basado en distancia
      const distance = distanceKm || 5; // Valor por defecto si no hay distancia
      
      if (distance <= 2) {
        return "Listo en 20 minutos";
      } else if (distance <= 5) {
        return "Listo en 30 minutos";
      } else if (distance <= 10) {
        return "Listo en 45 minutos";
      } else if (distance <= 15) {
        return "Listo en 60 minutos";
      } else {
        return "Listo en 90 minutos";
      }
    }
    
    // Si el texto ya está correcto, devolverlo tal como está
    return text;
  };

  useEffect(() => {
    // Cargar datos del grupo específico si están disponibles
    const groupData = localStorage.getItem('checkoutGroupData');
    if (groupData) {
      try {
        const parsed = JSON.parse(groupData);
        console.log('📦 Datos del grupo específico encontrados:', parsed);
        
        // Verificar que los datos no sean muy antiguos (5 minutos)
        if (parsed.timestamp && (Date.now() - parsed.timestamp) < 5 * 60 * 1000) {
          setGroupItems(parsed.groupedItems || []);
          setGroupTotalPrice(parsed.totalPrice || 0);
          console.log('✅ Usando productos del grupo específico:', parsed.groupedItems?.length, 'productos');
          console.log('💰 Total del grupo:', parsed.totalPrice);
        } else {
          console.log('⚠️ Datos del grupo demasiado antiguos, usando todos los items');
          localStorage.removeItem('checkoutGroupData');
        }
      } catch (error) {
        console.error('❌ Error parsing group data:', error);
        localStorage.removeItem('checkoutGroupData');
      }
    } else {
      console.log('ℹ️ No hay datos de grupo específico, usando todos los items del carrito');
    }

    const savedStore = localStorage.getItem('clickCollectStore');
    if (savedStore) {
      try {
        const storeData = JSON.parse(savedStore);
        
        console.log('🔍 Datos cargados desde localStorage:', storeData);
        console.log('📍 Customer Address:', storeData.customerAddress);
        
        // Siempre corregir el texto de entrega para asegurar que use los datos más recientes
        const correctedText = correctOldDeliveryText(storeData.estimatedDelivery, storeData.distanceKm, storeData);
        
        // Si el texto cambió, actualizar localStorage
        if (correctedText !== storeData.estimatedDelivery) {
          console.log('🔄 Actualizando tiempo de entrega:', storeData.estimatedDelivery, '→', correctedText);
          storeData.estimatedDelivery = correctedText;
          localStorage.setItem('clickCollectStore', JSON.stringify(storeData));
        }
        
        setSavedStoreInfo(storeData);
        
        // Para pickup, no necesitamos dirección del cliente
        if (storeData.deliveryMethod === 'pickup') {
          console.log('✅ Modo pickup: no se requiere dirección del cliente');
          setShowManualForm(false);
        } else {
          // Para delivery, verificar si hay dirección del cliente y pre-llenar el formulario
          if (storeData.customerAddress) {
            const addr = storeData.customerAddress;
            console.log('✅ Usando dirección guardada:', addr);
            
            setFormData(prev => ({
              ...prev,
              address: {
                line1: addr.formatted_address || addr.address || addr.street || "",
                line2: addr.line2 || "",
                city: addr.city || addr.locality || "",
                state: addr.state || addr.administrative_area_level_1 || "",
                postal_code: addr.postal_code || addr.zip || "",
                country: addr.country || "MX",
              }
            }));
            
            // Si hay dirección válida, no mostrar formulario manual por defecto
            if (addr.formatted_address || addr.address || addr.street) {
              setShowManualForm(false);
              console.log('✅ Dirección detectada válida, ocultando formulario manual');
            } else {
              console.log('⚠️ Dirección detectada incompleta, mostrando formulario manual');
              setShowManualForm(true);
            }
          } else {
            console.log('⚠️ No hay customerAddress en localStorage, mostrando formulario manual');
            setShowManualForm(true);
          }
        }
      } catch (e) {
        console.error('Error parsing saved store info:', e);
        setShowManualForm(false); // Por defecto false, se ajustará según el método de entrega
      }
    } else {
      console.log('⚠️ No hay datos en localStorage');
      setShowManualForm(false); // Por defecto false hasta que se carguen los datos
    }
  }, []);

  if (items.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-600">Tu carrito está vacío</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
        >
          Continuar Comprando
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      alert("Debes iniciar sesión para continuar");
      return;
    }

    if (!savedStoreInfo) {
      alert("Por favor selecciona una tienda desde el carrito");
      return;
    }

    setIsLoading(true);

    try {
      const orderNumber = crypto.randomUUID();

      // Construir dirección de envío con validación mejorada
      let shippingAddress;
      
      // Para pickup, usar la dirección de la tienda como dirección de "envío"
      if (savedStoreInfo.deliveryMethod === 'pickup') {
        console.log("Pickup mode: using store address as shipping address");
        shippingAddress = {
          line1: savedStoreInfo.storeAddress || "Tienda seleccionada",
          line2: "",
          city: "Pedro Escobedo", // Ciudad por defecto
          state: "Querétaro",
          postal_code: "76750",
          country: "MX",
        };
      } else {
        // Para delivery, usar la dirección del cliente
        if (savedStoreInfo.customerAddress && !showManualForm) {
          const addr = savedStoreInfo.customerAddress;
          console.log("Using saved customer address:", addr);
          
          shippingAddress = {
            line1: addr.formatted_address || addr.address || addr.street || "Dirección desde ubicación GPS",
            line2: addr.line2 || "",
            city: addr.city || addr.locality || "Ciudad no especificada",
            state: addr.state || addr.administrative_area_level_1 || "Estado no especificado", 
            postal_code: addr.postal_code || addr.zip || "00000",
            country: addr.country || "MX",
          };
        } else {
          console.log("Using manual form data:", formData.address);
          shippingAddress = {
            line1: formData.address.line1 || "Dirección no especificada",
            line2: formData.address.line2 || "",
            city: formData.address.city || "Ciudad no especificada",
            state: formData.address.state || "Estado no especificado",
            postal_code: formData.address.postal_code || "00000",
            country: formData.address.country || "MX",
          };
        }

        // Validar que los campos críticos no estén vacíos SOLO para delivery
        if (!shippingAddress.line1 || shippingAddress.line1 === "Dirección no especificada") {
          alert("Por favor proporciona una dirección válida antes de continuar");
          setIsLoading(false);
          return;
        }
      }

      console.log("Final shipping address:", shippingAddress);
      console.log("Store info:", savedStoreInfo);

      const result = await createCashOnDeliveryOrder(
        items.map((item) => ({
          product: item.product,
          quantity: item.quantity,
        })),
        {
          orderNumber,
          customerName: user.fullName || user.firstName || "Cliente",
          customerEmail: user.emailAddresses[0]?.emailAddress || "",
          clerkUserId: user.id,
          phone: formData.phone,
          shippingAddress,
          storeInfo: savedStoreInfo ? {
            storeId: savedStoreInfo.storeId,
            storeName: savedStoreInfo.storeName,
            storeAddress: savedStoreInfo.storeAddress,
            storePhone: savedStoreInfo.storePhone,
            deliveryMethod: savedStoreInfo.deliveryMethod,
            estimatedDelivery: savedStoreInfo.estimatedDelivery,
          } : undefined,
        },
        shippingCost
      );

      if (result.success) {
        clearBasket();
        localStorage.removeItem('clickCollectStore');
        localStorage.removeItem('checkoutGroupData'); // Limpiar datos del grupo específico
        router.push(`/success-cod?orderNumber=${orderNumber}`);
      } else {
        alert("Error al crear la orden. Por favor intenta de nuevo.");
      }
    } catch (error) {
      console.error("Error creating COD order:", error);
      alert("Error al crear la orden: " + (error instanceof Error ? error.message : "Error desconocido"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {savedStoreInfo?.deliveryMethod === 'pickup' ? 'Pago en Tienda' : 'Pago Contra Entrega'}
        </h1>
        <p className="text-gray-600 text-lg">
          {savedStoreInfo?.deliveryMethod === 'pickup' 
            ? 'Confirma tu orden y paga en efectivo al recoger'
            : 'Confirma tu orden y paga en efectivo al recibir'
          }
        </p>
      </div>

      {/* No Store Selected */}
      {!savedStoreInfo && (
        <div className="bg-white rounded-xl shadow-sm border p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Selecciona una tienda primero
            </h3>
            <p className="text-gray-600 mb-6">
              Necesitas seleccionar una tienda y método de entrega desde tu carrito
            </p>
            <button
              onClick={() => router.push('/basket')}
              className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Volver al Carrito
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {savedStoreInfo && (
        <form onSubmit={handleSubmit}>
          <div className="grid lg:grid-cols-3 gap-8">
            
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Store Card */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-6 py-4 border-b">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                        <Store className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">
                          {savedStoreInfo.deliveryMethod === 'pickup' ? 'Recoger en Tienda' : 'Entrega desde'}
                        </h2>
                        <p className="text-sm text-gray-600">Información de la tienda</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push('/basket')}
                      className="text-green-600 hover:text-green-700 p-2 hover:bg-green-50 rounded-lg transition-colors"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-medium text-gray-900">{savedStoreInfo.storeName}</h3>
                      <p className="text-gray-600">{savedStoreInfo.storeAddress}</p>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <Truck className="w-4 h-4 text-green-600" />
                      <span className="text-green-700 font-medium">
                        {correctOldDeliveryText(savedStoreInfo.estimatedDelivery, savedStoreInfo.distanceKm, savedStoreInfo)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Forzar actualización de tiempos
                          localStorage.removeItem('clickCollectStore');
                          window.location.href = '/basket';
                        }}
                        className="ml-2 text-xs text-green-600 hover:text-green-800 underline"
                        title="Actualizar tiempos de entrega"
                      >
                        ↻ Actualizar
                      </button>
                    </div>
                    
                    {savedStoreInfo.deliveryMethod === 'delivery' && savedStoreInfo.distanceKm && (
                      <div className="text-sm text-gray-500">
                        Distancia: {savedStoreInfo.distanceKm.toFixed(1)} km
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Address Card (delivery only) */}
              {savedStoreInfo.deliveryMethod === 'delivery' && (
                <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <MapPin className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="font-semibold text-gray-900">Dirección de Entrega</h2>
                        <p className="text-sm text-gray-600">Donde recibirás tu pedido</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-6">
                    {savedStoreInfo.customerAddress && !showManualForm ? (
                      <div className="space-y-3">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-4 h-4 bg-green-500 rounded-full"></div>
                            <span className="text-sm font-medium text-green-800">Dirección Detectada Automáticamente</span>
                          </div>
                          <p className="text-gray-900 font-medium">
                            {savedStoreInfo.customerAddress.formatted_address || 
                             savedStoreInfo.customerAddress.address ||
                             savedStoreInfo.customerAddress.street ||
                             'Dirección seleccionada desde el mapa'}
                          </p>
                          {savedStoreInfo.customerAddress.city && (
                            <p className="text-sm text-gray-600">
                              {savedStoreInfo.customerAddress.city}
                              {savedStoreInfo.customerAddress.state && `, ${savedStoreInfo.customerAddress.state}`}
                              {savedStoreInfo.customerAddress.postal_code && ` ${savedStoreInfo.customerAddress.postal_code}`}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowManualForm(true)}
                          className="text-blue-600 hover:text-blue-700 text-sm flex items-center gap-1 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                          Editar dirección manualmente
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {showManualForm && savedStoreInfo.customerAddress && (
                          <div className="flex items-center justify-between mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <div>
                              <h3 className="font-medium text-amber-800">Editando Dirección</h3>
                              <p className="text-sm text-amber-600">Puedes volver a usar la dirección detectada automáticamente</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowManualForm(false)}
                              className="text-amber-700 hover:text-amber-900 text-sm underline"
                            >
                              Usar dirección detectada
                            </button>
                          </div>
                        )}
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Dirección completa *
                          </label>
                          <input
                            type="text"
                            required={savedStoreInfo?.deliveryMethod === 'delivery'}
                            value={formData.address.line1}
                            onChange={(e) => setFormData(prev => ({
                              ...prev,
                              address: { ...prev.address, line1: e.target.value }
                            }))}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Calle, número, colonia"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Ciudad *
                            </label>
                            <input
                              type="text"
                              required={savedStoreInfo?.deliveryMethod === 'delivery'}
                              value={formData.address.city}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                address: { ...prev.address, city: e.target.value }
                              }))}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="Ciudad"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Código Postal *
                            </label>
                            <input
                              type="text"
                              required={savedStoreInfo?.deliveryMethod === 'delivery'}
                              value={formData.address.postal_code}
                              onChange={(e) => setFormData(prev => ({
                                ...prev,
                                address: { ...prev.address, postal_code: e.target.value }
                              }))}
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              placeholder="12345"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Contact Card */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 px-6 py-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">Información de Contacto</h2>
                      <p className="text-sm text-gray-600">
                        Para coordinar la {savedStoreInfo.deliveryMethod === 'pickup' ? 'recogida' : 'entrega'}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono de contacto *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      placeholder="+52 55 1234 5678"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      Te contactaremos para coordinar la {savedStoreInfo.deliveryMethod === 'pickup' ? 'recogida' : 'entrega'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              
              {/* Order Summary */}
              <div className="bg-white rounded-xl shadow-sm border overflow-hidden sticky top-4">
                <div className="bg-gradient-to-r from-gray-50 to-slate-50 px-6 py-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-gray-600" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">Resumen de Orden</h2>
                      <p className="text-sm text-gray-600">{items.length} producto{items.length > 1 ? 's' : ''}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-6 space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">{formatCurrency(subtotal, "mxn")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Envío:</span>
                      <span className="font-medium">
                        {shippingCost === 0 ? (
                          <span className="text-green-600">¡Gratis!</span>
                        ) : (
                          formatCurrency(shippingCost, "mxn")
                        )}
                      </span>
                    </div>
                    <div className="border-t pt-3 flex justify-between">
                      <span className="font-semibold text-gray-900">Total:</span>
                      <span className="font-bold text-xl text-green-600">
                        {formatCurrency(total, "mxn")}
                      </span>
                    </div>
                  </div>

                  {/* Payment Badge */}
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="flex items-center gap-2 text-amber-800 mb-1">
                      <Truck className="w-4 h-4" />
                      <span className="font-medium text-sm">
                        {savedStoreInfo.deliveryMethod === 'pickup' ? 'Pago en Tienda' : 'Pago Contra Entrega'}
                      </span>
                    </div>
                    <p className="text-xs text-amber-700">
                      Pago en efectivo mexicano (MXN)
                    </p>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading || !formData.phone}
                    className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg shadow-sm"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Creando orden...
                      </div>
                    ) : (
                      `Confirmar Orden ${formatCurrency(total, "mxn")}`
                    )}
                  </button>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-6">
                <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Instrucciones Importantes
                </h3>
                <ul className="text-sm text-blue-800 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Ten el monto exacto listo: <strong>{formatCurrency(total, "mxn")}</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Verifica los productos antes de pagar</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 mt-0.5">•</span>
                    <span>Te contactaremos para coordinar la {savedStoreInfo.deliveryMethod === 'pickup' ? 'recogida' : 'entrega'}</span>
                  </li>
                  {savedStoreInfo.deliveryMethod === 'pickup' && (
                    <li className="flex items-start gap-2">
                      <span className="text-blue-600 mt-0.5">•</span>
                      <span>Presenta tu número de orden al recoger</span>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

export default CashOnDeliveryCheckout;