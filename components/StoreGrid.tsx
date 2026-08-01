"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { getStoreOperationalState, getStoreServiceTiming } from "@/lib/storeOperationalState";
import { getStorePath } from "@/lib/store-url";
import { urlFor } from "@/sanity/lib/image";

interface Store {
  _id: string;
  name?: string;
  storeId?: string;
  slug?: { current?: string };
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
  promotionalMessages?: string[];
  promotionalMessagesEnabled?: boolean;
  premiumBadgeEnabled?: boolean;
  serviceTypes?: {
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  };
}

interface StoreGridProps {
  stores: Store[];
}

const DAYS = [
  ["monday", "Lun"],
  ["tuesday", "Mar"],
  ["wednesday", "Mié"],
  ["thursday", "Jue"],
  ["friday", "Vie"],
  ["saturday", "Sáb"],
  ["sunday", "Dom"],
] as const;

const DEFAULT_MESSAGES = [
  "¡Pásele! Estamos preparando todo rico y calientito.",
  "Recién hecho, con ese sabor que se antoja.",
  "Su próximo antojo puede estar listo en minutos.",
];

export default function StoreGrid({ stores }: StoreGridProps) {
  const [mounted, setMounted] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => setMessageIndex((index) => index + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stores || stores.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-gray-500">No hay tiendas disponibles</p>
      </div>
    );
  }

  return (
    <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {stores.map((store) => {
        const storeState = getStoreOperationalState(store);
        const isOpen = mounted ? storeState.effectiveIsOpen : false;
        const configuredMessages = store.promotionalMessages?.filter(Boolean) || [];
        const messages = configuredMessages.length ? configuredMessages : DEFAULT_MESSAGES;

        const timing = getStoreServiceTiming(store);

        return (
          <article
            key={store._id}
            className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-md transition-shadow duration-200 hover:shadow-lg"
          >
            <Link href={getStorePath(store)} className="relative block h-48 w-full overflow-hidden bg-black">
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
            </Link>

            <div className="space-y-2 p-4">
              <Link href={getStorePath(store)} className="block space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="min-w-0 line-clamp-1 text-lg font-bold text-black">{store.name}</h3>
                  {store.premiumBadgeEnabled ? (
                    <Image src="/elmenuplus.png" alt="ElMenu Plus" title="Restaurante participante del Plan Premium de ElMenu, con pagos en línea y beneficios para sus clientes." width={28} height={28} className="shrink-0" />
                  ) : null}
                </div>

                {store.address && (
                  <p className="line-clamp-1 text-xs text-black">
                    {store.address.city}, {store.address.state}
                  </p>
                )}
              </Link>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <details className="group/status">
                  <summary className={`flex cursor-pointer list-none items-center gap-1 font-medium ${isOpen ? "text-green-600" : "text-red-500"}`}>
                    <span className="relative flex h-2 w-2">
                      {isOpen && <span className="absolute h-full w-full animate-ping rounded-full bg-green-500 opacity-60 motion-reduce:animate-none" />}
                      <span className={`relative h-2 w-2 rounded-full ${isOpen ? "bg-green-500" : "bg-red-500"}`} />
                    </span>
                    {isOpen ? "Abierto" : "Cerrado"}
                    <ChevronDown className="h-3.5 w-3.5 transition-transform group-open/status:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-gray-50 p-2 text-[11px] text-gray-600">
                    {DAYS.map(([day, label]) => (
                      <span key={day}><strong className="text-gray-800">{label}</strong> {store.operatingHours?.[day] || "Cerrado"}</span>
                    ))}
                  </div>
                </details>
                {timing.label && (
                  <>
                    <span className="text-gray-900">Entrega:</span>
                    <span className="text-gray-900">{timing.label}</span>
                  </>
                )}
              </div>
              {isOpen && store.promotionalMessagesEnabled && (
                <div className="min-h-8 overflow-hidden">
                  <p key={messageIndex} className="restaurant-message line-clamp-2 text-xs italic">
                    {messages[messageIndex % messages.length]}
                  </p>
                </div>
              )}
              {timing.highDemandMode ? (
                <p className="text-xs font-medium text-amber-700">Alta demanda · Los pedidos pueden tardar mas</p>
              ) : null}
            </div>
          </article>
        );
      })}
      <style jsx>{`
        @keyframes message-cycle {
          0% { opacity: 0; transform: translateY(4px); }
          10%, 82% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }

        .restaurant-message {
          color: #4b5563;
          animation: message-cycle 5s ease-in-out;
        }

        @media (prefers-reduced-motion: reduce) {
          .restaurant-message {
            color: #4b5563;
            background: none;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
