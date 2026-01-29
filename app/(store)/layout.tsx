import type { Metadata } from "next";
import "../globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import { SanityLive } from "@/sanity/lib/live";
import { SanityErrorBoundary } from "@/components/SanityErrorBoundary";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity";
import { DisableDraftMode } from "@/components/DisableDraftMode";
import Footer from "./Footer";
import { esMX } from '@clerk/localizations'
import CookieConsent from "@/components/cookie-consent";
import HydrationErrorSuppressor from "@/components/HydrationErrorSuppressor";

export const metadata: Metadata = {
  title: "En Escobedo | Plaza en linea",
  description: "La imaginación se imprime.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  openGraph: {
    title: "En Escobedo | Plaza en linea",
    description: "La imaginación se imprime.",
    images: ["/og-image.png"],
    url: "https://enescobedo.com",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider dynamic
        localization={esMX}   
    >
      <html lang="es">
        <body>
          <HydrationErrorSuppressor />
          {(await draftMode()).isEnabled && (
            <>
              <DisableDraftMode />
              <VisualEditing />
            </>
          )}
          <main>
            <Header />
            {children}
          </main>
          {process.env.NODE_ENV === 'development' && (
            <SanityErrorBoundary>
              <SanityLive />
            </SanityErrorBoundary>
          )}
          <Footer />
          <CookieConsent variant="mini"/>
        </body>
      </html>
    </ClerkProvider>
  );
}
