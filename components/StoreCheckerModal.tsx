"use client";

import { useState, useEffect } from "react";
import { Store, X, CheckCircle } from "lucide-react";
import { SafeLocationBasedStoreSelector } from "./SafeLocationBasedStoreSelector";
import { CustomerAddress } from "@/lib/clickCollect";

// Tipo para los datos de la tienda seleccionada (debe coincidir con StoreData del componente)
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

interface StoreCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoreFound?: (store: StoreData) => void;
}

function StoreCheckerModal({
  isOpen,
  onClose,
  onStoreFound,
}: StoreCheckerModalProps) {
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(
    null
  );
  const [customerAddress, setCustomerAddress] =
    useState<CustomerAddress | null>(null);

  // Cerrar modal con ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  const handleStoreSelected = (storeData: StoreData) => {
    console.log("🏪 Tienda seleccionada:", storeData);
    setSelectedStore(storeData);

    // Guardar en localStorage (igual que en select-store)
    localStorage.setItem(
      "clickCollectStore",
      JSON.stringify({
        storeId: storeData.store._id,
        storeName: storeData.summary.storeName,
        storeAddress: storeData.summary.address,
        storePhone: storeData.summary.phone,
        estimatedDelivery: storeData.summary.estimatedDelivery,
        customerAddress: customerAddress,
      })
    );

    // NO llamar onStoreFound aquí - solo cuando el usuario confirme
  };

  const handleContinueShopping = () => {
    // Notificar al componente padre cuando el usuario confirme
    if (selectedStore && onStoreFound) {
      onStoreFound(selectedStore);
    }

    // Disparar evento personalizado para que otros componentes sepan que se guardó una tienda
    window.dispatchEvent(new CustomEvent("storeSelected"));

    onClose();
  };

  const handleAddressChange = (address: CustomerAddress) => {
    setCustomerAddress(address);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 10000,
        backgroundColor: "rgba(0, 0, 0, 0.5)", // Fondo negro semitransparente
        backdropFilter: "blur(2px)", // Ligero desenfoque
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto relative">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Verificar Disponibilidad Click & Collect
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Selector de tienda - Usa exactamente el mismo componente que select-store */}
            <div className="lg:col-span-2">
              <SafeLocationBasedStoreSelector
                onStoreSelected={handleStoreSelected}
                onAddressChange={handleAddressChange}
                apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
              />
            </div>

            {/* Panel de resultado */}
            <div className="space-y-4">
              {/* Información de tienda seleccionada */}
              {selectedStore ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <h4 className="font-medium text-green-800 mb-2">
                        ¡Tienda disponible!
                      </h4>

                      <div className="space-y-2 text-sm">
                        <div className="flex items-start gap-2">
                          <Store className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="font-medium text-green-800">
                              {selectedStore.summary.storeName}
                            </p>
                            <p className="text-green-700">
                              {selectedStore.summary.address}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-green-700">
                            Distancia: {selectedStore.summary.distance}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-green-700">
                            Listo para recoger:{" "}
                            {selectedStore.summary.estimatedDelivery}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 p-2 bg-white rounded border border-green-200">
                        <p className="text-xs text-green-700">
                          ✓ Envío gratuito a la tienda
                          <br />✓ Pago en efectivo al recoger
                        </p>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-4 space-y-2">
                        <button
                          onClick={handleContinueShopping}
                          className="w-full bg-green-600 text-white py-3 px-4 rounded-md text-sm font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                        >
                          <Store className="w-4 h-4" />
                          ¡Perfecto! Continuar Comprando
                        </button>

                        <div className="text-center">
                          <p className="text-xs text-green-700">
                            Tu tienda está guardada. Cuando añadas productos al
                            carrito, podrás elegir Click & Collect en el
                            checkout.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-800 mb-2">
                    ¿Cómo funciona Click & Collect?
                  </h4>
                  <ul className="text-xs text-blue-700 space-y-1">
                    <li>• Ingresa tu dirección o usa tu ubicación</li>
                    <li>• Encontramos la tienda más cercana</li>
                    <li>• Tu pedido se envía gratis a la tienda</li>
                    <li>• Recibes notificación cuando esté listo</li>
                    <li>• Recoges y pagas en efectivo en la tienda</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default StoreCheckerModal;
