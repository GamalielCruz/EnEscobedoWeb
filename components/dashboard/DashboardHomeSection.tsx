"use client";

import { ArrowRight, Package, Settings2, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { DashboardMetrics } from "./DashboardMetrics";
import { DashboardQuickToggles } from "./DashboardQuickToggles";
import { OrderCard } from "./OrderCard";
import type { DashboardOrder } from "./dashboard.types";

type DashboardHomeSectionProps = {
  metrics: {
    ordersToday: number;
    revenueToday: number;
    pendingOrders: number;
    activeProducts: number;
  };
  activeOrders: DashboardOrder[];
  isOpen: boolean;
  highDemandMode: boolean;
  savingConfig: boolean;
  onToggleOpen: (nextValue: boolean) => void;
  onToggleHighDemand: (nextValue: boolean) => void;
  onGoToOrders: () => void;
  onGoToProducts: () => void;
  onGoToStore: () => void;
};

export function DashboardHomeSection({
  metrics,
  activeOrders,
  isOpen,
  highDemandMode,
  savingConfig,
  onToggleOpen,
  onToggleHighDemand,
  onGoToOrders,
  onGoToProducts,
  onGoToStore,
}: DashboardHomeSectionProps) {
  return (
    <div className="space-y-6">
      <DashboardMetrics metrics={metrics} />

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <DashboardQuickToggles
          isOpen={isOpen}
          highDemandMode={highDemandMode}
          saving={savingConfig}
          onToggleOpen={onToggleOpen}
          onToggleHighDemand={onToggleHighDemand}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Accesos directos</CardTitle>
            <CardDescription>Atajos para las tareas mas usadas del dia.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button
              type="button"
              className="justify-between bg-[#ff8800] text-gray-900 hover:bg-[#ff8800]/90"
              onClick={onGoToOrders}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />
                Ver pedidos
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" className="justify-between" onClick={onGoToProducts}>
              <span className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Gestionar productos
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" className="justify-between" onClick={onGoToStore}>
              <span className="flex items-center gap-2">
                <Settings2 className="h-4 w-4" />
                Configurar tienda
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg">Pedidos activos</CardTitle>
            <CardDescription>Vista rapida de los pedidos pendientes mas recientes.</CardDescription>
          </div>
          <Button type="button" variant="ghost" className="text-[#eb1902]" onClick={onGoToOrders}>
            Ver todos
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          {activeOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-10 text-center text-gray-500">
              No hay pedidos activos en este momento.
            </div>
          ) : (
            activeOrders.slice(0, 5).map((order) => <OrderCard key={order._id} order={order} compact />)
          )}
        </CardContent>
      </Card>
    </div>
  );
}
