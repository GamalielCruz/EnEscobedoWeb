/* next.config.js */
/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "development",
    NEXT_PUBLIC_VERCEL_URL: process.env.VERCEL_URL || "",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
      },
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: false,
  experimental: {
    scrollRestoration: true,
  },
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
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
        ],
      },
    ];
  },
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
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
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
};

module.exports = nextConfig;
