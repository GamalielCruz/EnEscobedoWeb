"use client";

import { useEffect, useState } from "react";
import { getStoreOperationalState } from "@/lib/storeOperationalState";

interface StoreStatusProps {
  operatingHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
}

export function StoreStatus({ operatingHours }: StoreStatusProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Mostrar un placeholder durante SSR
    return (
      <div className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-gray-300" />
        <span className="text-gray-500 font-medium">Cargando...</span>
      </div>
    );
  }

  const { effectiveIsOpen } = getStoreOperationalState({ operatingHours });
  const storeStatus = effectiveIsOpen ? "Abierto" : "Cerrado";
  const isOpen = effectiveIsOpen;

  return (
    <div className="flex items-center gap-1">
      <div
        className={`h-2 w-2 rounded-full ${
          isOpen ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span
        className={
          isOpen
            ? "text-green-600 font-medium"
            : "text-red-600 font-medium"
        }
      >
        {storeStatus}
      </span>
    </div>
  );
}
