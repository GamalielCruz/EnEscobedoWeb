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
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
          Resumen operativo
        </p>
        <h1 className="mt-1 text-[18px] font-semibold tracking-[-0.01em] text-gray-950">
          Administración general
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-gray-600">
          Centraliza la operacion administrativa bajo `/admin` sin afectar el panel de duenos en `/dashboard`.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Card
              key={section.href}
              className="rounded-2xl border-black/6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
            >
              <CardHeader className="p-5">
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-[#fff3f4]">
                  <Icon className="h-4 w-4 text-[#850C22]" />
                </div>
                <CardTitle className="text-[17px]">{section.title}</CardTitle>
                <CardDescription>{section.description}</CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <Button
                  asChild
                  variant="outline"
                  className="w-full rounded-lg border-black/8 bg-white text-[#850C22] shadow-none hover:bg-[#fff3f4] hover:text-[#850C22]"
                >
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
