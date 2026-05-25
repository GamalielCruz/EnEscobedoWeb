import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity";
import { DisableDraftMode } from "@/components/DisableDraftMode";
import Footer from "./Footer";
import CookieConsent from "@/components/cookie-consent";
import HydrationErrorSuppressor from "@/components/HydrationErrorSuppressor";

export const metadata: Metadata = {
  title: "ElMenu | Digital comunitario",
  description: "La imaginación se imprime.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  openGraph: {
    title: "En Escobedo | Plaza en linea",
    description: "La imaginación se imprime.",
    images: ["/og-image.png"],
    url: "https://elmenu.site",
  },
};

export default async function StoreLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
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
      <Footer />
      <CookieConsent variant="mini"/>
    </>
  );
}
