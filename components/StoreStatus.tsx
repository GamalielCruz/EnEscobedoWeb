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
  isOpen?: boolean | null;
  manualOperationalStatus?: "open" | "closed" | "auto" | null;
  highDemandMode?: boolean | null;
  serviceTypes?: {
    onDemand?: boolean;
    onDemandExtraMinutes?: number;
  };
}

export function StoreStatus({
  operatingHours,
  isOpen,
  manualOperationalStatus,
  highDemandMode,
  serviceTypes,
}: StoreStatusProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-1">
        <div className="h-2 w-2 rounded-full bg-gray-300" />
        <span className="text-gray-500 font-medium">Cargando...</span>
      </div>
    );
  }

  const { effectiveIsOpen } = getStoreOperationalState({
    operatingHours,
    isOpen,
    manualOperationalStatus,
    highDemandMode,
    serviceTypes,
  });
  const storeStatus = effectiveIsOpen ? "Abierto" : "Cerrado";

  return (
    <div className="flex items-center gap-1">
      <div
        className={`h-2 w-2 rounded-full ${
          effectiveIsOpen ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span
        className={
          effectiveIsOpen
            ? "text-green-600 font-medium"
            : "text-red-600 font-medium"
        }
      >
        {storeStatus}
      </span>
    </div>
  );
}
