"use client";

import { useState, useEffect } from 'react';

export function useSanityImageFallback() {
  const [hasConnectionIssues, setHasConnectionIssues] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detectar dispositivo móvil
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
      setIsMobile(mobile);
    };

    checkMobile();

    // Probar conectividad con Sanity CDN
    const testSanityConnection = async () => {
      try {
        const testUrl = 'https://cdn.sanity.io/images/kgklfrat/production/test.jpg';
        const response = await fetch(testUrl, { 
          method: 'HEAD',
          mode: 'no-cors' // Para evitar problemas de CORS
        });
        
        // Si llegamos aquí sin error, la conexión funciona
        setHasConnectionIssues(false);
      } catch (error) {
        console.warn('Sanity CDN connection test failed:', error);
        setHasConnectionIssues(true);
      }
    };

    // Solo probar en móviles y en producción
    if (isMobile && process.env.NODE_ENV === 'production') {
      testSanityConnection();
    }

    // Monitorear cambios de conectividad
    const handleOnline = () => {
      setHasConnectionIssues(false);
      if (isMobile && process.env.NODE_ENV === 'production') {
        testSanityConnection();
      }
    };

    const handleOffline = () => {
      setHasConnectionIssues(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isMobile]);

  return {
    hasConnectionIssues,
    isMobile,
    shouldUseFallback: hasConnectionIssues && isMobile && process.env.NODE_ENV === 'production'
  };
}