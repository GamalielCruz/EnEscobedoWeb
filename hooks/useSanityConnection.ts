"use client";

import { useEffect, useState } from 'react';

export function useSanityConnection() {
  const [isConnected, setIsConnected] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detectar dispositivo móvil
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
      setIsMobile(mobile);
    };

    checkMobile();

    // Monitorear conexión de red
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Verificar estado inicial de la conexión
    setIsConnected(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return {
    isConnected,
    isMobile,
    shouldUseLive: isConnected && (!isMobile || process.env.NODE_ENV !== 'production')
  };
}