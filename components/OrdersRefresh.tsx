"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface OrdersRefreshProps {
  userId: string;
}

export function OrdersRefresh({ userId }: OrdersRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    // Refrescar los datos cada vez que el usuario entre a la página
    router.refresh();

    // Opcional: Refrescar automáticamente cada 30 segundos para capturar actualizaciones
    const interval = setInterval(() => {
      router.refresh();
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, [router]);

  return null; // Este componente no renderiza nada visible
}