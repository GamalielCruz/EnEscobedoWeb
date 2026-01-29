"use client";

import { useState } from "react";
import { SafeLocationBasedStoreSelector } from "@/components/SafeLocationBasedStoreSelector";
import { CustomerAddress } from "@/lib/clickCollect";
import { Store, ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";

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

function CheckStoresPage() {
  const [selectedStore, setSelectedStore] = useState<StoreData | null>(
    null
  );
  const [customerAddress, setCustomerAddress] =
    useState<CustomerAddress | null>(null);

  const handleStoreSelected = (storeData: StoreData) => {
    console.log("🏪 Tienda seleccionada:", storeData);
    setSelectedStore(storeData);

    // Guardar en localStorage
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
  };

  const handleAddressChange = (address: CustomerAddress) => {
    setCustomerAddress(address);
  };
  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a la tienda
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <Store className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            Verificar Disponibilidad Click & Collect
          </h1>
        </div>

        <p className="text-gray-600">
          Antes de añadir productos a tu carrito, verifica si hay una tienda
          cercana donde puedas recoger tu pedido con nuestro servicio Click &
          Collect.
        </p>
      </div>

      {/* Store Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SafeLocationBasedStoreSelector
            onStoreSelected={handleStoreSelected}
            onAddressChange={handleAddressChange}
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}
          />
        </div>

        {/* Panel de resultado */}
        <div className="space-y-4">
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

      {/* Benefits Section */}
      <div className="mt-8 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Beneficios del Click & Collect
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium text-gray-900">Envío Gratuito</h3>
                <p className="text-sm text-gray-600">
                  Tu pedido llega sin costo a la tienda seleccionada
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium text-gray-900">Pago Flexible</h3>
                <p className="text-sm text-gray-600">
                  Paga en efectivo cuando recojas tu pedido
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium text-gray-900">
                  Seguro y Confiable
                </h3>
                <p className="text-sm text-gray-600">
                  Verifica tus productos antes de pagar
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 flex-shrink-0"></div>
              <div>
                <h3 className="font-medium text-gray-900">Notificaciones</h3>
                <p className="text-sm text-gray-600">
                  Te avisamos cuando tu pedido esté listo
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Call to Action */}
      <div className="mt-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
        >
          <Store className="w-5 h-5" />
          Comenzar a Comprar
        </Link>

        <p className="text-sm text-gray-500 mt-2">
          Una vez que verifiques la disponibilidad, puedes añadir productos a tu
          carrito
        </p>
      </div>
    </div>
  );
}

export default CheckStoresPage;
