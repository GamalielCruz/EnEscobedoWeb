import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verificar Tiendas Disponibles - Click & Collect",
  description: "Verifica si hay tiendas cercanas disponibles para el servicio Click & Collect antes de realizar tu compra.",
};

export default function CheckStoresLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}