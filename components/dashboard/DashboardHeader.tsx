"use client";

import { AlertCircle, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="flex flex-col gap-4 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {mobileMenuTrigger}
            <div>
              <p className="text-sm text-gray-500">Tienda seleccionada</p>
              <h1 className="text-2xl font-bold text-gray-900">{storeName}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge className={isOpen ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-red-100 text-red-700 hover:bg-red-100"}>
              {isOpen ? "Abierta" : "Cerrada"}
            </Badge>
            {highDemandMode ? (
              <Badge className="bg-orange-100 text-[#eb1902] hover:bg-orange-100">
                Alta demanda activa
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Store className="h-4 w-4 text-[#ff8800]" />
            <span>Administra pedidos, productos y configuracion desde un solo lugar.</span>
          </div>

          <div className="flex min-w-[240px] items-center gap-2">
            {stores.length > 1 ? (
              <Select value={selectedStoreId ?? undefined} onValueChange={onSelectStore}>
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Selecciona una tienda" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((store) => (
                    <SelectItem key={store._id} value={store._id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="flex h-10 items-center rounded-md border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
                {storeName}
              </div>
            )}
          </div>
        </div>

        {!isOpen ? (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>La tienda esta marcada como cerrada y no deberia aceptar nuevos pedidos.</span>
          </div>
        ) : null}
      </div>
    </header>
  );
}
