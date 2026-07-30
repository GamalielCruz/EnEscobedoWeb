"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Menu,
  PackageCheck,
  Truck,
  WalletCards,
  Settings2,
  X,
} from "lucide-react";

import { DashboardPanel } from "@/components/dashboard/dashboard.design";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Pedidos", icon: ClipboardList },
  { href: "/admin/pending-products", label: "Aprobaciones", icon: PackageCheck },
  { href: "/admin/repartidores", label: "Repartidores", icon: Truck },
  { href: "/admin/finanzas", label: "Finanzas", icon: WalletCards },
  { href: "/admin/configuracion/comercial", label: "Configuración comercial", icon: Settings2 },
  { href: "/admin/configuracion/reparto", label: "Horarios de reparto", icon: Settings2 },
];

export function AdminShell({ children, className }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname() ?? "/admin";
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const activeItem =
    navItems.find(({ href }) =>
      href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
    ) ?? navItems[0];

  return (
    <div className={cn("min-h-screen bg-[#f5f5f6] text-gray-900", className)}>
      <div className="mx-auto flex min-h-screen max-w-[1580px]">
        {mobileOpen ? (
          <button
            type="button"
            aria-label="Cerrar menú"
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        ) : null}

        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-black/6 bg-[#fbfbfc] px-3 py-3 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-4 flex items-center justify-between px-2 py-1">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#850C22]">
                ElMenu.site
              </p>
              <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-950">
                Administración
              </h2>
            </div>
            <button
              type="button"
              aria-label="Cerrar menú"
              className="rounded-md p-2 text-gray-500 hover:bg-gray-100 md:hidden"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav aria-label="Secciones de administración" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item === activeItem;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-white text-gray-950 shadow-[inset_0_0_0_1px_rgba(17,24,39,0.06)]"
                      : "text-gray-600 hover:bg-white/80 hover:text-gray-900"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      active ? "bg-[#EB1902]" : "bg-transparent group-hover:bg-gray-300"
                    )}
                  />
                  <Icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-[#850C22]" : "text-gray-400 group-hover:text-gray-600"
                    )}
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-xl border border-black/6 bg-white px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
              Panel admin
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              Operación global, aprobaciones y seguimiento.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 px-4 pt-3 md:px-6 md:pt-4">
            <DashboardPanel className="overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Abrir menú"
                  className="h-8 w-8 rounded-full border-black/8 bg-white/90 text-gray-700 shadow-none md:hidden"
                  onClick={() => setMobileOpen(true)}
                >
                  <Menu className="h-4 w-4" />
                </Button>

                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    Panel administrativo
                  </p>
                  <p className="truncate text-sm font-semibold text-gray-950">{activeItem.label}</p>
                </div>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="ml-auto rounded-lg border-black/8 bg-[#fafafb] shadow-none"
                >
                  <Link href="/">
                    Ver tienda
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </DashboardPanel>
          </header>

          <main className="flex-1 pb-5 pt-4 md:px-6 md:pb-6 md:pt-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
