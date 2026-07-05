import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/next";
import { esMX } from '@clerk/localizations';
import "./globals.css";
import { ClerkRedirectInterceptor } from "@/components/ClerkRedirectInterceptor";

export const metadata: Metadata = {
  title: "ElMenu",
  description:
    "Plataforma digital comunitaria para restaurantes, repartidores y clientes.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "ElMenu",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>
        <ClerkProvider
          localization={esMX}
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        >
          <ClerkRedirectInterceptor>{children}</ClerkRedirectInterceptor>
          <Analytics />
        </ClerkProvider>
      </body>
    </html>
  );
}
