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
          "fixed inset-0 z-40 bg-black/30 transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onCloseMobile}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col border-r border-black/6 bg-[#fbfbfc] px-3 py-3 transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-4 flex items-center justify-between px-2 py-1">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#850C22]">
              EnEscobedo
            </p>
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-gray-950">
              Operacion de tienda
            </h2>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100 md:hidden"
            onClick={onCloseMobile}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1">
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            const active = currentSection === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onSectionChange(item.key)}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
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
                    "h-4 w-4 transition-colors",
                    active ? "text-[#850C22]" : "text-gray-400 group-hover:text-gray-600"
                  )}
                />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-black/6 bg-white px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Panel</p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            Gestion diaria, cambios y seguimiento sin salir del dashboard.
          </p>
        </div>
      </aside>
    </>
  );
}
