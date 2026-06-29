"use client";

import { ArrowRight, Package, Settings2, ShoppingBag } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  DashboardDescription,
  DashboardEmptyState,
  DashboardEyebrow,
  DashboardPanel,
  DashboardPanelBody,
  DashboardPanelHeader,
  DashboardStatusPill,
  DashboardTitle,
} from "./dashboard.design";
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
  manualOperationalStatus: "open" | "closed" | "auto";
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
  manualOperationalStatus,
  highDemandMode,
  savingConfig,
  onToggleOpen,
  onToggleHighDemand,
  onGoToOrders,
  onGoToProducts,
  onGoToStore,
}: DashboardHomeSectionProps) {
  const alertItems = [
    !isOpen ? "La tienda esta cerrada y los pedidos nuevos deben permanecer detenidos." : null,
    highDemandMode ? "Alta Demanda esta activa y el cliente ya ve un aviso de demoras." : null,
    metrics.pendingOrders > 0
      ? `${metrics.pendingOrders} pedidos requieren atencion inmediata.`
      : "No hay pedidos urgentes en cola.",
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <DashboardPanel tone={!isOpen ? "danger" : "subtle"} className="overflow-hidden">
        <DashboardPanelBody className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <DashboardEyebrow>Resumen operativo</DashboardEyebrow>
            <DashboardTitle className="mt-1 text-[18px]">
              {isOpen ? "La tienda esta operando" : "La tienda esta pausada"}
            </DashboardTitle>
            <DashboardDescription className="mt-1 max-w-3xl">
              Revisa estado actual, ventas del dia y acciones pendientes antes de entrar al detalle.
            </DashboardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DashboardStatusPill tone={isOpen ? "success" : "danger"}>
              {isOpen ? "Abierta" : "Cerrada"}
            </DashboardStatusPill>
            <DashboardStatusPill tone={highDemandMode ? "warning" : "neutral"}>
              {highDemandMode ? "Alta demanda" : "Flujo normal"}
            </DashboardStatusPill>
            <DashboardStatusPill tone={metrics.pendingOrders > 0 ? "brand" : "neutral"}>
              {metrics.pendingOrders > 0 ? `${metrics.pendingOrders} por atender` : "Sin pendientes"}
            </DashboardStatusPill>
          </div>
        </DashboardPanelBody>
      </DashboardPanel>

      <DashboardMetrics metrics={metrics} />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardQuickToggles
          isOpen={isOpen}
          manualOperationalStatus={manualOperationalStatus}
          highDemandMode={highDemandMode}
          saving={savingConfig}
          onToggleOpen={onToggleOpen}
          onToggleHighDemand={onToggleHighDemand}
        />

        <DashboardPanel>
          <DashboardPanelHeader>
            <DashboardEyebrow>Atajos</DashboardEyebrow>
            <DashboardTitle className="text-[17px]">Que necesita tu atencion</DashboardTitle>
            <DashboardDescription>
              Lleva la operacion a lo importante sin recorrer todo el panel.
            </DashboardDescription>
          </DashboardPanelHeader>
          <DashboardPanelBody className="space-y-3">
            <div className="space-y-2">
              {alertItems.map((alert) => (
                <div
                  key={alert}
                  className="rounded-lg border border-black/6 bg-[#fafafb] px-3 py-2 text-[13px] text-gray-700"
                >
                  {alert}
                </div>
              ))}
            </div>
            <div className="grid gap-2.5">
              <Button
                type="button"
                className="h-10 justify-between rounded-lg bg-[#EB1902] px-4 text-white hover:bg-[#850C22]"
                onClick={onGoToOrders}
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Revisar pedidos
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 justify-between rounded-lg border-black/8 bg-white px-4 hover:bg-gray-50"
                onClick={onGoToProducts}
              >
                <span className="flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Actualizar menu
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 justify-between rounded-lg border-black/8 bg-white px-4 hover:bg-gray-50"
                onClick={onGoToStore}
              >
                <span className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Ajustes de tienda
                </span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </DashboardPanelBody>
        </DashboardPanel>
      </div>

      <DashboardPanel>
        <DashboardPanelHeader align="spread">
          <div>
            <DashboardEyebrow>Actividad reciente</DashboardEyebrow>
            <DashboardTitle className="mt-1 text-[17px]">Pedidos activos</DashboardTitle>
            <DashboardDescription className="mt-1">
              Vista rapida de lo que sigue en cocina, entrega o pickup.
            </DashboardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 rounded-lg px-3 text-[#850C22] hover:bg-[#fff3f4] hover:text-[#850C22]"
              onClick={onGoToOrders}
            >
              Ver todos
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </DashboardPanelHeader>
        <DashboardPanelBody className="grid gap-3">
          {activeOrders.length === 0 ? (
            <DashboardEmptyState
              title="No hay pedidos activos"
              description="Cuando lleguen nuevos pedidos apareceran aqui para darles seguimiento rapido."
            />
          ) : (
            activeOrders.slice(0, 5).map((order) => <OrderCard key={order._id} order={order} compact />)
          )}
        </DashboardPanelBody>
      </DashboardPanel>
    </div>
  );
}
