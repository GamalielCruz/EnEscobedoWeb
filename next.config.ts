import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
      {
        protocol: "https",
        hostname: "coreva-normal.trae.ai",
      },
    ],
    // Optimizaciones para móviles
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Configuración para mejorar rendimiento en móviles
  experimental: {
    // optimizeCss: true, // Deshabilitado temporalmente por problemas con critters
    scrollRestoration: true,
  },
  // Configuración para suprimir errores de hidratación
  reactStrictMode: false, // Deshabilitado para evitar errores de devtools
  // Suprimir warnings de hidratación en desarrollo
  onDemandEntries: {
    // Período en ms para mantener las páginas en memoria
    maxInactiveAge: 25 * 1000,
    // Número de páginas que deben mantenerse simultáneamente
    pagesBufferLength: 2,
  },
  // Headers de seguridad y rendimiento
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          // Mejorar caching para móviles
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
  // Configuración de webpack para suprimir warnings
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Suprimir warnings específicos de hidratación
      config.ignoreWarnings = [
        /Hydration failed/,
        /There was an error while hydrating/,
        /Text content does not match server-rendered HTML/,
        /Warning: Text content did not match/,
        /Warning: Expected server HTML to contain/,
        /Warning: Prop .* did not match/,
        /emitPendingHydrationWarnings/,
        /createConsoleError/,
        /handleConsoleError/,
        /intercept-console-error/,
        /webpack.cache.PackFileCacheStrategy/,
        /Serializing big strings/,
      ];
    }
    return config;
  },
  // Configuración adicional para suprimir errores de hidratación
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

export default nextConfig;
