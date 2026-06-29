"use client";

import { AlertCircle } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { DashboardPanel } from "./dashboard.design";
import type { OwnedStore } from "./dashboard.types";

type DashboardHeaderProps = {
  storeName: string;
  isOpen: boolean;
  highDemandMode: boolean;
  stores: OwnedStore[];
  selectedStoreId: string | null;
  onSelectStore: (storeId: string) => void;
  mobileMenuTrigger?: React.ReactNode;
};

export function DashboardHeader({
  storeName,
  isOpen,
  stores,
  selectedStoreId,
  onSelectStore,
  mobileMenuTrigger,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 px-4 pt-3 md:px-6 md:pt-4">
      <DashboardPanel className="overflow-hidden">
        <div className="flex items-center gap-3 px-3 py-2.5 md:px-4">
          {mobileMenuTrigger ? <div className="shrink-0 md:hidden">{mobileMenuTrigger}</div> : null}

          <div className="ml-auto flex min-w-0 flex-1 items-center gap-2 md:max-w-[300px]">
            {stores.length > 1 ? (
              <Select value={selectedStoreId ?? undefined} onValueChange={onSelectStore}>
                <SelectTrigger className="h-9 rounded-lg border-black/8 bg-[#fafafb] text-sm shadow-none">
                  <SelectValue placeholder="Selecciona una tienda" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-black/8 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
                  {stores.map((store) => (
                    <SelectItem key={store._id} value={store._id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-9 w-full items-center rounded-lg border border-black/8 bg-[#fafafb] px-3 text-sm text-gray-600">
                {storeName}
              </div>
            )}
          </div>
        </div>

        {!isOpen ? (
          <div className="border-t border-black/6 bg-[#fff8f7] px-4 py-2.5 text-sm text-[#850C22] md:px-5">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <span>La tienda esta cerrada. Los pedidos nuevos deberian permanecer bloqueados.</span>
            </div>
          </div>
        ) : null}
      </DashboardPanel>
    </header>
  );
}
