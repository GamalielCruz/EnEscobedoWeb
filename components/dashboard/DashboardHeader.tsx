"use client";

import { AlertCircle, Store } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  DashboardDescription,
  DashboardEyebrow,
  DashboardPanel,
  DashboardStatusPill,
  DashboardTitle,
} from "./dashboard.design";
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
  highDemandMode,
  stores,
  selectedStoreId,
  onSelectStore,
  mobileMenuTrigger,
}: DashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-30 px-4 pt-4 md:px-6 md:pt-5">
      <DashboardPanel className="overflow-hidden">
        <div className="flex flex-col gap-4 px-4 py-3 md:flex-row md:items-center md:justify-between md:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {mobileMenuTrigger}
            <div className="min-w-0">
              <DashboardEyebrow className="mb-1">Dashboard del negocio</DashboardEyebrow>
              <div className="flex min-w-0 items-center gap-2">
                <DashboardTitle className="truncate text-[20px]">{storeName}</DashboardTitle>
                <DashboardStatusPill tone={isOpen ? "success" : "danger"}>
                  {isOpen ? "Abierta" : "Cerrada"}
                </DashboardStatusPill>
                {highDemandMode ? (
                  <DashboardStatusPill tone="warning">Alta demanda</DashboardStatusPill>
                ) : null}
              </div>
              <DashboardDescription className="mt-1 flex items-center gap-2 text-[13px]">
                <Store className="h-3.5 w-3.5 text-gray-400" />
                Controla pedidos, productos y operacion desde una sola barra de trabajo.
              </DashboardDescription>
            </div>
          </div>

          <div className="flex min-w-[240px] items-center gap-2 md:max-w-[300px]">
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
