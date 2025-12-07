import { ClerkProvider } from '@clerk/nextjs';

// Configuración optimizada para móviles en producción
export const clerkConfig = {
  // Configuración para mejorar rendimiento en móviles
  appearance: {
    elements: {
      // Optimizar elementos para pantallas pequeñas
      card: "w-full max-w-md",
      headerTitle: "text-lg",
      headerSubtitle: "text-sm",
    },
  },
  // Configuración de red para móviles
  telemetry: process.env.NODE_ENV === 'production' ? false : true,
  // Configuración de timeout para conexiones lentas
  experimental: {
    // Aumentar timeouts para conexiones móviles lentas
    networkTimeout: 10000,
  },
};

// Configuración específica para producción
export const productionClerkConfig = {
  ...clerkConfig,
  // Deshabilitar características que pueden causar problemas en móviles
  experimental: {
    ...clerkConfig.experimental,
    // Configuraciones adicionales para producción
    enableSessionTokenCache: true,
  },
};