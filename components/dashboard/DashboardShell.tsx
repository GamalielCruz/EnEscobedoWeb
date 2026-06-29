"use client";

import * as React from "react";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";

import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";
import type { OwnedStore, SectionKey } from "./dashboard.types";

type DashboardShellProps = {
  currentSection: SectionKey;
  onSectionChange: (section: SectionKey) => void;
  storeName: string;
  stores: OwnedStore[];
  selectedStoreId: string | null;
  onSelectStore: (storeId: string) => void;
  isOpen: boolean;
  highDemandMode: boolean;
  children: React.ReactNode;
};

export function DashboardShell({
  currentSection,
  onSectionChange,
  storeName,
  stores,
  selectedStoreId,
  onSelectStore,
  isOpen,
  highDemandMode,
  children,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-[#f5f5f6] text-gray-900">
      <div className="mx-auto flex min-h-screen max-w-[1580px]">
        <DashboardSidebar
          currentSection={currentSection}
          onSectionChange={(section) => {
            onSectionChange(section);
            setMobileOpen(false);
          }}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardHeader
            storeName={storeName}
            stores={stores}
            selectedStoreId={selectedStoreId}
            onSelectStore={onSelectStore}
            isOpen={isOpen}
            highDemandMode={highDemandMode}
            mobileMenuTrigger={
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8 rounded-full border-black/8 bg-white/90 text-gray-700 shadow-none md:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
            }
          />

          <main className="flex-1 px-4 pb-5 pt-4 md:px-6 md:pb-6 md:pt-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
