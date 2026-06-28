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
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
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
                className="md:hidden"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
            }
          />

          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
