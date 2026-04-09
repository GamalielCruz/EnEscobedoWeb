import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { esMX } from '@clerk/localizations';
import "./globals.css";
import { ClerkRedirectInterceptor } from "@/components/ClerkRedirectInterceptor";

export const metadata: Metadata = {
  title: "Store - Delivery & Pickup",
  description: "Order delivery and pickup management system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider 
      localization={esMX}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <ClerkRedirectInterceptor>
        <html lang="es">
          <body>
            {children}
          </body>
        </html>
      </ClerkRedirectInterceptor>
    </ClerkProvider>
  );
}
