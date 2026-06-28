"use client";

import { X } from "lucide-react";

import { cn } from "@/lib/utils";

import { sidebarItems } from "./dashboard.constants";
import type { SectionKey } from "./dashboard.types";

type DashboardSidebarProps = {
  currentSection: SectionKey;
  onSectionChange: (section: SectionKey) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

export function DashboardSidebar({
  currentSection,
  onSectionChange,
  mobileOpen,
  onCloseMobile,
}: DashboardSidebarProps) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-gray-200 bg-white p-4 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#ff8800]">
              Manager
            </p>
            <h2 className="text-xl font-bold text-gray-900">Panel del dueno</h2>
            <p className="text-sm text-gray-500">Operacion diaria de la tienda</p>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 md:hidden"
            onClick={onCloseMobile}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-2">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = currentSection === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSectionChange(item.key)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm font-medium transition-colors",
                  active
                    ? "border-orange-100 bg-orange-50 text-[#eb1902]"
                    : "border-transparent text-gray-600 hover:border-gray-200 hover:bg-gray-50 hover:text-gray-900"
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-orange-100 bg-orange-50 p-4">
          <p className="text-sm font-semibold text-gray-900">Control rapido</p>
          <p className="mt-1 text-sm text-gray-600">
            Cambia de seccion y administra varias tiendas desde un solo panel.
          </p>
        </div>
      </aside>
    </>
  );
}
