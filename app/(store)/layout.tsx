import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { draftMode } from "next/headers";
import { VisualEditing } from "next-sanity";
import { DisableDraftMode } from "@/components/DisableDraftMode";
import Footer from "./Footer";
import CookieConsent from "@/components/cookie-consent";
import HydrationErrorSuppressor from "@/components/HydrationErrorSuppressor";
import { getPublicBaseUrl } from "@/lib/urls";

export const metadata: Metadata = {
  title: "ElMenu",
  description: "Tu Menu en línea.",
  metadataBase: new URL(getPublicBaseUrl()),
  openGraph: {
    title: "En Escobedo | Plaza en linea",
    description: "Tu Menu en línea.",
    images: ["/open.png"],
    url: getPublicBaseUrl(),
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
