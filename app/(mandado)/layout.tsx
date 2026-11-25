import { MandadoHeader } from "@/components/MandadoHeader";

/**
 * Layout de MANDADOS — "app" separada del restaurante.
 *
 * A diferencia del layout de la tienda (app/(store)/layout.tsx) que monta el
 * Header y Footer de restaurante, este layout solo pinta el header propio de
 * mandados. Así el checkout de mandados (/mandado/basket) nunca comparte
 * superficie ni navegación con el carrito de restaurantes.
 */
export default function MandadoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-gray-50">
      <MandadoHeader />
      <main>{children}</main>
    </div>
  );
}
