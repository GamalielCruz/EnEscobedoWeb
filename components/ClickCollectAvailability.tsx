"use client";

import { useState, useEffect } from "react";
import { Store, MapPin, CheckCircle, AlertCircle } from "lucide-react";
import { useStoreSearch, StoreInfo } from "@/hooks/useStoreSearch";
import StoreCheckerModal from "./StoreCheckerModal";
import ModalPortal from "./ModalPortal";

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

interface ClickCollectAvailabilityProps {
  className?: string;
  showFullInfo?: boolean;
}

function ClickCollectAvailability({ className = "", showFullInfo = false }: ClickCollectAvailabilityProps) {
  const [storedStore, setStoredStore] = useState<StoreInfo | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { getStoredStore } = useStoreSearch();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted) {
      // Verificar si hay una tienda guardada en localStorage
      const stored = getStoredStore();
      setStoredStore(stored);
    }
  }, [getStoredStore, isMounted]);

  // No renderizar hasta que el componente esté montado en el cliente
  if (!isMounted) {
    return (
      <div className={`bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-blue-800">
              Click & Collect
            </p>
            <p className="text-xs text-blue-700 mt-0.5">
              Verifica si hay tiendas cercanas disponibles
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (storedStore) {
    return (
      <div className={`bg-green-50 border border-green-200 rounded-lg p-3 ${className}`}>
        <div className="flex items-start gap-2">
          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-green-800">
              Click & Collect Disponible
            </p>
            {showFullInfo ? (
              <div className="mt-1 space-y-1">
                <div className="flex items-center gap-1">
                  <Store className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-green-700 truncate">
                    {storedStore.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-green-600" />
                  <span className="text-xs text-green-700">
                    {storedStore.distanceKm ? `${storedStore.distanceKm.toFixed(1)} km` : 'Cercana'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-green-700 mt-0.5">
                Envío gratis a {storedStore.name}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-800">
            Click & Collect
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            Verifica si hay tiendas cercanas disponibles
          </p>
          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-block mt-2 text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Verificar disponibilidad →
          </button>

          {/* Modal usando Portal seguro */}
          <ModalPortal isOpen={isModalOpen}>
            <StoreCheckerModal
              isOpen={isModalOpen}
              onClose={() => setIsModalOpen(false)}
              onStoreFound={(store: StoreData) => {
                // Convertir StoreData a StoreInfo para compatibilidad
                const storeInfo: StoreInfo = {
                  storeId: store.store._id,
                  name: store.summary.storeName,
                  address: store.summary.address,
                  phone: store.summary.phone,
                  distanceKm: store.store.distanceKm || 0,
                  estimatedDelivery: store.summary.estimatedDelivery
                };
                setStoredStore(storeInfo);
                setIsModalOpen(false);
              }}
            />
          </ModalPortal>
        </div>
      </div>
    </div>
  );
}

export default ClickCollectAvailability;