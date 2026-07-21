"use client";

import * as React from "react";
import { Filter, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
import { statusConfig } from "./dashboard.constants";
import { OrderCard } from "./OrderCard";
import type { DashboardOrder, OrderFilterState, OrderViewKey } from "./dashboard.types";

type DashboardOrdersSectionProps = {
  activeOrders: DashboardOrder[];
  todayOrders: DashboardOrder[];
  historyOrders: DashboardOrder[];
  currentOrdersLoading: boolean;
  currentLastUpdate: Date | null;
  updatingOrderNumber: string | null;
  onRefreshActiveOrders: () => void;
  onRefreshTodayOrders: () => void;
  onRefreshHistoryOrders: () => void;
  onUpdateOrderStatus: (orderId: string, orderNumber: string, status: string) => void;
};

export function DashboardOrdersSection({
  activeOrders,
  todayOrders,
  historyOrders,
  currentOrdersLoading,
  currentLastUpdate,
  updatingOrderNumber,
  onRefreshActiveOrders,
  onRefreshTodayOrders,
  onRefreshHistoryOrders,
  onUpdateOrderStatus,
}: DashboardOrdersSectionProps) {
  const [view, setView] = React.useState<OrderViewKey>("activos");
  const [filters, setFilters] = React.useState<OrderFilterState>({ type: "all", status: "all" });

  const sourceOrders =
    view === "activos" ? activeOrders : view === "hoy" ? todayOrders : historyOrders;

  const filteredOrders = React.useMemo(
    () =>
      sourceOrders.filter((order) => {
        const matchesType = filters.type === "all" || order.deliveryMethod === filters.type;
        const matchesStatus = filters.status === "all" || order.status === filters.status;
        return matchesType && matchesStatus;
      }),
    [sourceOrders, filters]
  );

  const refreshCurrent =
    view === "activos"
      ? onRefreshActiveOrders
      : view === "hoy"
        ? onRefreshTodayOrders
        : onRefreshHistoryOrders;

  return (
    <DashboardPanel>
      <DashboardPanelHeader align="spread" className="gap-4">
        <div>
          <DashboardEyebrow>Pedidos</DashboardEyebrow>
          <DashboardTitle className="mt-1">Cola operativa</DashboardTitle>
          <DashboardDescription className="mt-1">
            Prioriza, filtra y cambia estados sin perder tiempo.
          </DashboardDescription>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <DashboardStatusPill tone={filteredOrders.length > 0 ? "brand" : "neutral"}>
            {filteredOrders.length} visibles
          </DashboardStatusPill>
          {currentLastUpdate ? (
            <DashboardStatusPill tone="neutral">
              Actualizado {currentLastUpdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </DashboardStatusPill>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-black/8 px-2.5 shadow-none hover:bg-gray-50"
            onClick={refreshCurrent}
          >
            <RefreshCw className={`h-4 w-4 ${currentOrdersLoading ? "animate-spin" : ""}`} />
            <span className="sr-only">Actualizar pedidos</span>
          </Button>
        </div>
      </DashboardPanelHeader>

      <DashboardPanelBody className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <Tabs value={view} onValueChange={(value) => setView(value as OrderViewKey)}>
            <TabsList className="grid h-10 w-full grid-cols-3 rounded-lg border border-black/6 bg-[#f6f6f7] p-1 md:w-[360px]">
              <TabsTrigger
                value="activos"
                className="rounded-md text-[13px] font-medium data-[state=active]:bg-white data-[state=active]:text-gray-950 data-[state=active]:shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              >
                Activos
              </TabsTrigger>
              <TabsTrigger
                value="hoy"
                className="rounded-md text-[13px] font-medium data-[state=active]:bg-white data-[state=active]:text-gray-950 data-[state=active]:shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              >
                Hoy
              </TabsTrigger>
              <TabsTrigger
                value="historial"
                className="rounded-md text-[13px] font-medium data-[state=active]:bg-white data-[state=active]:text-gray-950 data-[state=active]:shadow-[0_1px_2px_rgba(15,23,42,0.06)]"
              >
                Historial
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
              <Filter className="h-3.5 w-3.5" />
              Filtros
            </div>
            <Select
              value={filters.type}
              onValueChange={(value: OrderFilterState["type"]) =>
                setFilters((current) => ({ ...current, type: value }))
              }
            >
              <SelectTrigger className="h-9 w-full rounded-lg border-black/8 bg-white text-sm shadow-none sm:w-[170px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-black/8 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="home_delivery">Delivery</SelectItem>
                <SelectItem value="click_collect">Pickup</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.status}
              onValueChange={(value) =>
                setFilters((current) => ({ ...current, status: value }))
              }
            >
              <SelectTrigger className="h-9 w-full rounded-lg border-black/8 bg-white text-sm shadow-none sm:w-[210px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-black/8 shadow-[0_10px_28px_rgba(15,23,42,0.08)]">
                <SelectItem value="all">Todos los estados</SelectItem>
                {Object.entries(statusConfig).map(([value, config]) => (
                  <SelectItem key={value} value={value}>
                    {config.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <DashboardEmptyState
            title="No hay pedidos para mostrar"
            description="Prueba otro filtro o espera nuevas ordenes."
          />
        ) : (
          filteredOrders.map((order) => (
            <OrderCard
              key={order._id}
              order={order}
              updating={updatingOrderNumber === order.orderNumber}
              onUpdateStatus={onUpdateOrderStatus}
              onRefresh={refreshCurrent}
            />
          ))
        )}
        </div>
      </DashboardPanelBody>
    </DashboardPanel>
  );
}
