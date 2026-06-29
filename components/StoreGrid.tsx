"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getStoreOperationalState } from "@/lib/storeOperationalState";
import { urlFor } from "@/sanity/lib/image";

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
  isOpen?: boolean;
  manualOperationalStatus?: "open" | "closed" | "auto";
  highDemandMode?: boolean;
  serviceTypes?: {
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  };
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
      <div className="py-12 text-center">
        <p className="text-gray-500">No hay tiendas disponibles</p>
      </div>
    );
  }

  return (
    <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {stores.map((store) => {
        const storeState = getStoreOperationalState(store);
        const isOpen = mounted ? storeState.effectiveIsOpen : false;

        const deliveryTimeText =
          store.deliveryTimeMin != null && store.deliveryTimeMax != null
            ? `${store.deliveryTimeMin}-${store.deliveryTimeMax} min`
            : store.averageDeliveryTime
              ? `${store.averageDeliveryTime} dias`
              : "";

        return (
          <Link
            key={store._id}
            href={`/store/${store._id}`}
            className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-md transition-shadow duration-200 hover:shadow-lg"
          >
            <div className="relative h-48 w-full overflow-hidden bg-black">
              {store.coverImage ? (
                <Image
                  src={urlFor(store.coverImage).width(600).height(400).url()}
                  alt={store.name || "Tienda"}
                  fill
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                  <span className="text-4xl font-bold text-white">
                    {store.name?.charAt(0) || "T"}
                  </span>
                </div>
              )}

              {store.image && (
                <div className="absolute bottom-2 left-2 h-16 w-16 overflow-hidden rounded-full border-2 border-white bg-white shadow-lg">
                  <Image
                    src={urlFor(store.image).width(100).height(100).url()}
                    alt={store.name || "Logo"}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2 p-4">
              <h3 className="line-clamp-1 text-lg font-bold text-black">{store.name}</h3>

              {store.address && (
                <p className="line-clamp-1 text-xs text-black">
                  {store.address.city}, {store.address.state}
                </p>
              )}

              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1">
                  <div className={`h-2 w-2 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`} />
                  <span className={isOpen ? "font-medium text-green-500" : "font-medium text-red-500"}>
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
            </div>
          </Link>
        );
      })}
    </div>
  );
}
