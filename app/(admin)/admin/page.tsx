import Link from "next/link";
import { AdminStoreOrder, type HomepageStore } from "@/components/admin/AdminStoreOrder";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, DollarSign, Package, Truck } from "lucide-react";
import { writeClient } from "@/sanity/lib/client";

const HOMEPAGE_STORES_QUERY = `*[
  _type == "affiliateStore" && isActive == true
] | order(coalesce(homepageOrder, 2147483647) asc, name asc) {
  _id, name, image, address
}`;
const sections = [
  {
    href: "/admin/orders",
    title: "Pedidos",
    description: "Consulta y actualiza pedidos delivery y pickup en una sola vista.",
    icon: ClipboardList,
  },
  {
    href: "/admin/pending-products",
    title: "Aprobaciones",
    description: "Revisa productos, tiendas y configuracion de entrega pendientes.",
    icon: Package,
  },
  {
    href: "/admin/repartidores",
    title: "Repartidores",
    description: "Espacio reservado para la administracion de repartidores.",
    icon: Truck,
  },
  {
    href: "/admin/finanzas",
    title: "Finanzas",
    description: "Consulta corte diario por tienda, repartidor y metodo de pago.",
    icon: DollarSign,
  },
];

export default async function AdminDashboardPage() {
  const stores = await writeClient.fetch<HomepageStore[]>(
    HOMEPAGE_STORES_QUERY,
    {},
    { cache: "no-store" }
  );
  return (
    <div className="space-y-6 px-4 sm:px-0">
      <div>
        <p className="text-sm font-medium uppercase tracking-wide text-[#ff8800]">Panel Admin</p>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard principal</h1>
        <p className="mt-2 max-w-2xl text-gray-600">
          Centraliza la operacion administrativa bajo `/admin` sin afectar el panel de duenos en `/dashboard`.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card key={section.href}>
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100">
                  <Icon className="h-6 w-6 text-[#ff8800]" />
                </div>
                <CardTitle>{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90">
                  <Link href={section.href}>Abrir seccion</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AdminStoreOrder stores={stores ?? []} />
    </div>
  );
}
