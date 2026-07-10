import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Inter } from "next/font/google";
import { isAdminUser } from "@/lib/admin";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Admin Panel - Store",
  description: "Panel de administracion para gestionar ordenes y tienda",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  if (!isAdminUser(userId)) {
    redirect("/access-denied");
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${inter.className}`}>
      <header className="border-b bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">Panel de Administracion</h1>
            </div>
            <nav className="flex flex-wrap gap-2">
              <Link href="/admin" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Dashboard
              </Link>
              <Link href="/admin/orders" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Pedidos
              </Link>
              <Link href="/admin/pending-products" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Aprobaciones
              </Link>
              <Link href="/admin/repartidores" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Repartidores
              </Link>
              <Link href="/admin/finanzas" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Finanzas
              </Link>
              <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
                Volver a Tienda
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
