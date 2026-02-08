"use client";

import Image from "next/image";
import Link from "next/link";
import { urlFor } from "@/sanity/lib/image";
import { getStoreStatusText } from "@/lib/storeHours";
import { useEffect, useState } from "react";

interface Store {
  _id: string;
  name?: string;
  storeId?: string;
  image?: any;
  coverImage?: any;
  address?: {
    street?: string;
    city?: string;
    state?: string;
  };
  operatingHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  deliveryFee?: number;
  deliveryTimeMin?: number;
  deliveryTimeMax?: number;
  averageDeliveryTime?: number;
  isActive?: boolean;
}

interface StoreGridProps {
  stores: Store[];
}

export default function StoreGrid({ stores }: StoreGridProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!stores || stores.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No hay tiendas disponibles</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4 w-full">
      {stores.map((store) => {
        // Calculate status consistently - use a default on server, actual status on client
        const storeStatus = mounted ? getStoreStatusText(store.operatingHours) : "Verificando...";
        const isOpen = mounted ? storeStatus.includes("Abierto") : false;

        const deliveryTimeText =
          store.deliveryTimeMin != null && store.deliveryTimeMax != null
            ? `${store.deliveryTimeMin}–${store.deliveryTimeMax} min`
            : store.averageDeliveryTime
            ? `${store.averageDeliveryTime} días`
            : "";

        const deliveryFeeText =
          store.deliveryFee != null
            ? `$${store.deliveryFee.toFixed(2)}`
            : "Gratis";

        return (
          <Link
            key={store._id}
            href={`/store/${store._id}`}
            className="group flex flex-col bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-200"
          >
            {/* Imagen de portada */}
            <div className="relative w-full h-48 overflow-hidden bg-black">
              {store.coverImage ? (
                <Image
                  src={urlFor(store.coverImage).width(600).height(400).url()}
                  alt={store.name || "Tienda"}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-200"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">
                    {store.name?.charAt(0) || "T"}
                  </span>
                </div>
              )}

              {/* Logo de la tienda superpuesto */}
              {store.image && (
                <div className="absolute bottom-2 left-2 h-16 w-16 rounded-full bg-white shadow-lg overflow-hidden border-2 border-white">
                  <Image
                    src={urlFor(store.image).width(100).height(100).url()}
                    alt={store.name || "Logo"}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
            </div>

            {/* Contenido */}
            <div className="p-4 space-y-2">
              {/* Nombre de la tienda */}
              <h3 className="text-lg font-bold text-black line-clamp-1">
                {store.name}
              </h3>

              {/* Dirección */}
              {store.address && (
                <p className="text-xs text-black line-clamp-1">
                  {store.address.city}, {store.address.state}
                </p>
              )}

              {/* Estado y tiempo de entrega */}
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isOpen ? "bg-green-500" : "bg-red-500"
                    }`}
                  />
                  <span
                    className={
                      isOpen
                        ? "text-green-500 font-medium"
                        : "text-red-500 font-medium"
                    }
                  >
                    {isOpen ? "Abierto" : "Cerrado"}
                  </span>
                </div>
                {deliveryTimeText && (
                  <>
                    <span className="text-gray-900">Entrega:</span>
                    <span className="text-gray-900">{deliveryTimeText}</span>
                  </>
                )}
              </div>

              {/* Costo de entrega */}
              <div className="flex items-center gap-1 text-xs text-gray-600">
                
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
